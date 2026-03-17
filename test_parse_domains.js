const fs = require('fs');
const vm = require('vm');
const path = require('path');

// Read the actual sidepanel.js file
const sidepanelCode = fs.readFileSync(path.join(__dirname, 'unpacked', 'sidepanel.js'), 'utf8');

// We only need parseDomains, which is a pure function.
// We can extract it by running the script in a mock environment that stub out the DOM elements and chrome API.
const sandbox = {
  document: {
    getElementById: () => ({
      addEventListener: () => {},
      appendChild: () => {},
      classList: { add: () => {}, remove: () => {} },
      style: {},
      value: ''
    }),
    createElement: () => ({
      setAttribute: () => {},
      appendChild: () => {},
      style: {},
      classList: { add: () => {}, remove: () => {} }
    })
  },
  chrome: {
    storage: {
      local: { get: () => {}, set: () => {} }
    },
    runtime: {
      sendMessage: () => {},
      onMessage: { addListener: () => {} }
    },
    tabs: {
      query: () => {}
    }
  },
  URL: URL,
  alert: () => {},
  confirm: () => true,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  console: console
};

vm.createContext(sandbox);
vm.runInContext(sidepanelCode, sandbox);

function runTests() {
  const tests = [
    { input: "example.com", expected: ["example.com"] },
    { input: "example.com, test.com", expected: ["example.com", "test.com"] },
    { input: "example.com test.com", expected: ["example.com", "test.com"] },
    { input: "example.com\ntest.com", expected: ["example.com", "test.com"] },
    { input: ", , example.com  ,  test.com\n\n", expected: ["example.com", "test.com"] },
    { input: "", expected: [] },
    { input: "   ", expected: [] },
    { input: "example.com, , test.com, ", expected: ["example.com", "test.com"] },
    { input: "foo.bar,baz.qux\nquux.corge\tgrault.garply", expected: ["foo.bar", "baz.qux", "quux.corge", "grault.garply"] }
  ];

  let passed = 0;
  for (const t of tests) {
    const result = sandbox.parseDomains(t.input);
    const resultStr = JSON.stringify(result);
    const expectedStr = JSON.stringify(t.expected);

    if (resultStr === expectedStr) {
      console.log(`✅ PASS: input=${JSON.stringify(t.input)} -> Expected: ${expectedStr}, Got: ${resultStr}`);
      passed++;
    } else {
      console.error(`❌ FAIL: input=${JSON.stringify(t.input)} -> Expected: ${expectedStr}, Got: ${resultStr}`);
    }
  }

  if (passed === tests.length) {
    console.log("All parseDomains tests passed!");
    process.exit(0);
  } else {
    console.error(`${tests.length - passed} tests failed!`);
    process.exit(1);
  }
}

runTests();
