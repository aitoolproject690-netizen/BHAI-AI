import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVisualRequest,
  buildCharacterVisualPrompt,
  verifyCharacterVisualContract,
  characterNameMatchesPrompt,
  pickCharacterForPrompt,
  isLikelyCharacterVisualRequest
} from "../src/characterVisualEngine.js";

const character={
  character_id:"char_aarav_abcdef1234",
  identity_version:1,
  identity_fingerprint:"abcdef1234567890",
  identity_json:{
    name:"Aarav",
    role:"protagonist",
    age:13,
    gender:"male",
    species:"human",
    face:"round youthful face, small nose, expressive eyebrows",
    hair:"short black side-swept hair",
    eyes:"dark brown",
    skin:"medium brown",
    body:"slim",
    clothing:"blue hoodie, dark jeans, white sneakers",
    visualStyle:"3D anime cinematic cartoon",
    negativePrompt:"identity drift, different face, different hairstyle, inconsistent clothing"
  }
};

test("visual request detects style, aspect ratio and scene controls",()=>{
  const request=normalizeVisualRequest({prompt:"Aarav standing in rain, anime style, 9:16",pose:"standing",expression:"brave",camera:"low angle"});
  assert.equal(request.style,"anime");
  assert.equal(request.aspectRatio,"9:16");
  assert.equal(request.pose,"standing");
  assert.equal(request.expression,"brave");
  assert.equal(request.camera,"low angle");
});

test("character visual prompt embeds all locked identity fields",()=>{
  const prompt=buildCharacterVisualPrompt(character,{prompt:"Aarav in a rainy street",style:"3d",pose:"standing",expression:"curious",camera:"medium shot"});
  assert.match(prompt,/PERMANENT IDENTITY LOCK/);
  assert.match(prompt,/NAME: Aarav/);
  assert.match(prompt,/FACE: round youthful face/);
  assert.match(prompt,/HAIR: short black side-swept hair/);
  assert.match(prompt,/EYES: dark brown/);
  assert.match(prompt,/SKIN: medium brown/);
  assert.match(prompt,/BODY: slim/);
  assert.match(prompt,/CLOTHING: blue hoodie/);
  assert.match(prompt,/REQUESTED STYLE: 3D anime cinematic cartoon render/);
  assert.match(prompt,/POSE: standing/);
  assert.match(prompt,/EXPRESSION: curious/);
  assert.match(prompt,/CAMERA: medium shot/);
  assert.match(prompt,/IDENTITY DRIFT BLOCK/);
});

test("visual contract fails closed when a locked field is missing",()=>{
  const prompt=buildCharacterVisualPrompt(character,{prompt:"Aarav image"});
  const broken=prompt.replace("HAIR: short black side-swept hair","HAIR:");
  const verdict=verifyCharacterVisualContract(character,broken);
  assert.equal(verdict.ok,false);
  assert.equal(verdict.visualPixelVerification,false);
});

test("visual contract passes when the full locked prompt is present",()=>{
  const prompt=buildCharacterVisualPrompt(character,{prompt:"Aarav image"});
  const verdict=verifyCharacterVisualContract(character,prompt);
  assert.equal(verdict.ok,true);
  assert.equal(verdict.mode,"generation-contract");
  assert.equal(verdict.score,1);
});

test("character lookup prefers an explicit Character ID and then exact name match",()=>{
  const second={...character,character_id:"char_meera_1234567890",name:"Meera",identity_json:{...character.identity_json,name:"Meera"}};
  assert.equal(characterNameMatchesPrompt("Aarav","Aarav ki image banao"),true);
  assert.equal(characterNameMatchesPrompt("Aarav","aaravish ki image banao"),false);
  assert.equal(pickCharacterForPrompt([character,second],"char_meera_1234567890 ka portrait"),second);
  assert.equal(pickCharacterForPrompt([character,second],"Aarav ki image banao"),character);
});

test("character visual helper catches natural Hindi image requests",()=>{
  assert.equal(isLikelyCharacterVisualRequest("Aarav ki image banao"),true);
  assert.equal(isLikelyCharacterVisualRequest("Aarav ka portrait generate karo"),true);
  assert.equal(isLikelyCharacterVisualRequest("sirf ek sunset image banao"),false);
});
