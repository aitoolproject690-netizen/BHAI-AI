import test from "node:test";
import assert from "node:assert/strict";
import {isMedicalIntent,getMedicalRiskSignals,getMedicalSafetyPrompt,applyMedicalSafetyFooter} from "../src/medicalSafety.js";

test("detects Hindi/Hinglish medical requests",()=>{
  assert.equal(isMedicalIntent("Papa ki dhadkan tez hai"),true);
  assert.equal(isMedicalIntent("ye tablet kis kaam ki hai"),true);
  assert.equal(isMedicalIntent("how do I deploy this app"),false);
});

test("detects emergency signals without treating pulse alone as an emergency",()=>{
  const r=getMedicalRiskSignals("pulse 110 bpm, BP 150/95, halka chakkar");
  assert.equal(r.pulse,110);
  assert.equal(r.systolic,150);
  assert.equal(r.diastolic,95);
  assert.equal(r.emergencyWords,false);
  assert.equal(r.veryHighBP,false);

  const e=getMedicalRiskSignals("BP 185/122 aur chest pain hai");
  assert.equal(e.veryHighBP,true);
  assert.equal(e.emergencyWords,true);
});

test("safety prompt rejects unsafe medication behavior and wrong crisis framing",()=>{
  const p=getMedicalSafetyPrompt("Papa ki dhadkan tez hai, BP 150/95");
  assert.match(p,/Do not diagnose from chat/i);
  assert.match(p,/150\/95/i);
  assert.match(p,/Never tell the user to start, stop, double, or change/i);
  assert.match(p,/112/i);
});

test("high-risk footer adds India emergency routing",()=>{
  const out=applyMedicalSafetyFooter("Please get medical help.","severe chest pain right now");
  assert.match(out,/112/);
  assert.match(out,/Emergency safety/i);
});
