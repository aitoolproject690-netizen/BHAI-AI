/**
 * Deterministic medical-safety routing and response guardrails for BHAI X.
 *
 * This layer does not diagnose. It detects health conversations, gives the
 * provider a conservative response contract, and repairs a few known high-risk
 * answer patterns after generation.
 *
 * Guidance anchors:
 * - AHA: >180 systolic and/or >120 diastolic is severe; repeat after at least
 *   one minute. Emergency symptoms in that range require emergency care.
 * - NHS: palpitations that do not settle, or palpitations with chest pain,
 *   shortness of breath, dizziness/feeling faint or fainting, need urgent
 *   emergency assessment.
 * - Government of India ERSS: 112 is the pan-India emergency number.
 */

const MEDICAL_WORDS = /\b(?:health|healthy|medical|medicine|medicines|medication|tablet|tablets|capsule|syrup|dose|dosage|drug|dawai|dava|dawa|goli|doctor|hospital|clinic|symptom|symptoms|pain|fever|cough|cold|vomit|vomiting|diarrhea|dast|bleeding|blood|bp|blood pressure|pulse|heart|heartbeat|dhadkan|dhak.?dhak|saans|breath|breathing|chest|seene|dizziness|dizzy|chakkar|faint|behosh|sweat|pasina|diabetes|sugar|thyroid|infection|injury|wound|pregnan|pregnancy|baby|infant|report|ecg|xray|scan|test|lab|therapy|diagnos|allergy|reaction|rash|swelling|mental health|anxiety|depression)\b/i;

const EMERGENCY_WORDS = /\b(?:chest pain|chest pressure|severe chest|seene? (?:mein|me) dard|saans (?:lene|len) mein (?:bahut|zyada) dikkat|difficulty breathing|shortness of breath|breathing trouble|fainting|fainted|behosh|passing out|severe confusion|confusion|sudden weakness|one[- ]sided weakness|face droop|slurred speech|bolne mein dikkat|speech problem|vision loss|loss of vision|blue lips|unresponsive|seizure|fits|severe bleeding|vomiting blood|black stool|suicide|self harm|overdose|poisoning)\b/i;

function numberAfter(pattern,text){
  const m=String(text).match(pattern);
  return m?Number(m[1]):null;
}

export function isMedicalIntent(text=""){
  return MEDICAL_WORDS.test(String(text))||EMERGENCY_WORDS.test(String(text));
}

export function getMedicalRiskSignals(text=""){
  const raw=String(text);
  const bp=raw.match(/\b(?:bp|blood pressure)\s*(?:is|=|:)?\s*(\d{2,3})\s*(?:\/|over)\s*(\d{2,3})\b/i);
  const systolic=bp?Number(bp[1]):null;
  const diastolic=bp?Number(bp[2]):null;
  const pulse=numberAfter(/\b(?:pulse|heart rate|hr)\s*(?:is|=|:)?\s*(\d{2,3})\s*(?:bpm|per minute|\/min)?\b/i,raw);
  const veryHighBP=(systolic!=null&&systolic>180)||(diastolic!=null&&diastolic>120);
  return {emergencyWords:EMERGENCY_WORDS.test(raw),veryHighBP,pulse,systolic,diastolic};
}

export function getMedicalSafetyPrompt(task=""){
  const risk=getMedicalRiskSignals(task);
  const urgentHint=risk.emergencyWords||risk.veryHighBP;
  return [
    "MEDICAL SAFETY MODE: This request concerns health, symptoms, medicines, or medical tests.",
    "Do not diagnose from chat. Clearly label possibilities as possibilities and separate them from confirmed facts.",
    "Do not give a blanket ambulance threshold based on pulse alone. A pulse such as 110 bpm can be above the normal resting range, but pulse number by itself does not determine an emergency.",
    "For palpitations, current palpitations with chest pain/pressure, significant trouble breathing, fainting/near-fainting, or severe/worsening symptoms need urgent emergency assessment. Persistent/recurrent palpitations without those red flags still deserve clinical review.",
    "For blood pressure, 150/95 is high, not a hypertensive crisis. Severe hypertension is above 180 systolic and/or above 120 diastolic. If a reading is above 180/120, rest and repeat it after at least 1 minute. If it remains that high, contact a healthcare professional promptly; if it is that high with chest pain, shortness of breath, back pain, numbness/weakness, vision change, difficulty speaking, or another new concerning symptom, seek emergency help immediately.",
    "Do not use 180/110, 180/115, 180/125, or other invented variants as a universal emergency cutoff. Preserve the distinction between severe BP and hypertensive emergency.",
    "A single high home BP reading is not by itself a diagnosis. When useful, explain correct measurement: sit quietly for about 5 minutes, back supported, feet flat, arm supported at heart level, then take the reading.",
    "Do not instruct the user to check BP every 15-20 minutes. Prefer one repeat measurement after proper rest when a high reading needs confirmation, then a clinician-guided monitoring plan.",
    "Never tell the user to start, stop, double, or change a prescribed medicine dose based only on chat. Do not invent doses.",
    "Do not prescribe routine electrolyte drinks, coconut water, snacks, or aggressive hydration as treatment unless the context clearly supports it. Ordinary fluids may also be restricted in some heart, kidney, or liver conditions.",
    "Ask only the minimum clarifying questions needed. For palpitations, useful first details are age, onset/duration, pulse/heart rate, BP, chest pain/pressure, breathlessness, dizziness/fainting, sweating, medical conditions, and medicines.",
    "When emergency care is appropriate in India, 112 is the pan-India emergency number.",
    "Use a calm structure: immediate danger check -> what the information may mean -> safe next steps -> when to seek care -> what to track.",
    "Do not list rare diagnoses merely to appear comprehensive.",
    urgentHint ? "HIGH-RISK SIGNAL DETECTED: prioritize emergency triage and do not bury it below background explanations." : ""
  ].filter(Boolean).join("\n");
}

