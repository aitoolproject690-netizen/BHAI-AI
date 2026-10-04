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


test("medical intent catches common symptom-only questions",()=>{
  assert.equal(isMedicalIntent("2 din se halka headache aur fatigue hai"),true);
  assert.equal(isMedicalIntent("thakan aur weakness ho rahi hai"),true);
});

test("emergency sanitizer replaces unsafe provider output with a minimal safe response",()=>{
  const bad=[
    "Ye acute coronary syndrome ya pulmonary embolism ho sakta hai.",
    "112 par ambulance bulayein.",
    "Gehri 4-4-4 saans lein.",
    "Agar aspirin 300 mg available hai to ek tablet le sakte hain.",
    "Agar beta-blocker/nitrate nayi hai to ab rok dein.",
    "PCI ya intubation hospital mein ho sakta hai.",
    "Raat mein torch/flashlight lagayein."
  ].join("\n");

  const fixed=sanitizeMedicalResponse(bad,"chest pressure, difficulty breathing aur cold sweat");
  assert.match(fixed,/112/);
  assert.match(fixed,/khud drive n/i);
  assert.match(fixed,/शारीरिक मेहनत न करें/);
  assert.doesNotMatch(fixed,/acute coronary syndrome|pulmonary embolism|aspirin|300\s*mg|beta-blocker|nitrate|PCI|intubation|torch|flashlight|4-4-4/i);
  assert.doesNotMatch(fixed,/नई दवा.*रोकें|aspirin dose/i);
});

test("medicine doses and medication changes are removed from non-emergency answers",()=>{
  const bad=[
    "Paracetamol 500 mg le lo.",
    "Ibuprofen 200-400 mg khane ke baad lo.",
    "Apni medicine ki dose double kar do.",
    "Nayi medicine ko ab rok dein.",
    "Coconut water aur electrolytes treatment ke liye lo.",
    "BP ko har 15-20 minutes mein check karo."
  ].join("\n");

  const fixed=sanitizeMedicalResponse(bad,"headache aur fatigue");
  assert.doesNotMatch(fixed,/Paracetamol 500\s*mg|Ibuprofen 200-400\s*mg|dose double kar do|Nayi medicine ko ab rok dein|Coconut water.*treatment|har 15-20 minutes/i);
  assert.match(fixed,/dose.*khud se.*start|start\/stop\/change|Unsafe medication/i);
});

test("severe BP gets deterministic urgent guidance without medication dosing",()=>{
  const fixed=sanitizeMedicalResponse("BP 185/122 hai, ghar par aspirin 300 mg le lo.","BP 185/122");
  assert.match(fixed,/180 या अधिक|120 या अधिक/);
  assert.match(fixed,/कम से कम 1 मिनट बाद/);
  assert.match(fixed,/112/);
  assert.doesNotMatch(fixed,/aspirin|300\s*mg/i);
});
