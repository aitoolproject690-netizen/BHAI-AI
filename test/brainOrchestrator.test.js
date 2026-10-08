import test from "node:test";
import assert from "node:assert/strict";
import { buildBrainPlan, brainSummary } from "../api/brainOrchestrator.js";

test("brain routes an autonomous Hindi production request to the full tool chain",()=>{
  const p=buildBrainPlan({
    task:"Aarav ki suspense story bana kar final video YouTube ke liye ready karo",
    messages:[]
  });
  assert.equal(p.mode,"autonomous_production");
  assert.equal(p.signals.autonomous,true);
  assert.equal(p.signals.autoExecute,true);
  assert.equal(p.signals.proofRequired,true);
  assert.deepEqual(p.tools,["story","characters","visuals","videos","post-production","render","youtube"]);
});

test("brain carries a contextual follow-up without reviving an unrelated old task",()=>{
  const p=buildBrainPlan({
    task:"ab deploy kar do",
    messages:[
      {role:"user",text:"Bhai GitHub par mera demo repo check karo"},
      {role:"assistant",text:"Repo inspect ho gaya."}
    ]
  });
  assert.equal(p.context.mode,"contextual_followup");
  assert.equal(p.context.isolated,false);
  assert.equal(p.signals.autoExecute,true);
  assert.equal(p.signals.github,false);
});

test("brain isolates a genuinely fresh task",()=>{
  const p=buildBrainPlan({
    task:"ek naya app banana hai",
    messages:[
      {role:"user",text:"Purane project ka build verify ho gaya."},
      {role:"assistant",text:"Haan, sab green tha."}
    ]
  });
  assert.equal(p.context.mode,"fresh_task");
  assert.equal(p.context.isolated,true);
});

test("brain summary is deterministic",()=>{
  const p=buildBrainPlan({task:"current weather kya hai?",messages:[]});
  assert.match(brainSummary(p),/BRAIN v2\.0/);
  assert.match(brainSummary(p),/web-search/);
});


test("brain marks ordinary chat/general work as mobile-preferred",()=>{
  const chat=buildBrainPlan({task:"Bhai mujhe simple Python samjha de",messages:[]});
  assert.equal(chat.signals.mobilePreferred,true);
  assert.match(brainSummary(chat),/mobilePreferred=true/);
});

test("brain detects explicit private/local intent",()=>{
  const local=buildBrainPlan({task:"Ye private local model par hi karna",messages:[]});
  assert.equal(local.signals.mobilePreferred,true);
});
