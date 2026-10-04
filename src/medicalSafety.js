/**
 * Deterministic medical-safety routing and response guardrails for BHAI X.
 *
 * This module does not diagnose. It only detects health/medicine conversations,
 * marks high-risk signals, and supplies a conservative instruction block to the
 * configured AI provider.
 *
 * Guidance anchors:
 * - American Heart Association: severe hypertension >180/120; emergency when
 *   that range is accompanied by chest pain, shortness of breath, back pain,
 *   numbness/weakness, vision change or difficulty speaking.
 * - NHS: ongoing palpitations that do not go away, or palpitations with chest
 *   pain, shortness of breath, feeling faint/fainting, need emergency care.
 * - Government of India ERSS: 112 is the pan-India emergency number and
 *   includes medical emergency assistance.
 */

const MEDICAL_WORDS = /\b(?:health|healthy|medical|medicine|medicines|medication|tablet|tablets|capsule|syrup|dose|dosage|drug|dawai|dava|dawa|goli|doctor|hospital|clinic|symptom|symptoms|pain|fever|cough|cold|vomit|vomiting|diarrhea|dast|bleeding|blood|bp|blood pressure|pulse|heart|heartbeat|dhadkan|dhak.?dhak|saans|breath|breathing|chest|seene|dizziness|dizzy|chakkar|faint|behosh|sweat|pasina|diabetes|sugar|thyroid|infection|injury|wound|pregnan|pregnancy|baby|infant|report|ecg|xray|scan|test|lab|therapy|diagnos|allergy|reaction|rash|swelling|mental health|anxiety|depression)\b/i;

const EMERGENCY_WORDS = /\b(?:chest pain|chest pressure|severe chest|seene? (?:mein|me) dard|saans (?:lene|len) mein (?:bahut|zyada) dikkat|difficulty breathing|shortness of breath|breathing trouble|fainting|fainted|behosh|passing out|severe confusion|confusion|sudden weakness|one[- ]sided weakness|face droop|slurred speech|bolne mein dikkat|speech problem|vision loss|loss of vision|blue lips|unresponsive|seizure|fits|severe bleeding|vomiting blood|black stool|suicide|self harm|overdose|poisoning)\b/i;

function numberAfter(pattern, text) {
  const m=String(text).match(pattern);
  return m ? Number(m[1]) : null;
}

export function isMedicalIntent(text="") {
  return MEDICAL_WORDS.test(String(text)) || EMERGENCY_WORDS.test(String(text));
}

export function getMedicalRiskSignals(text="") {
  const raw=String(text);
  const systolic=numberAfter(/\b(?:bp|blood pressure)\s*(?:is|=|:)?\s*(\d{2,3})\s*(?:\/|over)\s*\d{2,3}\b/i,raw);
  const diastolicMatch=raw.match(/\b(?:bp|blood pressure)\s*(?:is|=|:)?\s*\d{2,3}\s*(?:\/|over)\s*(\d{2,3})\b/i);
  const diastolic=diastolicMatch?Number(diastolicMatch[1]):null;
  const pulse=numberAfter(/\b(?:pulse|heart rate|hr)\s*(?:is|=|:)?\s*(\d{2,3})\s*(?:bpm|per minute|\/min)?\b/i,raw);
  const veryHighBP=(systolic!=null&&systolic>180)||(diastolic!=null&&diastolic>120);
  return {
    emergencyWords:EMERGENCY_WORDS.test(raw),
    veryHighBP,
    pulse,
    systolic,
    diastolic
  };
}

export function getMedicalSafetyPrompt(task="") {
  const risk=getMedicalRiskSignals(task);
  const urgentHint=risk.emergencyWords||risk.veryHighBP;
  return [
    "MEDICAL SAFETY MODE: This request concerns health, symptoms, medicines, or medical tests.",
    "Do not diagnose from chat. Clearly label possibilities as possibilities and separate them from confirmed facts.",
    "Start with immediate triage when symptoms could be urgent. If the user describes current chest pain/pressure, severe breathing difficulty, fainting/near-fainting, severe confusion, sudden weakness/face droop/speech or vision changes, seizure, major bleeding, poisoning/overdose, or another potentially life-threatening symptom, tell them to seek emergency medical help immediately rather than continuing a long home-care plan.",
    "For a palpitations/heart-beating complaint, ongoing palpitations that do not settle or palpitations with chest pain, shortness of breath, or feeling faint/fainting warrant emergency assessment.",
    "For blood pressure, do not call 150/95 or similar readings a hypertensive crisis. A reading above 180 systolic and/or above 120 diastolic is severe; repeat after at least 1 minute. If it remains that high with chest pain, shortness of breath, back pain, numbness/weakness, vision change, difficulty speaking, or another new concerning symptom, treat it as an emergency.",
    "A single high home BP reading is not by itself proof of a diagnosis. Give measurement technique when useful: seated with back supported, feet flat, arm supported at heart level, quiet/resting before measurement.",
    "Never tell the user to start, stop, double, or change a prescribed medicine dose based only on chat. Do not invent doses. If a medicine name/strength is unclear, ask for the exact label/photo or advise a pharmacist/clinician.",
    "Avoid blanket advice such as aggressive hydration or electrolyte drinks when heart, kidney, liver, or fluid-restriction conditions may exist. Tailor advice to the information actually provided.",
    "Ask only the minimum clarifying questions needed. For symptoms like palpitations, useful first details can include age, onset/duration, pulse/heart rate, BP, chest pain/pressure, breathlessness, dizziness/fainting, sweating, medical conditions, and medicines.",
    "When the answer involves emergency care in India, 112 is the pan-India emergency number for emergency assistance.",
    "Prefer a calm structure: immediate danger check -> what the information could mean -> safe steps -> when to see a doctor -> what information to track/bring.",
    "If the user provides a report/photo, say what is actually visible/readable and what cannot be concluded from it.",
    "Do not present a long list of rare diagnoses merely to appear comprehensive.",
    urgentHint ? "HIGH-RISK SIGNAL DETECTED: prioritize emergency triage and do not bury it below background explanations." : ""
  ].filter(Boolean).join("\n");
}

export function applyMedicalSafetyFooter(text="",task="") {
  const risk=getMedicalRiskSignals(task);
  const raw=String(text||"").trim();
  if(!raw) return raw;
  const needsEmergency=(risk.emergencyWords||risk.veryHighBP);
  if(!needsEmergency) return raw;
  const alreadyMentionsEmergency=/(?:emergency|ambulance|112)\b/i.test(raw);
  if(alreadyMentionsEmergency) return raw;
  return raw+"\n\n⚠️ **Emergency safety:** Agar abhi chest pain/pressure, severe saans ki dikkat, behoshi/near-fainting, sudden weakness/speech/vision problem, ya bahut high BP ke saath naya concerning symptom hai, to turant emergency medical help lein. India mein **112** par call kar sakte hain.";
}
