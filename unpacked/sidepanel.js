const logDiv = document.getElementById('log');
const shieldToggle = document.getElementById('shieldToggle');
const spoofToggle = document.getElementById('spoofToggle');
const jsKillswitchToggle = document.getElementById('jsKillswitchToggle');
const searchInput = document.getElementById('searchInput');
const severityFilter = document.getElementById('severityFilter');
const blocklistInput = document.getElementById('blocklistInput');
const statusBanner = document.getElementById('statusBanner');
const blocklistDrawer = document.getElementById('blocklistDrawer');
const blocklistManagerList = document.getElementById('blocklistManagerList');
const bulkBlocklistInput = document.getElementById('bulkBlocklistInput');
const spoofProfileCopy = document.getElementById('spoofProfile');
const DEFAULT_SPOOF_PROFILE = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:109.0) Gecko/20100101 Firefox/115.0',
  referer: 'removed'
};

let renderedLogs = [];
let currentBlocklist = [];
let statusTimer = null;
let openDetailId = null;

function debounce(func, timeout = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}

function createSafeElement(tag, attributes = {}, textContent = null, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'className') {
      el.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(el.style, value);
    } else {
      el.setAttribute(key, value);
    }
  }
  if (textContent !== null) {
    el.textContent = textContent;
  }
  children.forEach(child => el.appendChild(child));
  return el;
}

