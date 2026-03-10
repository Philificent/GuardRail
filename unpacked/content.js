const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
(document.head || document.documentElement).appendChild(script);
script.onload = () => script.remove();

syncPageConfig();
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.jsKillswitchEnabled) {
        syncPageConfig();
    }
});

// 1. Password Leak Checker (HIBP k-Anonymity)
document.addEventListener('blur', async (e) => {
    if (e.target.type === 'password' && e.target.value.length > 0) {
        const pass = e.target.value;
        const msgUint8 = new TextEncoder().encode(pass);
        const hashBuffer = await crypto.subtle.digest('SHA-1', msgUint8);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();

        const prefix = hashHex.substring(0, 5);
        const suffix = hashHex.substring(5);

        try {
            const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
            const body = await response.text();
            if (body.includes(suffix)) {
                chrome.runtime.sendMessage({
                    type: "LOG_EVENT", severity: "high",
                    title: "Leaked Password", desc: "This password was found in a known data breach!",
                    details: { kind: 'password-breach' }
                });
            }
        } catch (err) { console.error("HIBP Check failed", err); }
    }
}, true);

// 2. XSS Scanner
function scanXSS() {
    document.querySelectorAll('a, button, div[onclick]').forEach(el => {
        const s = window.getComputedStyle(el);
        if (parseInt(s.zIndex) > 100 && parseFloat(s.opacity) > 0 && parseFloat(s.opacity) < 0.1) {
            el.style.outline = "4px dashed red";
            chrome.runtime.sendMessage({ type: "LOG_EVENT", severity: "high", title: "XSS Detected", desc: "Invisible overlay found." });
        }
    });
}

window.addEventListener("message", (e) => {
    if (e.source !== window || e.origin !== window.location.origin || !e.data) return;

    if (e.data.type === "GUARDRAIL_MEDIA_INTERNAL") {
        chrome.runtime.sendMessage({
            type: "LOG_EVENT",
            severity: "high",
            title: "Media Access",
            desc: "Hardware request intercepted.",
            details: { kind: 'media-access', constraints: sanitizeForLog(e.data.constraints) }
        });
    }

    if (e.data.type === "GUARDRAIL_JS_EVENT") {
        chrome.runtime.sendMessage({
            type: "LOG_EVENT",
            severity: e.data.severity || "medium",
            title: e.data.title || "Suspicious Background JS",
            desc: e.data.desc || "The page registered suspicious background JavaScript behavior.",
            actions: e.data.domain ? [{ type: "block-domain", label: "Add to Blocklist", domain: e.data.domain }] : [],
            details: sanitizeForLog({
                kind: e.data.kind || 'background-js',
                location: e.data.location || window.location.href,
                target: e.data.target || null,
                note: e.data.note || null
            })
        });
    }
});
setTimeout(scanXSS, 2000);

function syncPageConfig() {
    chrome.storage.local.get({ jsKillswitchEnabled: true }, (data) => {
        window.postMessage({
            type: 'GUARDRAIL_CONFIG_INTERNAL',
            jsKillswitchEnabled: Boolean(data.jsKillswitchEnabled)
        }, window.location.origin);
    });
}

function sanitizeForLog(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (error) {
        return { note: 'Unable to serialize event details.' };
    }
}
