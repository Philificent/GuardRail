(function () {
  const state = { jsKillswitchEnabled: true };
  const report = (payload) => {
    window.postMessage(
      { type: "GUARDRAIL_JS_EVENT", ...payload },
      window.location.origin,
    );
  };

  window.addEventListener("message", (event) => {
    if (
      event.source !== window ||
      event.origin !== window.location.origin ||
      !event.data
    ) {
      return;
    }

    if (event.data.type === "GUARDRAIL_CONFIG_INTERNAL") {
      state.jsKillswitchEnabled = Boolean(event.data.jsKillswitchEnabled);
    }
  });

  const originalGUM = navigator.mediaDevices.getUserMedia.bind(
    navigator.mediaDevices,
  );
  navigator.mediaDevices.getUserMedia = async function (c) {
    window.postMessage(
      { type: "GUARDRAIL_MEDIA_INTERNAL", constraints: c },
      window.location.origin,
    );
    return originalGUM(c);
  };

  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (
      typeof type === "string" &&
      ["beforeunload", "unload", "pagehide"].includes(type)
    ) {
      report({
        severity: "medium",
        title: "Unload Hook Registered",
        desc: `The page registered a ${type} handler.`,
        kind: "unload-hook",
        note: "Unload hooks are often used for pop-unders, tracking beacons, or exit interception.",
      });
      if (
        state.jsKillswitchEnabled &&
        (type === "beforeunload" || type === "unload")
      ) {
        return;
      }
    }

    return originalAddEventListener.call(this, type, listener, options);
  };

  const originalSetInterval = window.setInterval.bind(window);
  window.setInterval = function (handler, timeout, ...args) {
    if (typeof timeout === "number" && timeout >= 5000) {
      report({
        severity: "low",
        title: "Background Timer",
        desc: `A repeating timer was registered for ${timeout}ms.`,
        kind: "background-timer",
      });
      if (state.jsKillswitchEnabled && document.hidden) {
        return 0;
      }
    }

    return originalSetInterval(handler, timeout, ...args);
  };

  if (typeof window.requestIdleCallback === "function") {
    const originalIdleCallback = window.requestIdleCallback.bind(window);
    window.requestIdleCallback = function (callback, options) {
      report({
        severity: "low",
        title: "Idle Callback Registered",
        desc: "The page scheduled background work with requestIdleCallback.",
        kind: "idle-work",
      });
      if (state.jsKillswitchEnabled) {
        return 0;
      }
      return originalIdleCallback(callback, options);
    };
  }

  const originalWindowOpen = window.open.bind(window);
  window.open = function (...args) {
    report({
      severity: "high",
      title: "Pop-up Attempt",
      desc: "The page attempted to open a new window or pop-under.",
      kind: "popup-attempt",
      target: String(args[0] || ""),
      domain: args[0] || "",
    });
    if (state.jsKillswitchEnabled) {
      return null;
    }
    return originalWindowOpen(...args);
  };

  const originalTitleDescriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "title",
  );
  if (originalTitleDescriptor?.set) {
    Object.defineProperty(document, "title", {
      configurable: true,
      enumerable: originalTitleDescriptor.enumerable,
      get() {
        return originalTitleDescriptor.get.call(document);
      },
      set(value) {
        if (document.hidden) {
          report({
            severity: "medium",
            title: "Background Tab Rename",
            desc: `The page changed the tab title while hidden to "${String(value).slice(0, 80)}".`,
            kind: "tab-rename",
          });
          if (state.jsKillswitchEnabled) {
            return value;
          }
        }

        return originalTitleDescriptor.set.call(document, value);
      },
    });
  }

  const observeMedia = () => {
    const mediaElements = document.querySelectorAll("video, audio");
    mediaElements.forEach((media) => {
      const isHidden =
        media.hidden ||
        media.offsetParent === null ||
        media.muted ||
        media.volume === 0;
      const hasAutoplay = media.autoplay || media.hasAttribute("autoplay");
      if (hasAutoplay && isHidden) {
        report({
          severity: "medium",
          title: "Hidden Background Media",
          desc: "Detected autoplaying hidden media that can waste bandwidth in the background.",
          kind: "background-media",
          note: media.currentSrc || media.src || null,
        });
        if (state.jsKillswitchEnabled) {
          media.pause?.();
          media.removeAttribute("autoplay");
        }
      }
    });
  };

  const observer = new MutationObserver(() => observeMedia());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });
  document.addEventListener("visibilitychange", observeMedia, true);
  setTimeout(observeMedia, 1500);
})();
