import test from "node:test";
import assert from "node:assert/strict";
import {buildAudioMasterContract,buildCameraDirection,buildCameraPlan,buildCharacterBible,buildImagePackPrompts,buildShortsPlan,buildYouTubePackage} from "../src/mediaProductionEngine.js";

test("media suite locks camera direction and character bible",()=>{
 const c=buildCharacterBible([{character_id:"char_aarav_abc",name:"Aarav",identity_fingerprint:"fp1",identity_json:{role:"protagonist",age:13,face:"round face",hair:"black hair",eyes:"brown",skin:"warm",body:"slim",clothing:"blue hoodie"}}]);
 assert.equal(c.locked,true);
 assert.equal(c.characters[0].characterId,"char_aarav_abc");
 const cam=buildCameraDirection({id:"scene-1",cameraPrompt:"low angle tracking shot at night"});
 assert.equal(cam.shot,"medium-wide");
 assert.equal(cam.movement,"dolly-track");
 assert.equal(cam.angle,"low");
 assert.equal(cam.lighting,"moody low-key");
});
test("media suite builds 3-image continuity pack and audio master",()=>{
 const pack=buildImagePackPrompts({prompt:"Aarav near an abandoned house",style:"anime",aspectRatio:"16:9"});
 assert.equal(pack.length,3);
 assert.ok(pack.every(x=>x.prompt.includes("same characters")));
 const audio=buildAudioMasterContract({voiceDb:1,musicDb:-10,sfxDb:-7,ducking:true});
 assert.equal(audio.voiceDb,1);
 assert.equal(audio.ducking,true);
});
test("YouTube package and Shorts plan are deterministic and bounded",()=>{
 const timeline={scenes:[
   {sceneId:"scene-1",title:"Hook",startSeconds:0,durationSeconds:8,scenePrompt:"A mysterious door"},
   {sceneId:"scene-2",title:"Reveal",startSeconds:8,durationSeconds:12,scenePrompt:"A shadow moves"}
 ]};
 const yt=buildYouTubePackage({title:"The Door",genre:"suspense",youtube:{hook:"The door opens...",titleIdeas:["The Door | BHAI X"],description:"Episode"}},timeline,{});
 assert.equal(yt.title,"The Door | BHAI X");
 assert.equal(yt.chapters.length,2);
 assert.equal(yt.categoryId,"22");
 const shorts=buildShortsPlan({title:"The Door",youtube:{hook:"Wait!"}},timeline);
 assert.equal(shorts.outputCount,2);
 assert.ok(shorts.shorts.every(x=>x.aspectRatio==="9:16"));
});
