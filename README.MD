============================================================
GUARDRAIL SECURITY EXTENSION v1.2
============================================================

An active defense browser extension for real-time web security.

--- INSTALLATION ---
1. Open Chrome (or any Chromium browser like Edge/Brave).
2. Navigate to: chrome://extensions
3. Enable "Developer mode" (toggle in top-right corner).
4. Click "Load unpacked".
5. Select the 'GuardRail' folder containing these files.
6. Click the Puzzle icon in your browser bar and PIN GuardRail.

--- CORE FEATURES ---
- PANIC MODE: Toggle in the side panel to block all 3rd-party
  scripts/trackers using the high-performance DNR API.
- SITE RESET: Instantly wipes cookies and local storage for
  the current domain to de-identify your session.
- XSS GUARD: Automatically highlights invisible/transparent
  clickable overlays with a red dashed border.
- DOMAIN GUARD: Monitors POST requests; alerts if data is
  sent to a domain different from the one you are visiting.
- MEDIA GUARD: Intercepts and logs attempts to access your
  Camera or Microphone via getUserMedia.
- COOKIE MONITOR: Tracks and logs changes to affiliate
  IDs and tracking parameters in real-time.

--- FILE STRUCTURE ---
- manifest.json   : Extension configuration and permissions.
- background.js    : Network monitoring and core logic (Service Worker).
- content.js       : DOM scanning and message bridging.
- inject.js        : Media API interception (runs in page context).
- sidepanel.html   : The Dashboard UI.
- sidepanel.js     : UI logic and event rendering.
- icon.png         : Extension visual identity.

--- TESTING ---
Open 'test.html' in your browser and click the GuardRail icon
to view the live Security Log as you interact with the page.
============================================================
