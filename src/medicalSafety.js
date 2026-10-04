/**
 * Deterministic medical-safety routing and response guardrails for BHAI X.
 *
 * This layer does not diagnose. It detects health conversations, gives the
 * provider a conservative response contract, and repairs/replaces known
 * high-risk answer patterns after generation.
 */

const MEDICAL_WORDS = /\b(?:health|healthy|medical|medicine|medicines|medication|tablet|tablets|capsule|syrup|dose|dosage|drug|dawai|dava|dawa|goli|doctor|hospital|clinic|symptom|symptoms|pain|headache|migraine|fatigue|tired|thakan|weakness|kamzori|fever|cough|cold|vomit|vomiting|diarrhea|dast|bleeding|blood|bp|blood pressure|pulse|heart|heartbeat|palpitations?|dhadkan|dhak.?dhak|saans|breath|breathing|chest|seene|dizziness|dizzy|chakkar|faint|behosh|sweat|pasina|diabetes|sugar|thyroid|infection|injury|wound|pregnan|pregnancy|baby|infant|report|ecg|xray|scan|test|lab|therapy|diagnos|allergy|reaction|rash|swelling|mental health|anxiety|depression)\b/i;

const EMERGENCY_WORDS = /\b(?:chest pain|chest pressure|severe chest|seene? (?:mein|me) dard|seene? (?:mein|me) pressure|saans (?:lene|len) mein (?:bahut|zyada) dikkat|difficulty breathing|shortness of breath|breathing trouble|fainting|fainted|behosh|passing out|severe confusion|confusion|sudden weakness|one[- ]sided weakness|face droop|slurred speech|bolne mein dikkat|speech problem|vision loss|loss of vision|blue lips|unresponsive|seizure|fits|severe bleeding|vomiting blood|black stool|suicide|self harm|overdose|poisoning)\b/i;

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
  const veryHighBP=(systolic!=null&&systolic>=180)||(diastolic!=null&&diastolic>=120);
  return {emergencyWords:EMERGENCY_WORDS.test(raw),veryHighBP,pulse,systolic,diastolic};
}

export function getMedicalSafetyPrompt(task=""){
  const risk=getMedicalRiskSignals(task);
  const urgentHint=risk.emergencyWords||risk.veryHighBP;
  return [
    "MEDICAL SAFETY MODE: This request concerns health, symptoms, medicines, or medical tests.",
    "Do not diagnose from chat. Clearly label possibilities as possibilities and separate them from confirmed facts.",
    "For a simple symptom question, keep the answer concise and practical; do not produce a large differential table or long list of rare diagnoses.",
    "Do not give a blanket ambulance threshold based on pulse alone. A fast pulse can be above the normal resting range, but pulse number by itself does not determine an emergency.",
    "For palpitations, current palpitations with chest pain/pressure, significant trouble breathing, fainting/near-fainting, or severe/worsening symptoms need urgent emergency assessment. Persistent/recurrent palpitations without those red flags still deserve clinical review.",
    "For blood pressure, 150/95 is an elevated/high BP reading, not a hypertensive crisis. Severe hypertension is systolic 180 or higher and/or diastolic 120 or higher. If a reading reaches that range, rest and repeat it after at least 1 minute. If it remains severe, seek prompt medical assessment; if severe BP occurs with chest pain, shortness of breath, back pain, numbness/weakness, vision change, difficulty speaking, or another new concerning symptom, seek emergency help immediately.",
    "Do not use 180/110, 180/115, or other invented variants as a universal emergency cutoff. Preserve the distinction between severe BP and hypertensive emergency.",
    "A single high home BP reading is not by itself a diagnosis. When useful, explain correct measurement: sit quietly for about 5 minutes, back supported, feet flat, arm supported at heart level, then take the reading.",
    "Do not instruct the user to check BP every 15-20 minutes. Prefer one repeat measurement after proper rest when a high reading needs confirmation, then a clinician-guided monitoring plan.",
    "Never tell the user to start, stop, double, or change a prescribed medicine dose based only on chat. Do not invent medicine doses or recommend aspirin doses.",
    "Do not prescribe routine electrolyte drinks, coconut water, snacks, or aggressive hydration as treatment unless the context clearly supports it. Ordinary fluids may also be restricted in some heart, kidney, or liver conditions.",
    "For emergency symptoms, give the immediate action first: urgent emergency care, India 112, no self-driving, reduce exertion, and follow emergency-dispatch/clinician instructions. Do not add unnecessary procedure details, medication dosing, or unrelated tips.",
    "Do not say an emergency has been completely ruled out from chat. Use cautious safety-netting language when no classic red flag is reported.",
    "When emergency care is appropriate in India, 112 is the pan-India emergency number.",
    "Use a calm structure: immediate danger check -> what the information may mean -> safe next steps -> when to seek care -> what to track.",
    urgentHint ? "HIGH-RISK SIGNAL DETECTED: prioritize emergency triage and do not bury it below background explanations." : ""
  ].filter(Boolean).join("\n");
}

