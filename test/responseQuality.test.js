import test from "node:test";
import assert from "node:assert/strict";
import {isObviouslyGarbledResponse} from "../src/responseQuality.js";

test("accepts normal short answers",()=>{
  assert.equal(isObviouslyGarbledResponse("4","2+2=?"),false);
  assert.equal(isObviouslyGarbledResponse("New Delhi","What is the capital of India?"),false);
});

test("rejects known malformed tiny-model fragments",()=>{
  assert.equal(isObviouslyGarbledResponse("essors","2+2=?"),true);
  assert.equal(isObviouslyGarbledResponse("я","2+2=?"),true);
  assert.equal(isObviouslyGarbledResponse("rylic","hello"),true);
});

test("allows Cyrillic when the user is using Cyrillic",()=>{
  assert.equal(isObviouslyGarbledResponse("Привет","Привет"),false);
});
