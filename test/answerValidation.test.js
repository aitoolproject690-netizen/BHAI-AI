import test from "node:test";
import assert from "node:assert/strict";
import {buildAnswerReviewerPrompt,inspectAnswerDraft,parseReviewerVerdict,buildEvidenceBackedAnswer} from "../src/answerValidation.js";

test("answer inspection marks factual drafts for independent review",()=>{
  const result=inspectAnswerDraft(
    "Petrol mein kya hota hai?",
    "Petrol is a mixture of hydrocarbons and may contain additives.",
    {requiresEvidence:true}
  );
  assert.equal(result.ok,true);
  assert.equal(result.needsReview,true);
});

test("answer inspection catches malformed factual drafts",()=>{
  const result=inspectAnswerDraft("What is machine learning?","from",{requiresEvidence:true});
  assert.equal(result.ok,false);
  assert.ok(result.flags.includes("malformed_or_non_answer"));
});

test("reviewer verdict parser accepts strict JSON",()=>{
  assert.deepEqual(
    parseReviewerVerdict('{"verdict":"PASS","issues":[],"corrections":[]}'),
    {verdict:"PASS",issues:[],corrections:[]}
  );
  assert.deepEqual(
    parseReviewerVerdict('{"verdict":"FAIL","issues":["wrong term"],"corrections":["use the correct term"]}'),
    {verdict:"FAIL",issues:["wrong term"],corrections:["use the correct term"]}
  );
});

test("reviewer prompt keeps evidence separate from the draft",()=>{
  const prompt=buildAnswerReviewerPrompt({
    task:"What is fiber?",
    draft:"Fiber is a type of carbohydrate.",
    evidence:"[1] Official nutrition source\nFiber is a type of carbohydrate.",
    domain:"factual"
  });
  assert.match(prompt,/PROPOSED ANSWER/);
  assert.match(prompt,/EVIDENCE/);
  assert.match(prompt,/Return ONLY a JSON object/);
});


test("deterministic evidence fallback composes only retrieved source sentences",()=>{
  const result=buildEvidenceBackedAnswer(
    "Petrol (gasoline) me kya hota hai?",
    "[1] Gasoline composition\nURL: https://example.gov/gasoline\nSummary: Gasoline is a complex mixture of hydrocarbons used as a motor fuel. Its exact composition varies by formulation.\n\n[2] Petrol price\nURL: https://example.com/price\nSummary: Petrol prices vary between locations."
  );
  assert.match(result,/mixture of hydrocarbons/i);
  assert.match(result,/composition varies by formulation/i);
  assert.doesNotMatch(result,/prices vary between locations/i);
});
