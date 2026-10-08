import test from "node:test";
import assert from "node:assert/strict";
import {JOB_STATES,canTransition,retryDelayMs,verifyJobResult} from "../api/jobRunner.js";

test("job state machine only permits forward/recovery transitions",()=>{
 assert.equal(canTransition(JOB_STATES.queued,JOB_STATES.running),true);
 assert.equal(canTransition(JOB_STATES.running,JOB_STATES.verifying),true);
 assert.equal(canTransition(JOB_STATES.verifying,JOB_STATES.completed),true);
 assert.equal(canTransition(JOB_STATES.completed,JOB_STATES.queued),false);
 assert.equal(canTransition(JOB_STATES.failed,JOB_STATES.running),false);
});

test("retry backoff is bounded and increases by attempt",()=>{
 assert.equal(retryDelayMs(1),1500);
 assert.equal(retryDelayMs(2),3000);
 assert.equal(retryDelayMs(20),30000);
});

test("completion proof blocks unverified executor output",()=>{
 assert.equal(verifyJobResult("agent",{ok:true,verified:true}).ok,true);
 assert.equal(verifyJobResult("agent",{ok:true,verified:false}).ok,false);
 assert.equal(verifyJobResult("health",{ok:true,status:200}).ok,true);
 assert.equal(verifyJobResult("health",{ok:false,status:503}).ok,false);
 assert.equal(verifyJobResult("build",{ok:true,conclusion:"success",artifactVerified:true}).ok,true);
 assert.equal(verifyJobResult("build",{ok:true,conclusion:"success",artifactVerified:false}).ok,false);
 assert.equal(verifyJobResult("deploy",{ok:true,status:"complete",healthVerified:true}).ok,true);
});


test("terminal states cannot transition back into execution",()=>{
 assert.equal(canTransition("completed","running"),false);
 assert.equal(canTransition("cancelled","running"),false);
 assert.equal(canTransition("failed","verifying"),false);
});


test("history record is terminal, owner-scoped, and event-bounded",async()=>{
 const {buildHistoryRecord}=await import("../api/jobRunner.js");
 const job={id:"job-123",owner:"owner-1",type:"mission",goal:"ship app",status:"failed",attempts:3,maxAttempts:3,createdAt:"2026-01-01T00:00:00Z",finishedAt:"2026-01-01T00:01:00Z",verificationSummary:"proof failed",error:"boom",result:{ok:false},payload:{secret:"must-not-enter-history",resumedFrom:"job-old"},events:Array.from({length:80},(_,i)=>({state:"running",message:String(i)}))};
 const h=buildHistoryRecord(job);
 assert.equal(h.id,"job-123");
 assert.equal(h.owner,"owner-1");
 assert.equal(h.status,"failed");
 assert.equal(h.resumedFrom,"job-old");
 assert.equal(h.events.length,60);
 assert.equal("secret" in h,false);
});


test("checkpoint survives recovery history snapshot",async()=>{
 const {buildHistoryRecord}=await import("../api/jobRunner.js");
 const job={id:"job-cp",owner:"owner-cp",type:"mission",goal:"long mission",status:"failed",attempts:2,maxAttempts:3,createdAt:"2026-01-01T00:00:00Z",finishedAt:"2026-01-01T00:02:00Z",progress:42,checkpoint:{phase:"build",tool:"github-actions",progress:42,message:"Build dispatched; waiting for verification.",proofRequired:true},payload:{recovery:{checkpoint:{phase:"build"}}},events:[]};
 const h=buildHistoryRecord(job);
 assert.equal(h.checkpoint.phase,"build"); assert.equal(h.checkpoint.tool,"github-actions"); assert.equal(h.checkpoint.progress,42); assert.equal(h.recovery.checkpoint.phase,"build");
});
