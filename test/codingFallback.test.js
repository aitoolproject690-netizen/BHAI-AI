import test from "node:test";
import assert from "node:assert/strict";
import { buildSimpleCodingFallback } from "../src/codingFallback.js";

test("coding fallback can answer a basic JavaScript largest-number task",()=>{
  const out=buildSimpleCodingFallback("JavaScript mein ek function banao jo array ka largest number return kare.");
  assert.ok(out);
  assert.match(out,/function largestNumber/);
  assert.match(out,/Math\.max/);
});

test("coding fallback stays null for unsupported coding tasks",()=>{
  assert.equal(buildSimpleCodingFallback("Build a production-grade distributed compiler service."),null);
});
