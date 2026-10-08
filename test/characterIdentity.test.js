import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCharacter,makeCharacterIdentity,buildCharacterPrompt,parseCharacterDraft,CHARACTER_SCHEMA_VERSION} from "../src/characterIdentity.js";

const base={name:"Aarav",role:"protagonist",age:13,gender:"male",species:"human",appearance:"Indian boy with a slim build",face:"round youthful face, small nose, expressive eyebrows",hair:"short black side-swept hair",eyes:"dark brown",skin:"medium brown",body:"slim",clothing:"blue hoodie, dark jeans, white sneakers",personality:"brave and curious",voiceHints:"young Indian boy, energetic",visualStyle:"3D anime cinematic cartoon"};

test("same canonical identity produces the same permanent ID and fingerprint",()=>{
 const a=makeCharacterIdentity(base),b=makeCharacterIdentity({...base});
 assert.equal(a.characterId,b.characterId); assert.equal(a.identityFingerprint,b.identityFingerprint);
 assert.equal(a.schemaVersion,CHARACTER_SCHEMA_VERSION);
});

test("identity prompt locks visual continuity",()=>{
 const p=buildCharacterPrompt(base);
 assert.match(p,/CANONICAL CHARACTER IDENTITY/); assert.match(p,/Face:/); assert.match(p,/Hair:/); assert.match(p,/Clothing:/); assert.match(p,/IDENTITY DRIFT BLOCK/);
});

test("draft validation blocks incomplete identity",()=>{
 const out=parseCharacterDraft(JSON.stringify({name:"Aarav"}),{name:"Aarav"});
 assert.equal(out.ok,false); assert.ok(out.errors.includes("missing_face")); assert.ok(out.errors.includes("missing_hair")); assert.ok(out.errors.includes("missing_clothing"));
});

test("draft validation accepts complete identity",()=>{
 const out=parseCharacterDraft(JSON.stringify(base),base);
 assert.equal(out.ok,true); assert.ok(out.character.characterId.startsWith("char_"));
});

test("normalization has bounded fields",()=>{
 const c=normalizeCharacter({name:" A ".repeat(1000),appearance:"x".repeat(9999)});
 assert.ok(c.name.length<=120); assert.ok(c.appearance.length<=2400);
});
