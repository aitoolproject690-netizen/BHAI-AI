import { isMedicalIntent, getMedicalRiskSignals, sanitizeMedicalResponse } from "../src/medicalSafety.js";

function runMedicalSafetySelfCheck(){
  const failures=[];
  const assert=(name,condition)=>{ if(!condition) failures.push(name); };

  const medical=isMedicalIntent("pulse 130 bpm aur BP 150/95 hai");
  const risk=getMedicalRiskSignals("BP 180/120");
  const unsafe=[
    "Tez dhadkan >120-130 bpm ho to ambulance 112 bulayein.",
    "BP 150/95 high-normal hai.",
    "BP ko har 15-20 minutes mein check karein.",
    "BP 180/110 emergency cutoff hai.",
    "Coconut water aur electrolytes lo, isi se situation theek ho jayegi.",
    "Apni medicine ki dose double kar do.",
    "Current situation is not an emergency."
  ].join("\n");
  const fixed=sanitizeMedicalResponse(unsafe,"pulse 130 bpm, BP 150/95");

  assert("medical_intent",medical===true);
  assert("severe_bp_boundary",risk.veryHighBP===true);
  assert("pulse_blanket_ambulance_removed",!/>120-130 bpm ho to ambulance/i.test(fixed));
  assert("150_95_not_crisis",!/150\/95 high-normal/i.test(fixed));
  assert("rapid_bp_checking_removed",!/har 15-20 minutes mein check/i.test(fixed));
  assert("180_110_claim_removed",!/180\/110 emergency cutoff/i.test(fixed));
  assert("electrolyte_blanket_treatment_removed",!/Coconut water aur electrolytes lo, isi se situation theek ho jayegi/i.test(fixed));
  assert("medicine_change_removed",!/dose double kar do/i.test(fixed));
  assert("definitive_no_emergency_removed",!/Current situation is not an emergency/i.test(fixed));
  assert("cautious_safety_wording",/emergency completely rule out nahi ki ja/i.test(fixed));

  return {ok:failures.length===0, failures, checkedAt:new Date().toISOString()};
}

export default async function handler(req,res){
  const commit=process.env.RENDER_GIT_COMMIT||"";
  const branch=process.env.RENDER_GIT_BRANCH||"";
  const url=process.env.RENDER_EXTERNAL_URL||"";
  const verified=Boolean(commit&&branch&&url);
  const medicalSafety=runMedicalSafetySelfCheck();
  return res.status(200).json({
    ok:true,
    service:"BHAI AI",
    agent:true,
    webAgent:true,
    githubAgent:Boolean(process.env.GITHUB_TOKEN),
    aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),
    provider:"gemini",
    medicalSafety,
    deployment:{verified,commit,branch,url,status:verified?"live":"unknown"},
    time:new Date().toISOString()
  });
}
