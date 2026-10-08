import { isMedicalIntent, getMedicalRiskSignals, sanitizeMedicalResponse } from "../src/medicalSafety.js";
import { isCasualIntent, getCasualReply } from "../src/intentRouter.js";
import { rendererSupports } from "../src/videoRenderer.js";
import { youtubeConfigured } from "./youtube.js";
import { buildBrainPlan } from "./brainOrchestrator.js";

function runBrainSelfCheck(){
  const autonomous=buildBrainPlan({task:"story bana kar final video YouTube ke liye ready karo",messages:[]});
  const followup=buildBrainPlan({task:"ab deploy kar do",messages:[
    {role:"user",text:"GitHub repo check karo"},
    {role:"assistant",text:"Repo inspect ho gaya."}
  ]});
  return {
    ok:autonomous.mode==="autonomous_production" &&
      autonomous.signals.proofRequired===true &&
      autonomous.tools.includes("render") &&
      followup.context.mode==="contextual_followup" &&
      followup.context.isolated===false,
    autonomousMode:autonomous.mode,
    autonomousTools:autonomous.tools,
    followupMode:followup.context.mode
  };
}

function runConversationRoutingSelfCheck(){
  const task="Bhai aise hi test kar rha tha kya reply deta hai tu 😅";
  const reply=getCasualReply(task);
  return {
    ok:isCasualIntent(task)===true && typeof reply==="string" && reply.length>20 && /test kar raha tha|kya reply deta/i.test(reply),
    task,
    reply:reply||""
  };
}

function runMedicalSafetySelfCheck(){
  const failures=[];
  const assert=(name,condition)=>{ if(!condition) failures.push(name); };

  const medical=isMedicalIntent("2 din se halka headache aur fatigue hai");
  const risk=getMedicalRiskSignals("BP 180/120");
  const unsafeNormal=[
    "Paracetamol 500 mg le lo.",
    "Ibuprofen 200-400 mg khane ke baad lo.",
    "Apni medicine ki dose double kar do.",
    "Nayi medicine ko ab rok dein.",
    "Coconut water aur electrolytes treatment ke liye lo.",
    "BP ko har 15-20 minutes mein check karo.",
    "Current situation is not an emergency."
  ].join("\n");
  const normalFixed=sanitizeMedicalResponse(unsafeNormal,"headache aur fatigue");

  const unsafeEmergency=[
    "Ye acute coronary syndrome ya pulmonary embolism ho sakta hai.",
    "112 par ambulance bulayein.",
    "Gehri 4-4-4 saans lein.",
    "Agar aspirin 300 mg available hai to ek tablet le sakte hain.",
    "Agar beta-blocker/nitrate nayi hai to ab rok dein.",
    "PCI ya intubation hospital mein ho sakta hai.",
    "Raat mein torch/flashlight lagayein."
  ].join("\n");
  const emergencyFixed=sanitizeMedicalResponse(unsafeEmergency,"chest pressure, difficulty breathing aur cold sweat");

  assert("medical_intent_common_symptoms",medical===true);
  assert("severe_bp_boundary",risk.veryHighBP===true);

  assert("normal_no_paracetamol_dose",!/Paracetamol 500\s*mg/i.test(normalFixed));
  assert("normal_no_ibuprofen_dose",!/Ibuprofen 200-400\s*mg/i.test(normalFixed));
  assert("normal_no_dose_change",!/dose double kar do|Nayi medicine ko ab rok dein/i.test(normalFixed));
  assert("normal_no_blanket_electrolytes",!/Coconut water.*treatment/i.test(normalFixed));
  assert("normal_no_rapid_bp_monitoring",!/har 15-20 minutes/i.test(normalFixed));
  assert("normal_no_definitive_emergency_exclusion",!/Current situation is not an emergency/i.test(normalFixed));

  assert("emergency_routes_to_112",/112/.test(emergencyFixed));
  assert("emergency_no_self_drive",/खुद drive न करें/.test(emergencyFixed));
  assert("emergency_no_specific_diagnosis",!/acute coronary syndrome|pulmonary embolism/i.test(emergencyFixed));
  assert("emergency_no_medication_dose",!/aspirin|300\s*mg|beta-blocker|nitrate/i.test(emergencyFixed));
  assert("emergency_no_procedure_or_irrelevant_tip",!/PCI|intubation|torch|flashlight|4-4-4/i.test(emergencyFixed));
  assert("emergency_no_medicine_stop_instruction",!/नयी दवा.*रोकें|अब रोक दें/i.test(emergencyFixed));

  return {ok:failures.length===0, failures, checkedAt:new Date().toISOString()};
}

export default async function handler(req,res){
  const commit=process.env.RENDER_GIT_COMMIT||"";
  const branch=process.env.RENDER_GIT_BRANCH||"";
  const url=process.env.RENDER_EXTERNAL_URL||"";
  const verified=Boolean(commit&&branch&&url);
  const medicalSafety=runMedicalSafetySelfCheck();
  const conversationRouting=runConversationRoutingSelfCheck();
  const brainRouting=runBrainSelfCheck();
  const videoRenderer=rendererSupports();
  const youtubePublisher={configured:youtubeConfigured(),oauthRequired:true};
  return res.status(200).json({
    ok:true,
    service:"BHAI AI",
    agent:true,
    webAgent:true,
    githubAgent:Boolean(process.env.GITHUB_TOKEN),
    aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),
    provider:"gemini",
    medicalSafety,
    conversationRouting,
    brainRouting,
    videoRenderer,youtubePublisher,
    deployment:{verified,commit,branch,url,status:verified?"live":"unknown"},
    time:new Date().toISOString()
  });
}
