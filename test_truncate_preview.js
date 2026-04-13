const fs = require("fs");
const path = require("path");

const backgroundJsPath = path.join(__dirname, "unpacked", "background.js");
const backgroundJs = fs.readFileSync(backgroundJsPath, "utf8");

const MAX_PREVIEW_MATCH = backgroundJs.match(/const MAX_PREVIEW = (\d+);/);
if (!MAX_PREVIEW_MATCH) {
  console.error("Could not find MAX_PREVIEW constant in background.js");
  process.exit(1);
}
const MAX_PREVIEW = parseInt(MAX_PREVIEW_MATCH[1], 10);

const functionMatch = backgroundJs.match(
  /function truncatePreview\(text\) \{[\s\S]*?\n\}/,
);
if (!functionMatch) {
  console.error("Could not find truncatePreview function in background.js");
  process.exit(1);
}

const truncatePreview = eval(`(${functionMatch[0]})`);

function runTests() {
  const tests = [
    {
      desc: "Empty string",
      input: "",
      expected: "",
    },
    {
      desc: "Short string",
      input: "Hello World",
      expected: "Hello World",
    },
    {
      desc: "Exactly MAX_PREVIEW",
      input: "A".repeat(MAX_PREVIEW),
      expected: "A".repeat(MAX_PREVIEW),
    },
    {
      desc: "MAX_PREVIEW + 1",
      input: "A".repeat(MAX_PREVIEW + 1),
      expected: "A".repeat(MAX_PREVIEW) + "...",
    },
    {
      desc: "Significantly longer than MAX_PREVIEW",
      input: "A".repeat(MAX_PREVIEW * 2),
      expected: "A".repeat(MAX_PREVIEW) + "...",
    },
    {
      desc: "MAX_PREVIEW - 1",
      input: "A".repeat(MAX_PREVIEW - 1),
      expected: "A".repeat(MAX_PREVIEW - 1),
    },
  ];

  let passed = 0;
  for (const t of tests) {
    const result = truncatePreview(t.input);
    if (result === t.expected) {
      console.log(`✅ PASS: [${t.desc}]`);
      passed++;
    } else {
      console.error(
        `❌ FAIL: [${t.desc}] Expected length ${t.expected.length}, got ${result.length}`,
      );
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