function escapeMarkdown(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
    .replace(/\r/g, '')
    .replace(/([*_#\-\[\]`])/g, '\\$1');
}

function render() {
  chrome.storage.local.get({
    logs: [],
    shieldEnabled: false,
    spoofEnabled: false,
    jsKillswitchEnabled: true,
    blocklist: [],
    spoofProfile: DEFAULT_SPOOF_PROFILE
  }, (data) => {
    shieldToggle.checked = data.shieldEnabled;
    spoofToggle.checked = data.spoofEnabled;
    jsKillswitchToggle.checked = data.jsKillswitchEnabled;
    renderedLogs = data.logs;
    currentBlocklist = data.blocklist;
    spoofProfileCopy.textContent = formatSpoofProfile(data.spoofEnabled, data.spoofProfile);
    const search = searchInput.value.toLowerCase();
    const severity = severityFilter.value;

    const blocklistSet = new Set(data.blocklist);

    const filtered = data.logs.filter(l => {
      if (severity !== 'all' && l.severity !== severity) return false;
      if (!search) return true;
      return l.site.toLowerCase().includes(search) ||
             l.title.toLowerCase().includes(search) ||
             (l.desc || '').toLowerCase().includes(search);
    });

    logDiv.textContent = '';
    filtered.forEach(l => {
      const actions = [];
      if (l.details) {
        actions.push(createSafeElement('button', { className: 'action-btn', 'data-action': 'view', 'data-id': l.id }, 'View Info'));
      }
      (l.actions || []).forEach((action) => {
        if (action.type === 'block-domain' && action.domain) {
          const normalizedDomain = normalizeDomain(action.domain);
          if (!normalizedDomain) {
            return;
          }
          const blocked = blocklistSet.has(normalizedDomain);
          actions.push(createSafeElement('button', {
            className: `action-btn ${blocked ? 'blocked' : 'danger'}`,
            'data-action': blocked ? 'unblock' : 'block',
            'data-domain': normalizedDomain,
            'data-id': l.id
          }, blocked ? 'Remove from Blocklist' : (action.label || 'Add to Blocklist')));
        }
      });

      const card = createSafeElement('div', { className: `card ${l.severity}` }, null, [
        createSafeElement('span', { className: 'time' }, l.time),
        createSafeElement('br'),
        createSafeElement('strong', {}, l.title),
        createSafeElement('br'),
        createSafeElement('small', {}, l.desc),
        createSafeElement('br'),
        createSafeElement('div', { className: 'site-badge' }, `Site ${l.site}`),
        ...(actions.length ? [createSafeElement('div', { className: 'action-row' }, null, actions)] : []),
        ...(openDetailId === l.id && l.details ? [createInlineDetails(l.details)] : [])
      ]);
      logDiv.appendChild(card);
    });

    document.getElementById('blocklistPreview').textContent = data.blocklist.length
      ? `Blocked: ${data.blocklist.join(', ')}`
      : 'Blocked: none';
    renderBlocklistManager(data.blocklist);
  });
}

function createInlineDetails(details) {
  return createSafeElement('div', { className: 'inline-details' }, null, [
    createSafeElement('strong', {}, 'Event Details'),
    createSafeElement('pre', {}, JSON.stringify(details, null, 2))
  ]);
}

function renderBlocklistManager(blocklist) {
  blocklistManagerList.textContent = '';

  if (blocklist.length === 0) {
    blocklistManagerList.appendChild(
      createSafeElement('div', { className: 'meta' }, 'No blocked domains yet.')
    );
    return;
  }

  blocklist.forEach((domain) => {
    blocklistManagerList.appendChild(
      createSafeElement('div', { className: 'list-item' }, null, [
        createSafeElement('span', {}, domain),
        createSafeElement('button', {
          className: 'action-btn blocked',
          'data-action': 'remove-managed-domain',
          'data-domain': domain
        }, 'Remove')
      ])
    );
  });
}

function setStatus(message, tone = 'success') {
  clearTimeout(statusTimer);
  statusBanner.hidden = false;
  statusBanner.className = `status-banner ${tone}`;
  statusBanner.textContent = message;
  statusTimer = setTimeout(() => {
    statusBanner.hidden = true;
    statusBanner.textContent = '';
    statusBanner.className = 'status-banner';
  }, 3000);
}

function parseDomains(raw) {
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeDomain(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  try {
    return new URL(value.includes('://') ? value : `https://${value}`).hostname.toLowerCase();
  } catch (error) {
    return null;
  }
}

function formatSpoofProfile(enabled, profile) {
  const activeProfile = profile || DEFAULT_SPOOF_PROFILE;

  const refererValue = activeProfile.referer === 'removed' ? 'Referer removed' : `Referer ${activeProfile.referer}`;
  return `${enabled ? 'Active profile' : 'Profile when enabled'}: User-Agent spoofed to ${activeProfile.userAgent} | ${refererValue}.`;
}

// Toggles
shieldToggle.addEventListener('change', () => {
  chrome.storage.local.set({shieldEnabled: shieldToggle.checked});
  chrome.runtime.sendMessage({type: "TOGGLE_SHIELD", enabled: shieldToggle.checked});
});

spoofToggle.addEventListener('change', () => {
  chrome.storage.local.set({spoofEnabled: spoofToggle.checked});
  chrome.runtime.sendMessage({type: "TOGGLE_SPOOF", enabled: spoofToggle.checked});
});

jsKillswitchToggle.addEventListener('change', () => {
  chrome.storage.local.set({jsKillswitchEnabled: jsKillswitchToggle.checked});
  chrome.runtime.sendMessage({type: "TOGGLE_JS_KILLSWITCH", enabled: jsKillswitchToggle.checked});
});

// Tools
document.getElementById('whitelistBtn').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const host = new URL(tabs[0].url).hostname;
    chrome.storage.local.get({whitelist: []}, (data) => {
        if (!data.whitelist.includes(host)) {
            const newList = [...data.whitelist, host];
            chrome.storage.local.set({whitelist: newList}, () => {
                alert(`${host} added to trusted sites.`);
                render();
            });
        }
    });
  });
});

document.getElementById('nukeBtn').addEventListener('click', () => {
  if(confirm("Wipe site data?")) chrome.runtime.sendMessage({type: "WIPE_CURRENT_TAB"});
});

document.getElementById('clearBtn').addEventListener('click', () => {
  chrome.storage.local.set({logs: []}, render);
});

document.getElementById('addBlocklistBtn').addEventListener('click', async () => {
  const domain = blocklistInput.value.trim();
  if (!domain) {
    return;
  }

  const normalized = normalizeDomain(domain);
  if (!normalized) {
    alert('Invalid domain.');
    return;
  }
  const actionType = currentBlocklist.includes(normalized) ? 'REMOVE_BLOCKLIST_DOMAIN' : 'ADD_BLOCKLIST_DOMAIN';
  const response = await chrome.runtime.sendMessage({ type: actionType, domain: normalized });
  if (!response?.ok) {
    alert(response?.error || 'Unable to add domain to blocklist.');
    return;
  }

  setStatus(
    response.status === 'removed' || response.status === 'missing'
      ? `${response.domain} removed from the blacklist.`
      : `${response.domain} added to the blacklist.`,
    response.status === 'removed' || response.status === 'missing' ? 'warn' : 'success'
  );
  blocklistInput.value = '';
  render();
});

