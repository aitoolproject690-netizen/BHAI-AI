/**
 * Deterministic medical-safety routing and response guardrails for BHAI X.
 *
 * This layer does not diagnose. It detects health conversations, gives the
 * provider a conservative response contract, and repairs known high-risk
 * answer patterns after generation.
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
  // Severe BP guardrail: 180 systolic OR 120 diastolic or higher.
  const veryHighBP=(systolic!=null&&systolic>=180)||(diastolic!=null&&diastolic>=120);
  return {emergencyWords:EMERGENCY_WORDS.test(raw),veryHighBP,pulse,systolic,diastolic};
}

export function getMedicalSafetyPrompt(task=""){
  const risk=getMedicalRiskSignals(task);
  const urgentHint=risk.emergencyWords||risk.veryHighBP;
  return [
    "MEDICAL SAFETY MODE: This request concerns health, symptoms, medicines, or medical tests.",
    "Do not diagnose from chat. Clearly label possibilities as possibilities and separate them from confirmed facts.",
    "Do not give a blanket ambulance threshold based on pulse alone. A fast pulse can be above the normal resting range, but pulse number by itself does not determine an emergency.",
    "For palpitations, current palpitations with chest pain/pressure, significant trouble breathing, fainting/near-fainting, or severe/worsening symptoms need urgent emergency assessment. Persistent/recurrent palpitations without those red flags still deserve clinical review.",
    "For blood pressure, 150/95 is an elevated/high BP reading, not a hypertensive crisis. Severe hypertension is systolic 180 or higher and/or diastolic 120 or higher. If a reading reaches that range, rest and repeat it after at least 1 minute. If it remains severe, seek prompt medical assessment; if severe BP occurs with chest pain, shortness of breath, back pain, numbness/weakness, vision change, difficulty speaking, or another new concerning symptom, seek emergency help immediately.",
    "Do not use 180/110, 180/115, or other invented variants as a universal emergency cutoff. Preserve the distinction between severe BP and hypertensive emergency.",
    "A single high home BP reading is not by itself a diagnosis. When useful, explain correct measurement: sit quietly for about 5 minutes, back supported, feet flat, arm supported at heart level, then take the reading.",
    "Do not instruct the user to check BP every 15-20 minutes. Prefer one repeat measurement after proper rest when a high reading needs confirmation, then a clinician-guided monitoring plan.",
    "Never tell the user to start, stop, double, or change a prescribed medicine dose based only on chat. Do not invent doses.",
    "Do not prescribe routine electrolyte drinks, coconut water, snacks, or aggressive hydration as treatment unless the context clearly supports it. Ordinary fluids may also be restricted in some heart, kidney, or liver conditions.",
    "Keep the differential concise: mention only a few common/likely possibilities when useful, not a long list of rare diagnoses.",
    "Do not say an emergency has been completely ruled out from chat. Use cautious safety-netting language when no classic red flag is reported.",
    "When emergency care is appropriate in India, 112 is the pan-India emergency number.",
    "Use a calm structure: immediate danger check -> what the information may mean -> safe next steps -> when to seek care -> what to track.",
    urgentHint ? "HIGH-RISK SIGNAL DETECTED: prioritize emergency triage and do not bury it below background explanations." : ""
  ].filter(Boolean).join("\n");
}

function removeUnsafeLine(line){
  const s=String(line);
  return /(?:every|har)\s*15\s*[-–]?\s*20\s*(?:minutes|minute|मिनट)/i.test(s)
    || /(?:coconut water|electrolyte(?:s)?|electrolyte drink|ORS|snack)/i.test(s)
       && /(?:take|drink|lo|lelo|lijiye|must|should|necessary|zaroori|treatment|treat|fix|cure|theek|rehydrat)/i.test(s)
    || /(?:start|stop|double|increase|decrease|change|skip|hold|resume|dose\s+double|double\s+the\s+dose).{0,80}(?:dose|dosage|medicine|medication|tablet|goli)?/i.test(s)
       && /(?:dose|dosage|medicine|medication|tablet|goli|prescription)/i.test(s);
}

function repairKnownUnsafeClaims(text,task){
  let out=String(text||"").trim();
  const risk=getMedicalRiskSignals(task);
  const corrections=[];

  // Pulse-only emergency/ambulance rules are unsafe. Remove the offending
  // sentence and replace it with symptom/context-based triage.
  if(/(?:pulse|heart rate|hr|dhadkan)[^\n.!?]{0,140}(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[^\n.!?]*(?:112|ambulance|emergency)/i.test(out)
     ||/(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[^\n.!?]*(?:112|ambulance|emergency)/i.test(out)){
    out=out.split("\n").filter(line=>!/\b120\s*(?:-|to)\s*130\s*bpm\b[^\n]*(?:112|ambulance|emergency)|(?:pulse|heart rate|hr|dhadkan)[^\n]{0,180}(?:ambulance|112)/i.test(line)).join("\n");
    corrections.push("Pulse number alone is not an automatic ambulance threshold; emergency care depends on symptoms and the clinical situation.");
  }

  // Repair incorrect severe-BP thresholds while preserving useful context.
  if(/\b180\s*\/\s*1(?:0|1|15)\b/i.test(out) || /\b180\s*\/\s*110\b/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:180\s*\/\s*(?:110|115)|180\s*\/\s*11\d).*(?:emergency|cutoff|ambulance|112|crisis)/i.test(line)).join("\n");
    corrections.push("BP safety correction: severe BP is systolic 180 or higher and/or diastolic 120 or higher; symptoms and the repeat reading determine urgency.");
  }

  if(/(?:\b(?:BP|blood pressure)\b[^\n]{0,80})(?:150\s*\/\s*95|150\/95)[^\n]{0,80}(?:high[- ]normal|normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(out)
     ||(risk.systolic===150&&risk.diastolic===95&&/(?:high[- ]normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(out))){
    out=out.split("\n").filter(line=>!/(?:150\s*\/\s*95).*(?:high[- ]normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(line)).join("\n");
    corrections.push("BP 150/95 ko elevated/high BP reading kahen; ise hypertensive crisis/emergency nahi kahen.");
  }

  if(out.split("\n").some(removeUnsafeLine)){
    out=out.split("\n").filter(line=>!removeUnsafeLine(line)).join("\n");
    corrections.push("BP ko har 15-20 minute baar-baar check karna zaroori nahi hai; high reading ko proper rest aur correct technique ke baad ek baar repeat karna better hai.");
    if(/coconut water|electrolyte|ORS|snack/i.test(String(text))) corrections.push("Coconut water/electrolytes/snack ko blanket treatment na banayein; hydration advice context-dependent hoti hai.");
    if(/(?:start|stop|double|increase|decrease|change|skip|hold|resume).{0,60}(?:dose|dosage|medicine|medication|tablet|goli)/i.test(String(text))) corrections.push("Prescription medicine ki dose/start-stop/change chat se decide nahi karni chahiye; clinician/pharmacist se confirm karein.");
  }

  // Definitive emergency exclusion is not appropriate in chat. Remove the
  // sentence rather than replacing text inside the replacement itself.
  if(/\b(?:this|the current situation|it)\s+(?:is|seems)\s+not\s+an\s+emergency\b|\b(?:not an emergency|no emergency|no immediate emergency)\b/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:not an emergency|no emergency|no immediate emergency|current situation.*not.*emergency)/i.test(line)).join("\n");
    corrections.push("Given information mein classic emergency red flag report nahi hua ho sakta hai, lekin chat se emergency completely rule out nahi ki ja sakti. New/worsening red flags par urgent help lein.");
  }

  if(corrections.length){
    out=out.replace(/\n{3,}/g,"\n\n").trim();
    out="⚠️ **Medical safety correction:**\n"+corrections.join("\n")+(out?"\n\n"+out:"");
  }
  return out;
}

export function sanitizeMedicalResponse(text="",task=""){
  return repairKnownUnsafeClaims(text,task);
}

export function applyMedicalSafetyFooter(text="",task=""){
  const repaired=sanitizeMedicalResponse(text,task);
  const risk=getMedicalRiskSignals(task);
  if(!repaired)return repaired;
  if(!(risk.emergencyWords||risk.veryHighBP))return repaired;
  if(/(?:emergency|ambulance|112)\b/i.test(repaired))return repaired;
  return repaired+"\n\n⚠️ **Emergency safety:** Agar abhi chest pain/pressure, severe saans ki dikkat, behoshi/near-fainting, sudden weakness/speech/vision problem, ya severe BP ke saath naya concerning symptom hai, to turant emergency medical help lein. India mein **112** par call kar sakte hain.";
}

export { repairKnownUnsafeClaims };
