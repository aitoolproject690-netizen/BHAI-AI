import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVoiceRequest,
  makeCharacterVoiceProfile,
  buildCharacterVoiceContract,
  verifyCharacterVoiceContract,
  extractSpokenText,
  buildLipSyncManifest,
  isLikelyCharacterVoiceRequest
} from "../src/characterVoiceEngine.js";

const character={
  character_id:"char_aarav_abcdef1234",
  identity_fingerprint:"abcdef1234567890",
  identity_json:{
    name:"Aarav",
    age:13,
    gender:"male",
    species:"human",
    personality:"brave and curious",
    voiceHints:"young Indian boy, energetic, clear and friendly"
  }
};

test("voice request normalizes language and controls",()=>{
  const out=normalizeVoiceRequest({text:"Namaste dosto",language:"hindi",emotion:"happy",rate:2,pitch:0.3});
  assert.equal(out.language,"hi-IN");
  assert.equal(out.emotion,"happy");
  assert.equal(out.rate,1.45);
  assert.equal(out.pitch,0.3);
});

test("same character identity keeps a stable voice id",()=>{
  const a=makeCharacterVoiceProfile(character);
  const b=makeCharacterVoiceProfile({...character,identity_json:{...character.identity_json}});
  assert.equal(a.voiceId,b.voiceId);
  assert.equal(a.voiceFingerprint,b.voiceFingerprint);
  assert.equal(a.characterId,character.character_id);
});

test("voice contract carries permanent identity",()=>{
  const request={text:"Namaste dosto",language:"hi-IN",emotion:"happy"};
  const prompt=buildCharacterVoiceContract(character,request);
  assert.match(prompt,/PERMANENT VOICE IDENTITY LOCK/);
  assert.match(prompt,/VOICE ID: voice_char_aarav_abcdef1234_/);
  assert.match(prompt,/NAME: Aarav/);
  assert.match(prompt,/VOICE HINTS: young Indian boy/);
  assert.match(prompt,/TEXT TO SPEAK: Namaste dosto/);
  const verdict=verifyCharacterVoiceContract(character,prompt);
  assert.equal(verdict.ok,true);
  assert.equal(verdict.score,1);
});

test("voice contract fails closed when voice hint is removed",()=>{
  const prompt=buildCharacterVoiceContract(character,{text:"Hello"});
  const broken=prompt.replace("VOICE HINTS: young Indian boy, energetic, clear and friendly","VOICE HINTS:");
  const verdict=verifyCharacterVoiceContract(character,broken);
  assert.equal(verdict.ok,false);
});

test("spoken text extractor handles quoted and marker dialogue",()=>{
  assert.equal(extractSpokenText('Aarav ki voice me bolo: "Namaste dosto!"'),"Namaste dosto!");
  assert.equal(extractSpokenText("Aarav ki awaaz mein kaho: Main aa gaya."),"Main aa gaya.");
});

test("lip-sync manifest creates deterministic word timing",()=>{
  const manifest=buildLipSyncManifest("Namaste dosto, kaise ho?",{language:"hi-IN"});
  assert.ok(manifest.estimatedDurationMs>0);
  assert.equal(manifest.pixelLipSyncVerified,false);
  assert.ok(manifest.segments.length>=3);
  assert.ok(manifest.segments.some(x=>x.viseme==="open-vowel"||x.viseme==="bilabial"));
  for(let i=1;i<manifest.segments.length;i++) assert.ok(manifest.segments[i].startMs>=manifest.segments[i-1].startMs);
});

test("natural character voice requests are recognized",()=>{
  assert.equal(isLikelyCharacterVoiceRequest("Aarav ki voice me bolo: Namaste dosto"),true);
  assert.equal(isLikelyCharacterVoiceRequest("Aarav ki awaaz mein kaho: Namaste"),true);
  assert.equal(isLikelyCharacterVoiceRequest("sirf voice recorder kholo"),false);
});
