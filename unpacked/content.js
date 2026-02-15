const script = document.createElement("script");
script.src = chrome.runtime.getURL("inject.js");
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

function scanXSS() {
  document.querySelectorAll("a, button, div[onclick]").forEach((el) => {
    const s = window.getComputedStyle(el);
    if (
      parseInt(s.zIndex) > 100 &&
      parseFloat(s.opacity) > 0 &&
      parseFloat(s.opacity) < 0.1
    ) {
      el.style.outline = "4px dashed red";
      chrome.runtime.sendMessage({
        type: "LOG_EVENT",
        severity: "high",
        title: "XSS Detected",
        desc: "Invisible overlay found.",
      });
    }
  });
}

window.addEventListener("message", (e) => {
  if (e.data.type === "GUARDRAIL_MEDIA_INTERNAL") {
    chrome.runtime.sendMessage({
      type: "LOG_EVENT",
      severity: "high",
      title: "Media Access",
      desc: "Site requested hardware.",
    });
  }
});
setTimeout(scanXSS, 2000);