const MED_ACTION_RE = /(?:start|stop|restart|double|increase|decrease|change|skip|hold|resume|take|lo|lelo|lijiye|rok|roko|rok de|rok dein|band|band karo|band kar|must|should|necessary|zaroori|treatment|treat|fix|cure|theek|rehydrat|रोक|रोकें|बंद|बंद करें|दोगुना|बढ़ाएँ|कम करें|बदलें|लें|लेें).{0,120}(?:dose|dosage|medicine|medication|tablet|goli|aspirin|paracetamol|acetaminophen|ibuprofen|nitrate|nitroglycerin|beta[- ]?blocker|drug|दवा|दवाई|गोली)/i;
const MED_ACTION_RE_REVERSED = /(?:dose|dosage|medicine|medication|tablet|goli|aspirin|paracetamol|acetaminophen|ibuprofen|nitrate|nitroglycerin|beta[- ]?blocker|drug|दवा|दवाई|गोली).{0,120}(?:start|stop|restart|double|increase|decrease|change|skip|hold|resume|take|lo|lelo|lijiye|rok|roko|rok de|rok dein|band|band karo|band kar|must|should|necessary|zaroori|treatment|treat|fix|cure|theek|rehydrat|रोक|रोकें|बंद|बंद करें|दोगुना|बढ़ाएँ|कम करें|बदलें|लें|लेें)/i;
const SPECIFIC_DOSE_RE = /\b(?:aspirin|paracetamol|acetaminophen|ibuprofen|nitrate|nitroglycerin|tablet|capsule|syrup|medicine|medication|goli)\b[^\n]{0,100}\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|ml)\b/i;

function removeUnsafeLine(line){
  const s=String(line);
  if(/(?:every|har)\s*15\s*[-–]?\s*20\s*(?:minutes|minute|मिनट)/i.test(s)) return true;
  if(/(?:coconut water|electrolyte(?:s)?|electrolyte drink|ORS|snack|नारियल पानी|इलेक्ट्रोलाइट|ओआरएस)/i.test(s)
     && /(?:take|drink|lo|lelo|lijiye|must|should|necessary|zaroori|treatment|treat|fix|cure|theek|rehydrat|पीएँ|लेें|लें|जरूरी|इलाज)/i.test(s)) return true;
  if(MED_ACTION_RE.test(s)||MED_ACTION_RE_REVERSED.test(s)||SPECIFIC_DOSE_RE.test(s)) return true;
  if(/(?:\b(?:PCI|percutaneous coronary intervention|catheterization|intubation)\b|\b(?:flashlight|torch)\b)/i.test(s)) return true;
  return false;
}

function buildEmergencyResponse(task=""){
  return [
    "🚨 **अभी तुरंत मेडिकल मदद लें**",
    "",
    "आपके बताए लक्षण गंभीर हो सकते हैं और इन्हें चैट से सुरक्षित रूप से rule out नहीं किया जा सकता।",
    "",
    "**अभी क्या करें:**",
    "1. भारत में **112** पर कॉल करें या तुरंत स्थानीय emergency service लें।",
    "2. **खुद drive न करें**; किसी भरोसेमंद व्यक्ति को साथ रखें।",
    "3. बैठकर/आराम की स्थिति में रहें और शारीरिक मेहनत न करें।",
    "4. Emergency operator या clinician के निर्देश follow करें।",
    "5. चैट के आधार पर **कोई नई दवा या prescribed medicine की dose खुद से शुरू/बंद/बदलें नहीं**।",
    "",
    "अगर बेहोशी, बहुत ज्यादा सांस की तकलीफ, हालत बिगड़ना, या कोई नया गंभीर लक्षण हो तो emergency dispatcher को तुरंत बताएं।"
  ].join("\n");
}

