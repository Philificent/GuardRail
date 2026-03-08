let navigationHistory = {};
const BLOCK_RULE_ID = 1;
const SPOOF_RULE_ID = 2;

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    navigationHistory[details.tabId] = new URL(details.url).hostname;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  delete navigationHistory[tabId];
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
);

async function reapplySettings() {
    chrome.storage.local.get({ shieldEnabled: false, spoofEnabled: false }, (data) => {
        toggleKillSwitch(data.shieldEnabled);
        toggleSpoofing(data.spoofEnabled);
    });
}

// 2. Identity Spoofing Logic
async function toggleSpoofing(isEnabled) {
    if (isEnabled) {
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
                "id": SPOOF_RULE_ID, "priority": 1,
                "action": {
                    "type": "modifyHeaders",
                    "requestHeaders": [
                        { "header": "user-agent", "operation": "set", "value": "Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0" },
                        { "header": "referer", "operation": "remove" }
                    ]
                },
                "condition": { "resourceTypes": ["main_frame", "sub_frame"], "domainType": "thirdParty" }
            }],
            removeRuleIds: [SPOOF_RULE_ID]
        });
    } else {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [SPOOF_RULE_ID] });
    }
}

// 3. Kill-Switch (Panic Mode) with Whitelist
async function toggleKillSwitch(isEnabled) {
    chrome.storage.local.get({ whitelist: [] }, async (data) => {
        if (isEnabled) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                addRules: [{
                    "id": BLOCK_RULE_ID, "priority": 1, "action": { "type": "block" },
                    "condition": {
                        "resourceTypes": ["script", "xmlhttprequest", "sub_frame"],
                        "domainType": "thirdParty",
                        "excludedInitiatorDomains": data.whitelist
                    }
                }],
                removeRuleIds: [BLOCK_RULE_ID]
            });
        } else {
            await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [BLOCK_RULE_ID] });
        }
    });
}

// 4. Monitoring & Messaging
chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId === 0) navigationHistory[details.tabId] = new URL(details.url).hostname;
});

chrome.webRequest.onBeforeRequest.addListener((details) => {
    if (details.method === "POST") {
        const currentHost = navigationHistory[details.tabId];
        const targetHost = new URL(details.url).hostname;
        if (currentHost && !targetHost.endsWith(currentHost)) {
            logEvent("high", "Data Exfiltration", `Data sent to: ${targetHost}`);
        }
    }
}, { urls: ["<all_urls>"] }, ["requestBody"]);

chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "LOG_EVENT") logEvent(request.severity, request.title, request.desc);
    if (request.type === "TOGGLE_SHIELD") toggleKillSwitch(request.enabled);
    if (request.type === "TOGGLE_SPOOF") toggleSpoofing(request.enabled);
    if (request.type === "WIPE_CURRENT_TAB") nukeSite();
});

function nukeSite() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const origin = new URL(tabs[0].url).origin;
        chrome.browsingData.remove({ "origins": [origin] }, { "cache": true, "cookies": true, "localStorage": true }, () => {
            logEvent("high", "Site Reset", "Cleared local data.");
            chrome.tabs.reload(tabs[0].id);
        });
    });
}

function logEvent(severity, title, desc) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const site = tabs[0] ? new URL(tabs[0].url).hostname : "Unknown Site";
        const event = { time: new Date().toLocaleTimeString(), severity, title, desc, site };
        chrome.storage.local.get({ logs: [] }, (data) => {
            const logs = [event, ...data.logs].slice(0, 50);
            chrome.storage.local.set({ logs });
            chrome.runtime.sendMessage({ type: "UPDATE_UI" });
        });
    });
}
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
