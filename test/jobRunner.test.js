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
