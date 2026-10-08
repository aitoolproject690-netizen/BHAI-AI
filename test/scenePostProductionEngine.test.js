import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeScenePostRequest,
  detectScenePostIntent,
  buildScenePostProductionManifest,
  renderProceduralAudio,
  verifyScenePostManifest
} from "../src/scenePostProductionEngine.js";

test("scene post request normalizes duration and mood",()=>{
  const r=normalizeScenePostRequest({prompt:"rainy suspense scene",duration:40});
  assert.equal(r.duration,30);
  assert.equal(r.mood,"suspense");
});

test("natural scene post requests are recognized",()=>{
  assert.deepEqual(detectScenePostIntent("rain effect aur suspense music lagao"),{
    type:"scene-post",music:true,sfx:false,vfx:true
  });
  assert.equal(detectScenePostIntent("sirf video dekho").type,null);
});

test("manifest contains VFX music SFX contracts",()=>{
  const m=buildScenePostProductionManifest({
    prompt:"Aarav walks in rain with fog, thunder and slow motion",
    duration:8,
    mood:"suspense",
    style:"3d cinematic"
  });
  assert.equal(verifyScenePostManifest(m).ok,true);
  assert.ok(m.vfx.effects.some(x=>x.type==="rain"));
  assert.ok(m.vfx.effects.some(x=>x.type==="fog"));
  assert.ok(m.vfx.effects.some(x=>x.type==="slow_motion"));
  assert.ok(m.sfx.tracks.some(x=>x.name==="rain_ambience"));
  assert.ok(m.sfx.tracks.some(x=>x.name==="thunder_hit"));
  assert.equal(m.music.providerMode,"procedural-free-preview");
  assert.equal(m.vfx.pixelVerified,false);
});

test("procedural music and sfx return valid WAV payloads",()=>{
  const music=renderProceduralAudio({kind:"music",duration:2,mood:"happy"});
  const sfx=renderProceduralAudio({kind:"sfx",duration:1,name:"heartbeat"});
  for(const a of [music,sfx]){
    assert.equal(a.mimeType,"audio/wav");
    const bytes=Buffer.from(a.data,"base64");
    assert.equal(bytes.subarray(0,4).toString(),"RIFF");
    assert.equal(bytes.subarray(8,12).toString(),"WAVE");
    assert.ok(bytes.length>1000);
  }
});
