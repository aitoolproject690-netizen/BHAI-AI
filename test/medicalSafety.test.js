import test from "node:test";
import assert from "node:assert/strict";
import {isMedicalIntent,getMedicalRiskSignals,getMedicalSafetyPrompt,applyMedicalSafetyFooter,repairKnownUnsafeClaims} from "../src/medicalSafety.js";

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

test("safety prompt has explicit BP and pulse rules",()=>{
  const p=getMedicalSafetyPrompt("Papa ki dhadkan tez hai, BP 150/95");
  assert.match(p,/Do not diagnose from chat/i);
  assert.match(p,/150\/95 is high, not a hypertensive crisis/i);
  assert.match(p,/pulse number by itself does not determine an emergency/i);
  assert.match(p,/above 180 systolic and\/or above 120 diastolic/i);
  assert.match(p,/Never tell the user to start, stop, double, or change/i);
  assert.match(p,/112/i);
});

test("repairs known unsafe generated claims",()=>{
  const bad=[
    "Tez dhadkan >120-130 bpm ho to ambulance 112 bulayein.",
    "BP 150/95 hypertensive crisis hai.",
    "BP ko har 15-20 minutes mein check karein.",
    "BP 180/110 emergency cutoff hai."
  ].join("\n");
  const fixed=repairKnownUnsafeClaims(bad,"pulse 110 bpm, BP 150/95, halka chakkar");
  assert.match(fixed,/Medical safety correction/i);
  assert.doesNotMatch(fixed,/>120-130 bpm ho to ambulance/i);
  assert.match(fixed,/150\/95/i);
  assert.match(fixed,/above 180\/120/i);
  assert.doesNotMatch(fixed,/har 15-20 minutes mein check/i);
});

test("high-risk footer adds India emergency routing",()=>{
  const out=applyMedicalSafetyFooter("Please get medical help.","severe chest pain right now");
  assert.match(out,/112/);
  assert.match(out,/Emergency safety/i);
});
