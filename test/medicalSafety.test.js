import test from "node:test";
import assert from "node:assert/strict";
import {isMedicalIntent,getMedicalRiskSignals,getMedicalSafetyPrompt,applyMedicalSafetyFooter,repairKnownUnsafeClaims,sanitizeMedicalResponse} from "../src/medicalSafety.js";

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

  const e=getMedicalRiskSignals("BP 180/120 aur chest pain hai");
  assert.equal(e.veryHighBP,true);
  assert.equal(e.emergencyWords,true);

  const boundary=getMedicalRiskSignals("BP 179/120");
  assert.equal(boundary.veryHighBP,true);
});

test("safety prompt has explicit BP, pulse, medicine and monitoring rules",()=>{
  const p=getMedicalSafetyPrompt("Papa ki dhadkan tez hai, BP 150/95");
  assert.match(p,/Do not diagnose from chat/i);
  assert.match(p,/150\/95 is an elevated\/high BP reading, not a hypertensive crisis/i);
  assert.match(p,/pulse number by itself does not determine an emergency/i);
  assert.match(p,/systolic 180 or higher and\/or diastolic 120 or higher/i);
  assert.match(p,/Do not instruct the user to check BP every 15-20 minutes/i);
  assert.match(p,/Never tell the user to start, stop, double, or change/i);
  assert.match(p,/112/i);
});

test("sanitizer repairs the known unsafe production claims",()=>{
  const bad=[
    "Tez dhadkan >120-130 bpm ho to ambulance 112 bulayein.",
    "BP 150/95 high-normal hai.",
    "BP ko har 15-20 minutes mein check karein.",
    "BP 180/110 emergency cutoff hai.",
    "Coconut water aur electrolytes lo, isi se situation theek ho jayegi.",
    "Apni medicine ki dose double kar do.",
    "Current situation is not an emergency."
  ].join("\n");

  const fixed=sanitizeMedicalResponse(bad,"pulse 130 bpm, BP 150/95, halka chakkar");
  assert.match(fixed,/Medical safety correction/i);
  assert.doesNotMatch(fixed,/>120-130 bpm ho to ambulance/i);
  assert.doesNotMatch(fixed,/150\/95 high-normal/i);
  assert.doesNotMatch(fixed,/har 15-20 minutes mein check/i);
  assert.doesNotMatch(fixed,/180\/110 emergency cutoff/i);
  assert.doesNotMatch(fixed,/coconut water aur electrolytes lo, isi se situation theek ho jayegi/i);
  assert.doesNotMatch(fixed,/dose double kar do/i);
  assert.doesNotMatch(fixed,/Current situation is not an emergency/i);
  assert.match(fixed,/systolic 180 or higher|severe BP/i);
  assert.match(fixed,/chat se emergency completely rule out nahi ki ja/i);
});

test("high-risk footer adds India emergency routing",()=>{
  const out=applyMedicalSafetyFooter("Please get medical help.","severe chest pain right now");
  assert.match(out,/112/);
  assert.match(out,/Emergency safety/i);
});

test("150/95 remains a high reading and severe BP uses the >=180/120 boundary",()=>{
  const normal=repairKnownUnsafeClaims("BP 150/95 hai, ye high BP reading hai.","BP 150/95");
  assert.doesNotMatch(normal,/hypertensive crisis|hypertensive emergency/i);
  const severe=getMedicalRiskSignals("BP 180/119");
  assert.equal(severe.veryHighBP,true);
  const severe2=getMedicalRiskSignals("BP 179/120");
  assert.equal(severe2.veryHighBP,true);
});
