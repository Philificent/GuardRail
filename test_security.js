const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock chrome runtime to capture messages from content.js
  await page.addInitScript(() => {
    window.chrome = {
      runtime: {
        getURL: (path) => `http://localhost:8000/unpacked/${path}`,
        sendMessage: (msg) => {
          window.dispatchEvent(new CustomEvent("chromeMsg", { detail: msg }));
        },
      },
    };
  });

  // Keep track of messages received
  const receivedMessages = [];
  await page.exposeFunction("logChromeMessage", (msg) => {
    receivedMessages.push(msg);
  });

  await page.addInitScript(() => {
    window.addEventListener("chromeMsg", (e) => {
      window.logChromeMessage(e.detail);
    });
  });

  // Navigate to test page
  await page.goto("http://localhost:8000/test.html");

  // Load content script explicitly since manifest injection won't happen here
  await page.addScriptTag({ url: "http://localhost:8000/unpacked/content.js" });

  // Let inject.js load
  await page.waitForTimeout(500);

  // Test 1: Simulate the valid case by calling the intercepted getUserMedia
  console.log("Testing valid case...");
  await page.evaluate(async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // It will likely fail to get media in headless, but the message should have been sent before that
    }
  });

  await page.waitForTimeout(500);

  if (receivedMessages.length > 0 && receivedMessages[0].type === "LOG_EVENT") {
    console.log("Valid case passed: Message was received correctly.");
  } else {
    console.error("Valid case failed: Message was not received.");
  }

  // Clear messages
  receivedMessages.length = 0;

  // Test 2: Simulate malicious cross-origin message spoofing
  console.log("Testing invalid (cross-origin) case...");
  await page.evaluate(() => {
    return new Promise((resolve) => {
      const iframe = document.createElement("iframe");
      // Use data URL to guarantee cross-origin
      iframe.src =
        'data:text/html,<html><body><script>parent.postMessage({ type: "GUARDRAIL_MEDIA_INTERNAL" }, "*");</script></body></html>';
      document.body.appendChild(iframe);
      setTimeout(resolve, 300);
    });
  });

  await page.waitForTimeout(500);

  if (receivedMessages.length === 0) {
    console.log("Invalid case passed: Malicious message was ignored.");
  } else {
    console.error(
      "Invalid case failed: Malicious message was processed!",
      receivedMessages,
    );
    process.exit(1);
  }

  await browser.close();
})();
