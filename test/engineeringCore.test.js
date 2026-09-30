import test from "node:test";
import assert from "node:assert/strict";
import { normalizeFilePath, resolveGithubTarget, classifyEngineeringError, createRetryGuard, createEvidence, createDeploymentCheckpoint, verifyDeploymentCheckpoint, createMissionController } from "../api/engineeringCore.js";

test("resolves explicit GitHub owner/repo/file target",()=>{
  const x=resolveGithubTarget("fix aitoolproject690-netizen/BHAI-TASK-APP-TEST/index.html");
  assert.equal(x.owner,"aitoolproject690-netizen");
  assert.equal(x.repo,"BHAI-TASK-APP-TEST");
  assert.equal(x.path,"index.html");
});

test("normalizes safe repository paths",()=>{
  assert.equal(normalizeFilePath("/src//app.js/"),"src/app.js");
  assert.throws(()=>normalizeFilePath("../secret.js"),/Unsafe repository path/);
});

test("classifies GitHub not-found errors without retry",()=>{
  const x=classifyEngineeringError({status:404,message:"Not Found"});
  assert.equal(x.type,"not_found");
  assert.equal(x.retryable,false);
});

test("retry guard blocks identical attempts",()=>{
  const g=createRetryGuard();
  assert.equal(g.canTry("github_read",{path:"index.html"}),true);
  assert.equal(g.canTry("github_read",{path:"index.html"}),false);
});

test("evidence requires repository, branch, path, commit and passing tests",()=>{
  const e=createEvidence();
  e.set({repository:"owner/repo",branch:"main",path:"index.html",commit:"abc"});
  e.addTest("read-back",true);
  assert.equal(e.verify(),true);
});
test("recovery state machine follows safe recovery order",async()=>{
  const { createRecoveryStateMachine } = await import("../api/engineeringCore.js");
  const m=createRecoveryStateMachine();
  assert.equal(m.state,"diagnose");
  m.transition("patch_and_verify");
  m.transition("rollback_if_regression");
  m.transition("retry");
  m.transition("switch_provider_or_model");
  m.transition("resume_checkpoint");
  m.transition("alternate_execution");
  m.transition("patch_and_verify");
  const evidence={verified:true};
  m.transition("done");
  assert.equal(m.canClaimDone(evidence),true);
});

test("Mission Mode follows preflight plan execute verify and recovery",()=>{
  const m=createMissionController();
  assert.equal(m.phase,"preflight");
  m.transition("plan");
  m.transition("execute");
  m.transition("verify");
  m.transition("recover");
  m.transition("execute");
  m.transition("verify");
  m.transition("complete");
  assert.deepEqual(m.history(),["preflight","plan","execute","verify","recover","execute","verify","complete"]);
  assert.equal(m.canClaimDone({verified:true}),true);
  assert.equal(m.canClaimDone({verified:false}),false);
});

test("deployment checkpoint verifies expected live commit",()=>{
  const cp=createDeploymentCheckpoint({commit:"abc123",service:"bhai-ai",url:"https://bhai-ai-vpna.onrender.com",status:"live"});
  assert.equal(verifyDeploymentCheckpoint(cp,{expectedCommit:"abc123"}).ok,true);
  assert.equal(verifyDeploymentCheckpoint(cp,{expectedCommit:"wrong"}).ok,false);
});

test("Mission recovery requires alternate execution before patch",async()=>{
  const { createRecoveryStateMachine } = await import("../api/engineeringCore.js");
  const m=createRecoveryStateMachine();
  m.transition("switch_provider_or_model");
  m.transition("resume_checkpoint");
  assert.throws(()=>m.transition("done"),/Invalid recovery transition/);
  m.transition("alternate_execution");
  m.transition("patch_and_verify");
});
