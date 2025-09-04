const fs = require("fs");
const { validatePDFA3b, fixPDFA3b } = require("../tools/pdfa3b-validator");

test("valid PDF/A-3b passes", async () => {
  const pdf = fs.readFileSync("__tests__/fixtures/valid.pdf");
  const result = await validatePDFA3b(pdf);
  expect(result.ok).toBe(true);
});

test("invalid PDF/A-3b fails", async () => {
  const pdf = fs.readFileSync("__tests__/fixtures/invalid.pdf");
  const result = await validatePDFA3b(pdf);
  expect(result.ok).toBe(false);
});

test("fixer injects missing metadata", async () => {
  const pdf = fs.readFileSync("__tests__/fixtures/minimal.pdf");
  const fixed = await fixPDFA3b(pdf);
  const result = await validatePDFA3b(fixed);
  expect(result.ok).toBe(true);
});
