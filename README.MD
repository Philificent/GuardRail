# GuardRail Security Extension v1.6

GuardRail is a Chromium extension for active web-session defense. It monitors suspicious browser activity in real time, surfaces incidents in a side panel, and lets you respond quickly with site resets, trust rules, and blocklist actions.

## Current Release

Version `1.6` adds:

- Persistent domain blocklisting, including direct block actions from high-risk incident entries.
- Structured incident details for network events, including request method, URL, query string, and captured payload preview when available.
- A `View Info` workflow in the side panel for inspecting logged incident details.
- A `JS Killswitch` that detects and can suppress suspicious background JavaScript behavior.
- Actionable Chrome notifications for high-risk detections.
- Extension badge alerts so the toolbar icon visibly signals recent activity.

## Core Features

### Network and Exfiltration Monitoring

- Detects cross-domain requests that may indicate data exfiltration.
- Logs request metadata for suspicious requests.
- Captures POST/form payload previews when the browser exposes request body data.
- Lets the user add suspicious target domains to a persistent blocklist.

### Response Controls

- `Panic Mode` blocks third-party scripts, XHR/fetch traffic, subframes, and media requests, while honoring trusted sites.
- `Mask Identity` applies header-level identity reduction for third-party navigation contexts.
- `Reset Current Site` clears cache, cookies, and local storage for the active origin.
- `Trust Site` adds the current host to the allowlist used by Panic Mode.

### Background JavaScript Detection

The `JS Killswitch` watches for behavior often associated with nuisance or deceptive pages, including:

- `beforeunload`, `unload`, and `pagehide` handlers
- Long-running repeating timers
- `requestIdleCallback` scheduling
- Popup and pop-under attempts
- Hidden-tab title renaming
- Hidden autoplay audio or video

When enabled, the killswitch suppresses several of these behaviors instead of only logging them.

### Interface and Alerting

- Side panel event log with severity filtering and text search
- `View Info` for structured incident inspection
- Per-event `Add to Blocklist` actions
- Manual blocklist entry from the side panel
- Toolbar badge updates when GuardRail detects medium- or high-severity activity
- High-risk Chrome notifications with direct response buttons

### Additional Detection

- Password breach checks using the HIBP k-anonymity flow
- Media-access interception for camera and microphone requests
- Basic invisible-overlay/XSS-style clickjacking detection

## Installation

1. Open Chrome, Edge, Brave, or another Chromium-based browser.
2. Go to `chrome://extensions`.
3. Enable `Developer mode`.
4. Click `Load unpacked`.
5. Select the GuardRail project folder.
6. Pin the extension for easier access to badge alerts and the side panel.

## Using GuardRail

1. Open the GuardRail side panel from the extension action.
2. Enable `Panic Mode`, `Mask Identity`, or `JS Killswitch` as needed.
3. Watch the toolbar badge for new suspicious activity.
4. Review incidents in the log.
5. Use `View Info` to inspect request details or JavaScript behavior telemetry.
6. Use `Add to Blocklist` when a detected domain should be permanently blocked.
7. Use `Reset Current Site` if you want to wipe local browsing state for the active origin.

## Permissions

GuardRail currently requests the following Chromium extension permissions:

| Permission              | Why GuardRail Uses It                                                                                   |
| :---------------------- | :------------------------------------------------------------------------------------------------------ |
| `sidePanel`             | Opens and manages the GuardRail side panel UI.                                                          |
| `storage`               | Persists logs, toggles, trust rules, and blocklist entries.                                             |
| `notifications`         | Shows high-risk incident alerts and notification action buttons.                                        |
| `webRequest`            | Monitors outgoing requests and captures request metadata for suspicious transfers.                      |
| `cookies`               | Supports site-state protection and reset workflows involving browser session data.                      |
| `webNavigation`         | Tracks the active top-level site so GuardRail can compare current origin against outgoing destinations. |
| `scripting`             | Supports injected runtime behavior for page-level inspection and response logic.                        |
| `management`            | Resolves `chrome-extension://` IDs to installed extension names for extension-targeted transfer logs.   |
| `declarativeNetRequest` | Enforces Panic Mode and persistent blocklist rules through Chromium’s request-blocking engine.          |
| `browsingData`          | Clears cache, cookies, and local storage for the active site during site reset.                         |

GuardRail also requests the following host permission:

| Host Permission | Why GuardRail Uses It                                                                                                  |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------- |
| `<all_urls>`    | Allows GuardRail to monitor requests, inject protection logic, and inspect suspicious behavior across arbitrary sites. |

## File Structure

- `unpacked/manifest.json`: Chromium extension manifest and permissions.
- `unpacked/background.js`: Service worker for incident logging, notifications, blocklist rules, badge state, and core controls.
- `unpacked/content.js`: Content-script bridge for DOM-level checks and communication with the injected page context.
- `unpacked/inject.js`: In-page instrumentation for media APIs and suspicious background JavaScript behavior.
- `unpacked/sidepanel.html`: Side panel markup and styling.
- `unpacked/sidepanel.js`: Side panel rendering, filtering, export, blocklist actions, and detail drawer behavior.
- `test_domain_validation.js`: Domain-matching regression checks for exfiltration logic.
- `test_security.js`: Browser-based security behavior test harness.
- `test_xss.js`: Browser-based panel rendering/XSS regression test.

## Testing

### Quick Local Checks

- `node --check unpacked/background.js`
- `node --check unpacked/content.js`
- `node --check unpacked/inject.js`
- `node --check unpacked/sidepanel.js`
- `node test_domain_validation.js`

### Browser-Based Tests

The Playwright-based tests require project dependencies to be installed first.

- `node test_security.js`
- `node test_xss.js`

## Notes

- GuardRail currently targets Chromium extension APIs and Manifest V3.
- Payload capture depends on what Chrome exposes through `webRequest` request-body data.
- The extension badge reflects recent medium- and high-severity activity; clearing the log clears the badge state.
