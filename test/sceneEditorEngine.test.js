import test from "node:test";
import assert from "node:assert/strict";
import {normalizeSceneClip,buildEditTimeline,verifyEditTimeline,isLikelyEditRequest} from "../src/sceneEditorEngine.js";

test("timeline joins scenes in deterministic order",()=>{
  const t=buildEditTimeline({scenes:[
    {sceneId:"scene_1",videoAssetId:"vid_1",duration:4,verified:true},
    {sceneId:"scene_2",videoAssetId:"vid_2",duration:6,verified:true}
  ],aspectRatio:"9:16"});
  assert.equal(t.totalDurationSeconds,10);
  assert.equal(t.scenes[0].startSeconds,0);
  assert.equal(t.scenes[1].startSeconds,4);
  assert.equal(t.output.aspectRatio,"9:16");
  assert.equal(verifyEditTimeline(t).ok,true);
});

test("unverified or missing scene video is blocked",()=>{
  const t=buildEditTimeline({scenes:[{sceneId:"scene_1",duration:4,verified:false}]});
  const v=verifyEditTimeline(t);
  assert.equal(v.ok,false);
  assert.ok(v.errors.includes("scene-0-video"));
});

test("lip-sync duration drift beyond tolerance is blocked",()=>{
  const s=normalizeSceneClip({sceneId:"scene_1",videoAssetId:"v1",duration:5,verified:true,lipSyncManifest:{durationMs:8000}});
  const t=buildEditTimeline({scenes:[s]});
  assert.equal(verifyEditTimeline(t).ok,false);
});

test("natural editor requests are recognized",()=>{
  assert.equal(isLikelyEditRequest("in sab scenes ko jodkar final video banao"),true);
  assert.equal(isLikelyEditRequest("Aarav ka character banao"),false);
});