function buildSevereBPResponse(){
  return [
    "⚠️ **BP severe range में है**",
    "",
    "सिस्टोलिक **180 या अधिक** या डायस्टोलिक **120 या अधिक** severe BP range है।",
    "",
    "**अभी:**",
    "1. कुछ मिनट शांत बैठें और सही तरीके से BP दोबारा **कम से कम 1 मिनट बाद** लें।",
    "2. अगर reading फिर भी severe range में रहे, तो prompt medical assessment लें।",
    "3. अगर इसके साथ chest pain/pressure, सांस की गंभीर दिक्कत, कमजोरी/सुन्नपन, vision change, बोलने में दिक्कत, बेहोशी या कोई नया concerning symptom हो, तो **तुरंत 112/emergency help** लें।",
    "4. दवा की dose खुद से start/stop/double/change न करें।"
  ].join("\n");
}

function repairKnownUnsafeClaims(text,task){
  const rawText=String(text||"").trim();
  const rawTask=String(task||"");
  const risk=getMedicalRiskSignals(rawTask);

  // For genuine emergency signals, replace the provider response entirely.
  // This prevents medication advice, invented procedures, hallucinations, or
  // overlong explanations from surviving a final answer.
  if(risk.emergencyWords) return buildEmergencyResponse(rawTask);

  // For severe BP without another emergency symptom, return a focused,
  // deterministic triage response instead of relying on free-form model text.
  if(risk.veryHighBP) return buildSevereBPResponse();

  let out=rawText;
  const corrections=[];

  if(/(?:pulse|heart rate|hr|dhadkan)[^\n.!?]{0,140}(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[^\n.!?]*(?:112|ambulance|emergency)/i.test(out)
     ||/(?:>|above|over|more than)\s*120\s*(?:-|to)\s*130\s*bpm[^\n.!?]*(?:112|ambulance|emergency)/i.test(out)){
    out=out.split("\n").filter(line=>!/\b120\s*(?:-|to)\s*130\s*bpm\b[^\n]*(?:112|ambulance|emergency)|(?:pulse|heart rate|hr|dhadkan)[^\n]{0,180}(?:ambulance|112)/i.test(line)).join("\n");
    corrections.push("Pulse number alone is not an automatic ambulance threshold; emergency care depends on symptoms and the clinical situation.");
  }

  if(/\b180\s*\/\s*(?:110|115)\b/i.test(out)){
    out=out.split("\n").filter(line=>!/(?:180\s*\/\s*(?:110|115)|180\s*\/\s*11\d).*(?:emergency|cutoff|ambulance|112|crisis)/i.test(line)).join("\n");
    corrections.push("BP safety correction: severe BP is systolic 180 or higher and/or diastolic 120 or higher; symptoms and the repeat reading determine urgency.");
  }

  if(/(?:\b(?:BP|blood pressure)\b[^\n]{0,80})(?:150\s*\/\s*95|150\/95)[^\n]{0,80}(?:high[- ]normal|normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(out)
     ||(risk.systolic===150&&risk.diastolic===95&&/(?:high[- ]normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(out))){
    out=out.split("\n").filter(line=>!/(?:150\s*\/\s*95).*(?:high[- ]normal|hypertensive crisis|hypertensive emergency|crisis)/i.test(line)).join("\n");
    corrections.push("BP 150/95 ko elevated/high BP reading kahen; ise hypertensive crisis/emergency nahi kahen.");
  }

  const originalLines=out.split("\n");
  const kept=[];
  let removedUnsafe=false;
  for(const line of originalLines){
    if(removeUnsafeLine(line)){ removedUnsafe=true; continue; }
    kept.push(line);
  }
  out=kept.join("\n");

  if(removedUnsafe){
    corrections.push("Unsafe medication dosing/change, rapid BP rechecking, blanket electrolyte treatment, and unrelated procedure tips were removed. Prescribed medicine ki dose chat se khud se start/stop/change nahi karni chahiye.");
  }

  if(/(?:not an emergency|no emergency|no immediate emergency|current situation.*not.*emergency)/i.test(out)){
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
  return sanitizeMedicalResponse(text,task);
}

export { repairKnownUnsafeClaims,buildEmergencyResponse,buildSevereBPResponse };
