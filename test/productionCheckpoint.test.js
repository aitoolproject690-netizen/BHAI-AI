import test from "node:test";
import assert from "node:assert/strict";
import {buildProductionCheckpoint,productionStepDone,nextProductionResumeStep,productionCheckpointSummary} from "../src/productionCheckpoint.js";

test("production checkpoint stores proof state without media payloads",()=>{
 const plan={pipelineId:"prod_test",schemaVersion:"1.0",steps:[
  {id:"story",required:true},{id:"characters",required:true},{id:"visuals",required:true},
  {id:"videos",required:true},{id:"post",required:true},{id:"render",required:true},{id:"youtube",required:false}
 ]};
 const cp=buildProductionCheckpoint({
  plan,request:{prompt:"test"},story:{title:"Test"},
  characters:[{character_id:"char-1",name:"Aarav",identity_fingerprint:"fp"}],
  sceneStates:[{sceneId:"scene_1",visualAssetId:"vis-1",videoAssetId:"vid-1",visualVerified:true,videoVerified:true,postVerified:true,verified:true,durationSeconds:5,postProduction:{vfx:{effects:[{type:"camera_zoom_in"}]}}}],
  evidence:{story:true,characters:true,visuals:true,videos:true,post:true,render:false,youtube:false},
  completedStepIds:["story","characters","visuals","videos","post"],
  currentStep:"render",
  renderProof:{ok:false},
  activity:[{tool:"character-video",state:"done",details:"video saved"}]
 });
 assert.equal(cp.pipelineId,"prod_test");
 assert.equal(productionStepDone(cp,"videos"),true);
 assert.equal(productionStepDone(cp,"render"),false);
 assert.equal(nextProductionResumeStep(cp),"render");
 assert.equal(cp.sceneStates[0].videoAssetId,"vid-1");
 assert.equal("data" in cp.sceneStates[0],false);
 const summary=productionCheckpointSummary(cp);
 assert.deepEqual(summary.completedStepIds,["story","characters","visuals","videos","post"]);
 assert.equal(summary.resumeFrom,"render");
});
