const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock chrome API
  await page.addInitScript(() => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, callback) => {
            const data = {
              shieldEnabled: false,
              spoofEnabled: false,
              logs: [
                {
                  severity: 'high',
                  time: '12:00',
                  title: 'Test <img src="x" onerror="window.xss_successful = true">',
                  desc: 'Description <script>window.xss_successful = true</script>',
                  site: 'example.com'
                }
              ]
            };
            callback(data);
          },
          set: () => {}
        }
      },
      runtime: {
        sendMessage: () => {},
        onMessage: {
          addListener: () => {}
        }
      }
    };
  });

  await page.goto(`file://${process.cwd()}/unpacked/sidepanel.html`);

  // Wait for rendering to complete (render is called synchronously with our mock, but just in case)
  await page.waitForTimeout(1000);

  const isXssSuccessful = await page.evaluate(() => window.xss_successful === true);
  if (isXssSuccessful) {
    console.error('XSS vulnerability is still present!');
    process.exit(1);
  } else {
    console.log('XSS vulnerability is mitigated.');
  }

  const logHtml = await page.evaluate(() => document.getElementById('log').innerHTML);
  console.log('Log HTML:', logHtml);

  await browser.close();
})();
