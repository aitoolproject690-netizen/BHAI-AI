import test from "node:test";
import assert from "node:assert/strict";
import { solveSimpleTime } from "../src/simpleReasoning.js";

test("deterministic time reasoning adds travel duration",()=>{
  const out=solveSimpleTime("Agar main subah 8 baje ghar se niklu aur 3 ghante travel karu to kitne baje pahuchunga?");
  assert.match(out,/11 AM/i);
});

test("deterministic time reasoning ignores non-time prompts",()=>{
  assert.equal(solveSimpleTime("India ki capital kya hai?"),null);
});
