import test from "node:test";
import assert from "node:assert/strict";
import {isObviouslyGarbledResponse} from "../src/responseQuality.js";

test("accepts normal short answers",()=>{
  assert.equal(isObviouslyGarbledResponse("4","2+2=?"),false);
  assert.equal(isObviouslyGarbledResponse("New Delhi","What is the capital of India?"),false);
});

test("rejects a standalone language fragment from a broken answer",()=>{
  assert.equal(isObviouslyGarbledResponse("from","Chutiye 2+2 ka matlab bata"),true);
});

test("rejects known malformed tiny-model fragments",()=>{
  assert.equal(isObviouslyGarbledResponse("essors","2+2=?"),true);
  assert.equal(isObviouslyGarbledResponse("я","2+2=?"),true);
  assert.equal(isObviouslyGarbledResponse("rylic","hello"),true);
});

test("allows Cyrillic when the user is using Cyrillic",()=>{
  assert.equal(isObviouslyGarbledResponse("Привет","Привет"),false);
});

test("rejects a one-token non-answer to an explanatory question",()=>{
  assert.equal(isObviouslyGarbledResponse("pathlib","Ek sentence me batao: Baarish ke baad mitti ki khushboo ko kya kehte hain?"),true);
});

test("rejects broken punctuation tails from tiny-model output",()=>{
  assert.equal(isObviouslyGarbledResponse("encourag///","Bhai ek normal jawab do"),true);
});

test("keeps valid concise factual answers",()=>{
  assert.equal(isObviouslyGarbledResponse("Delhi","What is the capital of India?"),false);
  assert.equal(isObviouslyGarbledResponse("4","2+2=?"),false);
});


test("rejects one-token nonsense on natural conversational testing prompts",()=>{
  assert.equal(isObviouslyGarbledResponse("uge","Bhai aise hi test kar rha tha kya reply deta hai tu 😅"),true);
});

test("keeps legitimate short conversational replies",()=>{
  assert.equal(isObviouslyGarbledResponse("badhiya","Bhai kya haal hai?"),false);
  assert.equal(isObviouslyGarbledResponse("haan","Bhai sun raha hai?"),false);
});
