// test_normalize_domain.js
const fs = require('fs');
const path = require('path');

// Extract normalizeDomain from sidepanel.js to test the actual implementation
// without duplicating the code manually.
const sidepanelJsPath = path.join(__dirname, 'unpacked', 'sidepanel.js');
const sidepanelJs = fs.readFileSync(sidepanelJsPath, 'utf8');

// Match the function definition
const functionMatch = sidepanelJs.match(/function normalizeDomain\(value\) \{[\s\S]*?\n\}/);
if (!functionMatch) {
  console.error('Could not find normalizeDomain function in sidepanel.js');
  process.exit(1);
}

// Define the function in current context
const normalizeDomain = eval(`(${functionMatch[0]})`);

function runTests() {
  const tests = [
    { input: "example.com", expected: "example.com", desc: "Basic domain" },
    { input: "https://example.com/path", expected: "example.com", desc: "Full URL" },
    { input: "Sub.Example.Com", expected: "sub.example.com", desc: "Case sensitivity and subdomains" },
    { input: null, expected: null, desc: "Null input" },
    { input: undefined, expected: null, desc: "Undefined input" },
    { input: 123, expected: null, desc: "Number input" },
    { input: "", expected: null, desc: "Empty string" },
    { input: "   ", expected: null, desc: "Whitespace string" },
    { input: "https://[", expected: null, desc: "Malformed URL (triggers catch block)" }
  ];

  let passed = 0;
  for (const t of tests) {
    const result = normalizeDomain(t.input);
    if (result === t.expected) {
      console.log(`✅ PASS: [${t.desc}] input="${t.input}" -> result="${result}"`);
      passed++;
    } else {
      console.error(`❌ FAIL: [${t.desc}] input="${t.input}" -> Expected: "${t.expected}", Got: "${result}"`);
    }
  }

  console.log(`\nTests passed: ${passed}/${tests.length}`);
  if (passed === tests.length) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