document.getElementById('manageBlocklistBtn').addEventListener('click', () => {
  blocklistDrawer.hidden = false;
});

document.getElementById('closeBlocklistBtn').addEventListener('click', () => {
  blocklistDrawer.hidden = true;
});

document.getElementById('bulkAddBlocklistBtn').addEventListener('click', async () => {
  const domains = parseDomains(bulkBlocklistInput.value);
  const response = await chrome.runtime.sendMessage({ type: 'ADD_BLOCKLIST_BULK', domains });
  if (!response?.ok) {
    alert(response?.error || 'Unable to bulk add domains.');
    return;
  }

  bulkBlocklistInput.value = '';
  setStatus(
    response.added?.length
      ? `${response.added.length} domain${response.added.length === 1 ? '' : 's'} added to the blacklist.`
      : 'All submitted domains were already blocked.',
    response.added?.length ? 'success' : 'warn'
  );
  render();
});

document.getElementById('exportBtn').addEventListener('click', () => {
  chrome.storage.local.get({logs: []}, (data) => {
    if (data.logs.length === 0) {
      alert("No logs to export!");
      return;
    }

    const date = new Date().toLocaleDateString();
    const site = data.logs[0]?.site || "Unknown";
    const escapedSite = escapeMarkdown(site);

    // Build the Markdown String
    let md = `# 🛡️ GuardRail Security Audit Report\n\n`;
    md += `**Date:** ${date} | **Primary Site Audit:** ${escapedSite}\n`;
    md += `**GuardRail Version:** v1.6\n\n`;
    md += `## 1. Security Incident Log\n\n`;
    md += `| Time | Severity | Event Type | Site Context | Description |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- |\n`;

    data.logs.forEach(l => {
      // Map severity to an emoji for better visual reporting
      const emoji = l.severity === 'high' ? '🔴' : (l.severity === 'medium' ? '🟡' : '🔵');
      const time = escapeMarkdown(l.time);
      const severityText = escapeMarkdown(l.severity.toUpperCase());
      const title = escapeMarkdown(l.title);
      const siteContext = escapeMarkdown(l.site);
      const desc = escapeMarkdown(l.desc);
      md += `| ${time} | ${emoji} ${severityText} | ${title} | ${siteContext} | ${desc} |\n`;
    });

    md += `\n\n---\n*Report generated by GuardRail Security Extension*`;

    // Download as .md file
    const blob = new Blob([md], {type: 'text/markdown'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `GuardRail-Audit-${site.replace(/\./g, '-')}.md`;
    a.click();
  });
});

searchInput.addEventListener("input", debounce(render, 250));
severityFilter.addEventListener("change", render);
chrome.runtime.onMessage.addListener(() => render());
logDiv.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  if (button.dataset.action === 'view') {
    const entry = renderedLogs.find((log) => log.id === button.dataset.id);
    if (!entry?.details) {
      return;
    }
    openDetailId = openDetailId === entry.id ? null : entry.id;
    render();
    return;
  }

  if ((button.dataset.action === 'block' || button.dataset.action === 'unblock') && button.dataset.domain) {
    button.classList.add('busy');
    const response = await chrome.runtime.sendMessage({
      type: button.dataset.action === 'block' ? 'ADD_BLOCKLIST_DOMAIN' : 'REMOVE_BLOCKLIST_DOMAIN',
      domain: button.dataset.domain
    });
    button.classList.remove('busy');
    if (!response?.ok) {
      alert(response?.error || 'Unable to update blocklist.');
      return;
    }
    setStatus(
      button.dataset.action === 'block'
        ? `${response.domain} added to the blacklist.`
        : `${response.domain} removed from the blacklist.`,
      button.dataset.action === 'block' ? 'success' : 'warn'
    );
    render();
  }

  if (button.dataset.action === 'remove-managed-domain' && button.dataset.domain) {
    const response = await chrome.runtime.sendMessage({ type: 'REMOVE_BLOCKLIST_DOMAIN', domain: button.dataset.domain });
    if (!response?.ok) {
      alert(response?.error || 'Unable to remove domain from blocklist.');
      return;
    }
    setStatus(`${response.domain} removed from the blacklist.`, 'warn');
    render();
  }
});
render();
