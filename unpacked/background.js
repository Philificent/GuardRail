let navigationHistory = {};
const BLOCK_RULE_ID = 1;

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    navigationHistory[details.tabId] = new URL(details.url).hostname;
  }
});

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.method === "POST") {
      const currentHost = navigationHistory[details.tabId];
      const targetHost = new URL(details.url).hostname;
      if (currentHost && !targetHost.endsWith(currentHost)) {
        logEvent(
          "high",
          "Data Exfiltration",
          `Data sent to external domain: ${targetHost}`,
        );
      }
    }
  },
  { urls: ["<all_urls>"] },
  ["requestBody"],
);

chrome.cookies.onChanged.addListener((change) => {
  const affKeys = ["aff_id", "ref", "clickid", "track"];
  if (
    !change.removed &&
    affKeys.some((key) => change.cookie.name.includes(key))
  ) {
    logEvent(
      "medium",
      "Affiliate Change",
      `Cookie '${change.cookie.name}' updated.`,
    );
  }
});

// Initialize extension state on startup
chrome.runtime.onStartup.addListener(() => {
  reapplyPersistedSettings();
});

chrome.runtime.onInstalled.addListener(() => {
  reapplyPersistedSettings();
});

async function reapplyPersistedSettings() {
  chrome.storage.local.get({ shieldEnabled: false }, (data) => {
    toggleKillSwitch(data.shieldEnabled);
    console.log(
      `GuardRail: Shield persistence restored to ${data.shieldEnabled}`,
    );
  });
}

async function toggleKillSwitch(isEnabled) {
  const rule = {
    id: BLOCK_RULE_ID,
    priority: 1,
    action: { type: "block" },
    condition: {
      resourceTypes: ["script", "xmlhttprequest", "sub_frame"],
      domainType: "thirdParty",
    },
  };
  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: isEnabled ? [rule] : [],
    removeRuleIds: [BLOCK_RULE_ID],
  });
  logEvent(
    isEnabled ? "high" : "low",
    "Shields Status",
    isEnabled ? "Panic Mode ON" : "Panic Mode OFF",
  );
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.type === "LOG_EVENT")
    logEvent(request.severity, request.title, request.desc);
  if (request.type === "TOGGLE_SHIELD") toggleKillSwitch(request.enabled);
  if (request.type === "WIPE_CURRENT_TAB") nukeSite();
});

function nukeSite() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const origin = new URL(tabs[0].url).origin;
    chrome.browsingData.remove(
      { origins: [origin] },
      { cache: true, cookies: true, localStorage: true },
      () => {
        logEvent("high", "Site Reset", "Cleared all site data.");
        chrome.tabs.reload(tabs[0].id);
      },
    );
  });
}

function logEvent(severity, title, desc) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const site = tabs[0] ? new URL(tabs[0].url).hostname : "Unknown Site";
    const event = {
      time: new Date().toLocaleTimeString(),
      severity,
      title,
      desc,
      site,
    };
    chrome.storage.local.get({ logs: [] }, (data) => {
      const logs = [event, ...data.logs].slice(0, 50);
      chrome.storage.local.set({ logs });
      chrome.runtime.sendMessage({ type: "UPDATE_UI" });
    });
  });
}
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
