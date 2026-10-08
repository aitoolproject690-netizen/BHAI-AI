/**
 * BHAI X Permanent Character Identity
 * Canonical identity contract for image/video/voice/lip-sync stages.
 */
import crypto from "node:crypto";

export const CHARACTER_SCHEMA_VERSION="1.0";
const clean=(v,n=4000)=>String(v??"").trim().slice(0,n);
const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,Math.round(n))):fb;};
const slug=v=>clean(v,100).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"character";
const stableHash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0,24);

export function normalizeCharacter(input={}){
  const name=clean(input.name||"Unnamed Character",120);
  return {name,role:clean(input.role||"supporting",50),age:clamp(input.age,0,120,null),gender:clean(input.gender||"",40),
    species:clean(input.species||"human",60),description:clean(input.description,1200),appearance:clean(input.appearance,2400),
    face:clean(input.face,1800),hair:clean(input.hair,1200),eyes:clean(input.eyes,600),skin:clean(input.skin,600),
    body:clean(input.body,900),clothing:clean(input.clothing,1800),personality:clean(input.personality,1200),
    voiceHints:clean(input.voiceHints,1000),visualStyle:clean(input.visualStyle||"3D anime cinematic cartoon",180),
    negativePrompt:clean(input.negativePrompt||"identity drift, different face, different hairstyle, extra limbs, deformed hands, inconsistent clothing",1000)};
}

export function makeCharacterIdentity(input={}){
  const identity=normalizeCharacter(input);
  const fingerprint=stableHash(identity);
  return {schemaVersion:CHARACTER_SCHEMA_VERSION,characterId:"char_"+slug(identity.name)+"_"+fingerprint.slice(0,10),
    identityVersion:1,identity,identityFingerprint:fingerprint,canonicalPrompt:buildCharacterPrompt(identity),
    lockedFields:["name","role","age","gender","species","face","hair","eyes","skin","body","clothing","visualStyle"],
    createdAt:new Date().toISOString()};
}

export function buildCharacterPrompt(input={}){
  const c=normalizeCharacter(input);
  return ["BHAI X CANONICAL CHARACTER IDENTITY. Preserve this exact identity in every future image, video, animation and lip-sync generation.",
    "Name: "+c.name,"Role: "+c.role,"Age: "+(c.age??"unspecified"),"Gender: "+(c.gender||"unspecified"),"Species: "+c.species,
    "Description: "+c.description,"Appearance: "+c.appearance,"Face: "+c.face,"Hair: "+c.hair,"Eyes: "+c.eyes,"Skin: "+c.skin,
    "Body: "+c.body,"Clothing: "+c.clothing,"Personality: "+c.personality,"Visual style: "+c.visualStyle,
    "VOICE HINTS (for later voice stage): "+c.voiceHints,"NEGATIVE / IDENTITY DRIFT BLOCK: "+c.negativePrompt].filter(Boolean).join("\n");
}

export function buildCharacterGenerationPrompt(input={}){
  const c=normalizeCharacter(input);
  const shape={name:c.name,role:c.role,age:c.age,gender:c.gender,species:c.species,description:"string",appearance:"string",
    face:"specific stable facial features",hair:"specific stable hairstyle/color",eyes:"specific stable eyes",skin:"specific stable skin tone",
    body:"specific stable body/build",clothing:"specific stable clothing",personality:"string",voiceHints:"age/tone/rhythm",
    visualStyle:c.visualStyle,negativePrompt:c.negativePrompt};
  return ["Create one original fictional cartoon character identity for BHAI X.","Return ONLY valid JSON. Do not invent a second character.",
    "The identity must be concrete enough for repeated image/video generation.","USER CHARACTER IDEA:",JSON.stringify(c),
    "REQUIRED JSON:",JSON.stringify(shape,null,2),"Keep facial structure, hair, eyes, skin, body and clothing explicit and stable."].join("\n");
}

export function parseCharacterDraft(text,request={}){
  let raw=String(text||"").trim().replace(/^\uFEFF/,""),parsed=null;
  try{parsed=JSON.parse(raw)}catch{}
  if(!parsed){const m=raw.match(/\{[\s\S]*\}/);if(m)try{parsed=JSON.parse(m[0])}catch{}}
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return {ok:false,errors:["invalid_json"],character:null};
  const character=makeCharacterIdentity({...request,...parsed,name:parsed.name||request.name}),errors=[];
  if(!character.identity.name||character.identity.name==="Unnamed Character")errors.push("missing_name");
  if(!character.identity.appearance&&!character.identity.description)errors.push("missing_appearance");
  if(!character.identity.face)errors.push("missing_face");
  if(!character.identity.hair)errors.push("missing_hair");
  if(!character.identity.clothing)errors.push("missing_clothing");
  return {ok:errors.length===0,errors,character};
}
