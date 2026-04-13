// test_domain_validation.js
const fs = require('fs');

function loadIsCrossDomain() {
  const backgroundJs = fs.readFileSync('unpacked/background.js', 'utf8');
  const match = backgroundJs.match(/function isCrossDomain\(currentHost, targetHost\) \{([\s\S]+?)\n\}/);
  if (!match) throw new Error("Could not find isCrossDomain");
  return eval(`(${match[0]})`);
}

const isCrossDomain = loadIsCrossDomain();

function testDomainValidation(currentHost, targetHost) {
  return isCrossDomain(currentHost, targetHost);
}

function runTests() {
  const tests = [
    { current: "example.com", target: "example.com", expectedAlert: false },
    { current: "example.com", target: "api.example.com", expectedAlert: false },
    { current: "example.com", target: "bad-example.com", expectedAlert: true },
    { current: "example.com", target: "attacker.com", expectedAlert: true },
    { current: "app.com", target: "attackerapp.com", expectedAlert: true },
    { current: "app.com", target: "my-app.com", expectedAlert: true },
    { current: "app.com", target: "app.com.attacker.com", expectedAlert: true },
    { current: "app.com", target: "app.com", expectedAlert: false },
    { current: "app.com", target: "sub.app.com", expectedAlert: false },
    { current: "example.com", target: "example.com.", expectedAlert: false },
    { current: "com", target: "attacker.com", expectedAlert: true },
  ];

  let passed = 0;
  for (const t of tests) {
    const alert = testDomainValidation(t.current, t.target);
    if (alert === t.expectedAlert) {
      console.log(`✅ PASS: current=${t.current}, target=${t.target} -> Alert: ${alert}`);
      passed++;
    } else {
      console.error(`❌ FAIL: current=${t.current}, target=${t.target} -> Expected Alert: ${t.expectedAlert}, Got: ${alert}`);
    }
  }

  if (passed === tests.length) {
    console.log("All tests passed!");
    process.exit(0);
  } else {
    console.error(`${tests.length - passed} tests failed!`);
    process.exit(1);
  }
}

runTests();
