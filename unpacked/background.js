const CORE_RULE_IDS = {
  panicBlock: 1,
  spoofHeaders: 2,
};
const BLOCKLIST_RULE_BASE = 1000;
const MAX_LOGS = 100;
const navigationHistory = {};
const SPOOF_PROFILE = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0",
  referer: "removed",
};

chrome.runtime.onInstalled.addListener(() => {
  reapplySettings();
  chrome.storage.local.get({ logs: [] }, ({ logs }) => updateActionBadge(logs));
});

chrome.runtime.onStartup.addListener(() => {
  reapplySettings();
  chrome.storage.local.get({ logs: [] }, ({ logs }) => updateActionBadge(logs));
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes.logs) {
    updateActionBadge(changes.logs.newValue || []);
  }

  if (changes.shieldEnabled || changes.whitelist || changes.blocklist) {
    chrome.storage.local.get(
      { shieldEnabled: false, whitelist: [], blocklist: [] },
      ({ shieldEnabled, whitelist, blocklist }) => {
        toggleKillSwitch(shieldEnabled, whitelist, blocklist);
      },
    );
  }

  if (changes.spoofEnabled) {
    toggleSpoofing(Boolean(changes.spoofEnabled.newValue));
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) {
    return;
  }

  try {
    navigationHistory[details.tabId] = new URL(details.url).hostname;
  } catch (error) {
    delete navigationHistory[details.tabId];
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete navigationHistory[tabId];
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    handlePotentialExfiltration(details);
  },
  { urls: ["<all_urls>"] },
);

async function handlePotentialExfiltration(details) {
    if (details.tabId < 0) {
      return;
    }

    const currentHost = navigationHistory[details.tabId];
    if (!currentHost) {
      return;
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(details.url);
    } catch (error) {
      return;
    }

    const targetHost = parsedUrl.hostname;
    if (parsedUrl.protocol === "chrome-extension:" && targetHost === chrome.runtime.id) {
      return;
    }

    if (!isCrossDomain(currentHost, targetHost)) {
      return;
    }

    const blocklist = await getStoredBlocklist();
    const wasBlocked = blocklist.includes(targetHost);
    const extensionContext = await getExtensionContext(parsedUrl);
    const eventTitle = wasBlocked
      ? (extensionContext ? "Blocked Extension Transfer" : "Blocked Data Exfiltration")
      : (extensionContext ? "Extension Data Transfer" : "Data Exfiltration");
    const eventDesc = wasBlocked
      ? (extensionContext
          ? `Blocked request to extension: ${extensionContext.label}. Request was not sent.`
          : `Blocked request to: ${targetHost}. Request was not sent.`)
      : (extensionContext
          ? `Data sent to extension: ${extensionContext.label}`
          : `Data sent to: ${targetHost}`);
    const event = {
      severity: "high",
      title: eventTitle,
      desc: eventDesc,
      site: currentHost,
      actions: extensionContext
        ? []
        : [{ type: "block-domain", label: "Add to Blocklist", domain: targetHost }],
      details: {
        kind: "network-request",
        method: details.method,
        url: parsedUrl.origin + parsedUrl.pathname,
        type: details.type,
        initiator: details.initiator || null,
        targetHost,
        targetLabel: extensionContext?.label || targetHost,
        extensionId: extensionContext?.id || null,
        extensionName: extensionContext?.name || null,
        blocked: wasBlocked,
        query: parsedUrl.search ? "[REDACTED]" : "",
      },
    };

    persistEvent(event);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "LOG_EVENT") {
    persistEvent({
      severity: request.severity,
      title: request.title,
      desc: request.desc,
      site: request.site || getSenderSite(sender),
      actions: request.actions || [],
      details: request.details || null,
    });
    return false;
  }

  if (request.type === "TOGGLE_SHIELD") {
    chrome.storage.local.set({ shieldEnabled: request.enabled });
    return false;
  }

  if (request.type === "TOGGLE_SPOOF") {
    chrome.storage.local.set({ spoofEnabled: request.enabled });
    return false;
  }

  if (request.type === "TOGGLE_JS_KILLSWITCH") {
    chrome.storage.local.set({ jsKillswitchEnabled: request.enabled });
    return false;
  }

  if (request.type === "WIPE_CURRENT_TAB") {
    nukeSite();
    return false;
  }

  if (request.type === "ADD_BLOCKLIST_DOMAIN") {
    addDomainToBlocklist(request.domain).then((result) => sendResponse(result));
    return true;
  }

  if (request.type === "REMOVE_BLOCKLIST_DOMAIN") {
    removeDomainFromBlocklist(request.domain).then((result) => sendResponse(result));
    return true;
  }

  if (request.type === "ADD_BLOCKLIST_BULK") {
    addDomainsToBlocklist(request.domains).then((result) => sendResponse(result));
    return true;
  }

  if (request.type === "GET_SETTINGS") {
    chrome.storage.local.get(
      {
        shieldEnabled: false,
        spoofEnabled: false,
        jsKillswitchEnabled: true,
        whitelist: [],
        blocklist: [],
        spoofProfile: SPOOF_PROFILE,
      },
      (settings) => sendResponse(settings),
    );
    return true;
  }

  return false;
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  const parts = notificationId.split(":");
  if (parts[0] !== "guardrail" || parts[1] !== "block" || buttonIndex !== 0) {
    return;
  }

  addDomainToBlocklist(parts.slice(2).join(":"));
  chrome.notifications.clear(notificationId);
});

