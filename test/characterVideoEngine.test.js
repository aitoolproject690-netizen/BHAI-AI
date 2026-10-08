import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVideoRequest,
  buildCharacterVideoPrompt,
  verifyCharacterVideoContract,
  isLikelyCharacterVideoRequest
} from "../src/characterVideoEngine.js";

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
    negativePrompt:"identity drift, different face, different hairstyle, inconsistent clothing, age change"
  }
};

test("video request normalizes style, duration, aspect and motion controls",()=>{
  const request=normalizeVideoRequest({
    prompt:"Aarav running in the rain, anime style, 9:16",
    duration:9,
    aspectRatio:"9:16",
    motion:"runs forward",
    camera:"tracking shot",
    expression:"determined"
  });
  assert.equal(request.style,"anime");
  assert.equal(request.duration,5);
  assert.equal(request.aspectRatio,"9:16");
  assert.equal(request.motion,"runs forward");
  assert.equal(request.camera,"tracking shot");
  assert.equal(request.expression,"determined");
});

test("character video prompt carries immutable identity into animation",()=>{
  const prompt=buildCharacterVideoPrompt(character,{
    prompt:"Aarav walks through a rainy street",
    style:"3d",
    duration:5,
    aspectRatio:"16:9",
    motion:"slow walk",
    camera:"medium tracking shot",
    expression:"curious"
  });
  assert.match(prompt,/PERMANENT VIDEO IDENTITY LOCK/);
  assert.match(prompt,/NAME: Aarav/);
  assert.match(prompt,/FACE: round youthful face/);
  assert.match(prompt,/HAIR: short black side-swept hair/);
  assert.match(prompt,/EYES: dark brown/);
  assert.match(prompt,/SKIN: medium brown/);
  assert.match(prompt,/BODY: slim/);
  assert.match(prompt,/CLOTHING: blue hoodie/);
  assert.match(prompt,/MOTION: slow walk/);
  assert.match(prompt,/CAMERA: medium tracking shot/);
  assert.match(prompt,/EXPRESSION: curious/);
  assert.match(prompt,/VIDEO IDENTITY DRIFT BLOCK/);
});

test("character video contract fails closed when identity is incomplete",()=>{
  const prompt=buildCharacterVideoPrompt(character,{prompt:"Aarav video"});
  const broken=prompt.replace("CLOTHING: blue hoodie, dark jeans, white sneakers","CLOTHING:");
  const verdict=verifyCharacterVideoContract(character,broken);
  assert.equal(verdict.ok,false);
  assert.equal(verdict.frameIdentityVerification,false);
});

test("character video contract passes with complete identity lock",()=>{
  const prompt=buildCharacterVideoPrompt(character,{prompt:"Aarav video"});
  const verdict=verifyCharacterVideoContract(character,prompt);
  assert.equal(verdict.ok,true);
  assert.equal(verdict.mode,"generation-contract");
  assert.equal(verdict.score,1);
});

test("natural character video requests are recognized",()=>{
  assert.equal(isLikelyCharacterVideoRequest("Aarav ka video banao"),true);
  assert.equal(isLikelyCharacterVideoRequest("Aarav ko animate karo"),true);
  assert.equal(isLikelyCharacterVideoRequest("sirf ek sunset video banao"),false);
});