function repairKnownUnsafeClaims(text,task){
  let out=String(text||"").trim();
  const risk=getMedicalRiskSignals(task);
  const corrections=[];

  // Known bad pattern: treating a pulse-only threshold as an ambulance rule.
  if(/(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[\s\S]{0,220}(?:112|ambulance|emergency)/i.test(out)
     ||/pulse\s*(?:>|above|over|more than)\s*120\s*bpm[\s\S]{0,180}(?:112|ambulance|emergency)/i.test(out)){
    out=out.replace(/[^\n]*(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[^\n]*(?:112|ambulance|emergency)[^\n]*/gi,"");
    corrections.push("Pulse number alone is not an automatic ambulance threshold; emergency care depends on symptoms and the clinical situation.");
  }

  // Remove a known unsafe BP cutoff sentence rather than leaving the wrong instruction
  // visible next to the correction.
  if(/\b(?:bp\s*)?180\s*\/\s*1[01]\d\b/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:bp\s*)?180\s*\/\s*1[01]\d.*(?:emergency|cutoff|ambulance|112)/i.test(line)).join("\n");
    corrections.push("BP safety correction: the severe threshold used here is above 180/120 mm Hg, not 180/110. A BP above 180/120 needs a repeat reading and prompt medical assessment; emergency symptoms make it an emergency.");
  }

  // Remove the known unsafe advice to measure BP every 15-20 minutes.
  if(/(?:every|हर|har)\s*15\s*[-–]?\s*20\s*(?:minutes|मिनट)/i.test(out)
     ||/(?:15\s*[-–]?\s*20\s*(?:minutes|मिनट)).*(?:bp|blood pressure)/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:every|हर|har)\s*15\s*[-–]?\s*20\s*(?:minutes|मिनट)/i.test(line)).join("\n");
    corrections.push("BP ko har 15-20 minute baar-baar check karna zaroori nahi hai; high reading ko proper rest ke baad ek baar repeat karna better hai.");
  }

  // Do not let the model definitively rule out an emergency from chat.
  if(/\b(?:not an emergency|is not an emergency|no emergency|no immediate emergency)\b/i.test(out)
     && risk.pulse!=null
     && /(?:chakkar|dizz|faint|lightheaded|behosh)/i.test(task)){
    out=out.replace(/\b(?:there (?:is|isn't) no|no|not an?)\s+(?:immediate\s+)?emergency\b/gi,"an emergency cannot be ruled out from chat alone");
    corrections.push("Emergency ko chat se definitively rule out nahi karna chahiye; symptoms worsen hon ya red flags aayein to urgent care lein.");
  }

  if(risk.systolic===150&&risk.diastolic===95&&/(?:hypertensive crisis|hypertensive emergency|crisis)/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:150\s*\/\s*95).*(?:hypertensive crisis|hypertensive emergency|crisis)/i.test(line)).join("\n");
    corrections.push("BP 150/95 ko hypertensive crisis/emergency na kahen; yeh high BP reading hai, aur diagnosis doctor confirm karta hai.");
  }

  if(corrections.length){
    out=out.replace(/\n{3,}/g,"\n\n").trim();
    out="⚠️ **Medical safety correction:**\n"+corrections.join("\n")+(out?"\n\n"+out:"");
  }
  return out;
}

export function applyMedicalSafetyFooter(text="",task=""){
  const repaired=repairKnownUnsafeClaims(text,task);
  const risk=getMedicalRiskSignals(task);
  if(!repaired)return repaired;
  if(!(risk.emergencyWords||risk.veryHighBP))return repaired;
  if(/(?:emergency|ambulance|112)\b/i.test(repaired))return repaired;
  return repaired+"\n\n⚠️ **Emergency safety:** Agar abhi chest pain/pressure, severe saans ki dikkat, behoshi/near-fainting, sudden weakness/speech/vision problem, ya very high BP ke saath naya concerning symptom hai, to turant emergency medical help lein. India mein **112** par call kar sakte hain.";
}

export { repairKnownUnsafeClaims };