chrome.notifications.onClicked.addListener(() => {
  chrome.windows.getLastFocused({ populate: true }, (window) => {
    const activeTab = window?.tabs?.find((tab) => tab.active);
    if (!activeTab?.id) {
      return;
    }
    chrome.sidePanel.open({ tabId: activeTab.id });
  });
});

async function reapplySettings() {
  chrome.storage.local.get(
    { shieldEnabled: false, spoofEnabled: false, whitelist: [], blocklist: [] },
    ({ shieldEnabled, spoofEnabled, whitelist, blocklist }) => {
      toggleKillSwitch(shieldEnabled, whitelist, blocklist);
      toggleSpoofing(spoofEnabled);
    },
  );
}

async function toggleSpoofing(isEnabled) {
  if (isEnabled) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: CORE_RULE_IDS.spoofHeaders,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "user-agent",
              operation: "set",
              value: SPOOF_PROFILE.userAgent,
            },
            { header: "referer", operation: "remove" },
          ],
        },
        condition: { resourceTypes: ["main_frame", "sub_frame"], domainType: "thirdParty" },
      }],
      removeRuleIds: [CORE_RULE_IDS.spoofHeaders],
    });
    return;
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [CORE_RULE_IDS.spoofHeaders],
  });
}

chrome.runtime.onMessage.addListener((request, sender) => {
  if (request.type === "LOG_EVENT") {
    logEvent(request.severity, request.title, request.desc);
  }

  // Security: Only allow sensitive actions from internal extension pages (e.g. side panel)
  const isInternal =
    !sender.tab &&
    sender.url &&
    sender.url.startsWith(chrome.runtime.getURL(""));

  if (isInternal) {
    if (request.type === "TOGGLE_SHIELD") toggleKillSwitch(request.enabled);
    if (request.type === "WIPE_CURRENT_TAB") nukeSite();
  }
});
async function toggleKillSwitch(isEnabled, whitelist = [], blocklist = []) {
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removableIds = [];
  for (let i = 0; i < existingRules.length; i++) {
    const id = existingRules[i].id;
    if (id === CORE_RULE_IDS.panicBlock || id >= BLOCKLIST_RULE_BASE) {
      removableIds.push(id);
    }
  }
  const addRules = [];

  if (isEnabled) {
    addRules.push({
      id: CORE_RULE_IDS.panicBlock,
      priority: 1,
      action: { type: "block" },
      condition: {
        resourceTypes: ["script", "xmlhttprequest", "sub_frame", "media"],
        domainType: "thirdParty",
        excludedInitiatorDomains: whitelist,
      },
    });
  }

  blocklist.forEach((domain, index) => {
    addRules.push({
      id: BLOCKLIST_RULE_BASE + index,
      priority: 2,
      action: { type: "block" },
      condition: {
        requestDomains: [domain],
        resourceTypes: [
          "main_frame",
          "sub_frame",
          "script",
          "xmlhttprequest",
          "image",
          "media",
          "ping",
        ],
      },
    });
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removableIds,
    addRules,
  });
}

function nukeSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const currentTab = tabs[0];
    if (!currentTab?.url) {
      return;
    }

    const origin = new URL(currentTab.url).origin;
    chrome.browsingData.remove(
      { origins: [origin] },
      { cache: true, cookies: true, localStorage: true },
      () => {
        persistEvent({
          severity: "high",
          title: "Site Reset",
          desc: "Cleared local data.",
          site: new URL(currentTab.url).hostname,
        });
        chrome.tabs.reload(currentTab.id);
      },
    );
  });
}

function persistEvent(eventInput) {
  const event = normalizeEvent(eventInput);
  chrome.storage.local.get({ logs: [] }, (data) => {
    const logs = [event, ...data.logs].slice(0, MAX_LOGS);
    chrome.storage.local.set({ logs }, () => {
      updateActionBadge(logs);
      chrome.runtime.sendMessage({ type: "UPDATE_UI" }).catch(() => {});
      maybeNotify(event);
    });
  });
}

function normalizeEvent(eventInput) {
  return {
    id: eventInput.id || crypto.randomUUID(),
    time: eventInput.time || new Date().toLocaleTimeString(),
    timestamp: eventInput.timestamp || Date.now(),
    severity: eventInput.severity || "medium",
    title: eventInput.title || "GuardRail Event",
    desc: eventInput.desc || "",
    site: eventInput.site || "Unknown Site",
    actions: Array.isArray(eventInput.actions) ? eventInput.actions : [],
    details: eventInput.details || null,
  };
}

function maybeNotify(event) {
  if (event.severity !== "high") {
    return;
  }

  const buttons = [];
  let notificationId = `guardrail:event:${event.id}`;
  const blockAction = event.actions.find((action) => action.type === "block-domain" && action.domain);
  if (blockAction) {
    buttons.push({ title: `Block ${blockAction.domain}` });
    notificationId = `guardrail:block:${blockAction.domain}`;
  }

  chrome.notifications.create(notificationId, {
    type: "basic",
    iconUrl: "icon.png",
    title: event.title,
    message: event.desc,
    buttons,
    priority: 2,
  });
}

async function addDomainToBlocklist(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { ok: false, error: "Invalid domain." };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get({ blocklist: [] }, async ({ blocklist }) => {
      if (blocklist.includes(normalized)) {
        resolve({ ok: true, status: "exists", domain: normalized });
        return;
      }

      const next = [...blocklist, normalized].sort();
      chrome.storage.local.set({ blocklist: next }, async () => {
        await toggleKillSwitchFromStorage();
        persistEvent({
          severity: "medium",
          title: "Domain Blocked",
          desc: `${normalized} added to the blocklist.`,
          site: normalized,
          details: {
            kind: "blocklist-update",
            domain: normalized,
            source: "user-action",
          },
        });
        resolve({ ok: true, status: "added", domain: normalized });
      });
    });
  });
}

async function removeDomainFromBlocklist(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return { ok: false, error: "Invalid domain." };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get({ blocklist: [] }, async ({ blocklist }) => {
      if (!blocklist.includes(normalized)) {
        resolve({ ok: true, status: "missing", domain: normalized });
        return;
      }

      const next = blocklist.filter((entry) => entry !== normalized);
      chrome.storage.local.set({ blocklist: next }, async () => {
        await toggleKillSwitchFromStorage();
        persistEvent({
          severity: "low",
          title: "Domain Unblocked",
          desc: `${normalized} removed from the blocklist.`,
          site: normalized,
          details: {
            kind: "blocklist-update",
            domain: normalized,
            source: "user-action",
            operation: "remove",
          },
        });
        resolve({ ok: true, status: "removed", domain: normalized });
      });
    });
  });
}

