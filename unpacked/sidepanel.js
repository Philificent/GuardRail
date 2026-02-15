const logDiv = document.getElementById("log");
const toggle = document.getElementById("shieldToggle");
const searchInput = document.getElementById("searchInput");
const severityFilter = document.getElementById("severityFilter");

function render() {
  chrome.storage.local.get({ logs: [], shieldEnabled: false }, (data) => {
    toggle.checked = data.shieldEnabled;
    const search = searchInput.value.toLowerCase();
    const severity = severityFilter.value;

    const filtered = data.logs.filter((l) => {
      const matchSearch =
        l.site.includes(search) || l.title.toLowerCase().includes(search);
      const matchSev = severity === "all" || l.severity === severity;
      return matchSearch && matchSev;
    });

    logDiv.innerHTML = filtered
      .map(
        (l) => `
      <div class="card ${l.severity}">
        <span class="time">${l.time}</span><br>
        <strong>${l.title}</strong><br><small>${l.desc}</small><br>
        <div class="site-badge">📍 ${l.site}</div>
      </div>
    `,
      )
      .join("");
  });
}

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "TOGGLE_SHIELD",
    enabled: toggle.checked,
  });
  chrome.storage.local.set({ shieldEnabled: toggle.checked });
});

document.getElementById("nukeBtn").addEventListener("click", () => {
  if (confirm("Wipe site data?"))
    chrome.runtime.sendMessage({ type: "WIPE_CURRENT_TAB" });
});

document.getElementById("clearBtn").addEventListener("click", () => {
  chrome.storage.local.set({ logs: [] }, render);
});

document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.storage.local.get({ logs: [] }, (data) => {
    const blob = new Blob([JSON.stringify(data.logs, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `guardrail-log.json`;
    a.click();
  });
});

searchInput.addEventListener("input", render);
severityFilter.addEventListener("change", render);
chrome.runtime.onMessage.addListener(render);
render();