async function addDomainsToBlocklist(domains) {
  if (!Array.isArray(domains) || domains.length === 0) {
    return { ok: false, error: "No domains provided." };
  }

  const normalized = [...new Set(domains.map((domain) => normalizeDomain(domain)).filter(Boolean))];
  if (normalized.length === 0) {
    return { ok: false, error: "No valid domains found." };
  }

  return new Promise((resolve) => {
    chrome.storage.local.get({ blocklist: [] }, async ({ blocklist }) => {
      const existing = new Set(blocklist);
      const added = normalized.filter((domain) => !existing.has(domain));
      if (added.length === 0) {
        resolve({ ok: true, status: "exists", added: [], total: blocklist.length });
        return;
      }

      const next = [...blocklist, ...added].sort();
      chrome.storage.local.set({ blocklist: next }, async () => {
        await toggleKillSwitchFromStorage();
        persistEvent({
          severity: "medium",
          title: "Bulk Blocklist Update",
          desc: `Added ${added.length} domain${added.length === 1 ? "" : "s"} to the blocklist.`,
          site: added[0],
          details: {
            kind: "blocklist-update",
            domains: added,
            source: "bulk-import",
            operation: "add",
          },
        });
        resolve({ ok: true, status: "added", added, total: next.length });
      });
    });
  });
}

async function toggleKillSwitchFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      { shieldEnabled: false, whitelist: [], blocklist: [] },
      async ({ shieldEnabled, whitelist, blocklist }) => {
        await toggleKillSwitch(shieldEnabled, whitelist, blocklist);
        resolve();
      },
    );
  });
}

async function getStoredBlocklist() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ blocklist: [] }, ({ blocklist }) => {
      resolve(blocklist);
    });
  });
}

function getSenderSite(sender) {
  try {
    return sender.tab?.url ? new URL(sender.tab.url).hostname : "Unknown Site";
  } catch (error) {
    return "Unknown Site";
  }
}

function isCrossDomain(currentHost, targetHost) {
  return Boolean(
    currentHost &&
      targetHost &&
      targetHost !== currentHost &&
      !targetHost.endsWith(`.${currentHost}`),
  );
}

function normalizeDomain(domain) {
  if (!domain || typeof domain !== "string") {
    return null;
  }

  const value = domain.trim().toLowerCase();
  if (!value) {
    return null;
  }

  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname;
  } catch (error) {
    return null;
  }
}

function updateActionBadge(logs) {
  const actionable = logs
    .slice(0, 20)
    .filter((entry) => entry.severity === "high" || entry.severity === "medium");

  if (actionable.length === 0) {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: "Open GuardRail" });
    return;
  }

  const highCount = actionable.filter((entry) => entry.severity === "high").length;
  const badgeText = `${Math.min(highCount > 0 ? highCount : actionable.length, 9)}`;

  chrome.action.setBadgeBackgroundColor({
    color: highCount > 0 ? "#dc2626" : "#d97706",
  });
  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setTitle({
    title: `GuardRail: ${actionable.length} recent alert${actionable.length === 1 ? "" : "s"}`,
  });
}

async function getExtensionContext(parsedUrl) {
  if (parsedUrl.protocol !== "chrome-extension:") {
    return null;
  }

  const extensionId = parsedUrl.hostname;
  if (!extensionId) {
    return null;
  }

  const name = await lookupExtensionName(extensionId);
  return {
    id: extensionId,
    name,
    label: name ? `${name} (${extensionId})` : extensionId,
  };
}

async function lookupExtensionName(extensionId) {
  if (!chrome.management?.get) {
    return null;
  }

  try {
    const extension = await chrome.management.get(extensionId);
    return extension?.name || null;
  } catch (error) {
    return null;
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
