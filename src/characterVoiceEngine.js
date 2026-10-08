/**
 * BHAI X Character Voice + Lip-sync Foundation
 *
 * Provider-neutral voice identity tied to the permanent Character ID.
 * The first implementation uses device-native speech playback in the UI;
 * the server also creates a deterministic timing/viseme manifest that later
 * audio providers and renderers can consume without changing character identity.
 */

import crypto from "node:crypto";

export const CHARACTER_VOICE_SCHEMA_VERSION="1.0";

const clean=(value,max=2400)=>String(value??"").trim().slice(0,max);
const clamp=(value,min,max,fb)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fb;};
const stableHash=value=>crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0,24);

function identityOf(character={}){
  return character?.identity_json||character?.identity||character||{};
}

function normalizeLanguage(value,text=""){
  const raw=String(value||"").trim().toLowerCase();
  if(/^en(?:-|_)?in$/.test(raw)||raw==="english"||raw==="en") return "en-IN";
  if(/^hi(?:-|_)?in$/.test(raw)||raw==="hindi"||raw==="hi") return "hi-IN";
  if(/[\u0900-\u097f]/u.test(String(text))) return "hi-IN";
  return "hi-IN";
}

export function normalizeVoiceRequest(input={}){
  const text=clean(input.text||input.script||input.dialogue||input.prompt||"",6000);
  const raw=String(input.prompt||input.text||"").toLowerCase();
  const emotion=clean(input.emotion||( /\b(?:sad|dukhi|emotional)\b/i.test(raw) ? "sad" :
    /\b(?:angry|gussa|gusse)\b/i.test(raw) ? "angry" :
    /\b(?:happy|khush|excited|utsahit)\b/i.test(raw) ? "happy" :
    /\b(?:scared|dar|dara hua|fearful)\b/i.test(raw) ? "fearful" : ""),120);
  return {
    text,
    language:normalizeLanguage(input.language,text),
    emotion,
    rate:clamp(input.rate,0.65,1.45,1),
    pitch:clamp(input.pitch,-1,1,0),
    volume:clamp(input.volume,0,1,1)
  };
}

export function makeCharacterVoiceProfile(character={}){
  const identity=identityOf(character);
  const voiceIdentity={
    characterId:clean(character?.character_id||character?.characterId,160),
    identityFingerprint:clean(character?.identity_fingerprint||character?.identityFingerprint,120),
    name:clean(identity.name,120),
    age:identity.age??null,
    gender:clean(identity.gender,50),
    species:clean(identity.species||"human",60),
    personality:clean(identity.personality,1200),
    voiceHints:clean(identity.voiceHints,1000)
  };
  const fingerprint=stableHash(voiceIdentity);
  return {
    schemaVersion:CHARACTER_VOICE_SCHEMA_VERSION,
    voiceId:"voice_"+(voiceIdentity.characterId||"character").replace(/[^a-z0-9_-]/gi,"-")+"_"+fingerprint.slice(0,12),
    voiceFingerprint:fingerprint,
    characterId:voiceIdentity.characterId,
    identityFingerprint:voiceIdentity.identityFingerprint,
    name:voiceIdentity.name||"Unnamed Character",
    language:"hi-IN",
    voiceStyle:voiceIdentity.voiceHints||"natural, clear, character-consistent delivery",
    personality:voiceIdentity.personality||"",
    age:voiceIdentity.age,
    gender:voiceIdentity.gender,
    species:voiceIdentity.species,
    providerMode:"device-native-preview",
    providerNeutral:true
  };
}

export function buildCharacterVoiceContract(character={},request={}){
  const identity=identityOf(character);
  const r=normalizeVoiceRequest(request);
  const profile=makeCharacterVoiceProfile(character);
  return [
    "BHAI X CHARACTER VOICE GENERATION CONTRACT.",
    "PERMANENT VOICE IDENTITY LOCK: Keep the same character voice identity for every scene, dialogue line and future lip-sync render.",
    "CHARACTER ID: "+profile.characterId,
    "VOICE ID: "+profile.voiceId,
    "VOICE FINGERPRINT: "+profile.voiceFingerprint,
    "NAME: "+clean(identity.name,120),
    "AGE: "+(identity.age??"unspecified"),
    "GENDER: "+clean(identity.gender,50),
    "SPECIES: "+clean(identity.species||"human",60),
    "PERSONALITY: "+clean(identity.personality,1200),
    "VOICE HINTS: "+clean(identity.voiceHints||"natural, age-appropriate, clear delivery",1200),
    "LANGUAGE: "+r.language,
    r.emotion?"EMOTION: "+r.emotion:"",
    "RATE: "+r.rate,
    "PITCH: "+r.pitch,
    "TEXT TO SPEAK: "+r.text,
    "VOICE CONTINUITY: Preserve age impression, tone, speaking energy, rhythm and emotional character across every generated line.",
    "VOICE IDENTITY DRIFT BLOCK: Never switch the character to another voice, age, gender presentation, speaking style or unrelated accent."
  ].filter(Boolean).join("\n");
}

export function verifyCharacterVoiceContract(character={},prompt=""){
  const identity=identityOf(character);
  const text=String(prompt||"");
  const profile=makeCharacterVoiceProfile(character);
  const required=[identity.name,profile.characterId,profile.voiceId,identity.voiceHints||"natural, age-appropriate, clear delivery"]
    .filter(Boolean);
  const missing=required.filter(value=>!text.includes(String(value)));
  const ok=missing.length===0
    && /PERMANENT VOICE IDENTITY LOCK/.test(text)
    && /VOICE IDENTITY DRIFT BLOCK/.test(text);
  return {
    ok,
    mode:"generation-contract",
    score:ok?1:0,
    voiceId:profile.voiceId,
    voiceFingerprint:profile.voiceFingerprint,
    issues:ok?[]:["Permanent voice identity was not embedded completely."]
  };
}

export function extractSpokenText(text=""){
  const raw=clean(text,6000);
  const quoted=raw.match(/[“"]([^”"]{1,5500})[”"]/);
  if(quoted?.[1]?.trim()) return quoted[1].trim();
  const marker=raw.match(/\b(?:bolo|bolna|kaho|keho|say|speak|bulwao|bulwa\s+do)\b\s*[:\-]?\s*(.+)$/i);
  if(marker?.[1]?.trim()) return marker[1].trim();
  const stripped=raw
    .replace(/^.*?\b(?:ki|ka|ke)\s+(?:voice|awaaz|aawaz)\s*(?:me|mein|main|se|par)\s*/i,"")
    .replace(/^.*?\b(?:voice|awaaz|aawaz)\s*(?:me|mein|main|se|par)\s*/i,"")
    .trim();
  return stripped||raw;
}

function classifyViseme(word=""){
  const w=String(word||"").toLowerCase().replace(/[^a-z0-9\u0900-\u097f]/gi,"");
  if(!w) return "sil";
  if(/[bmp]/.test(w)||/[बमपभफ]/u.test(w)) return "bilabial";
  if(/[fv]/.test(w)||/[वफ]/u.test(w)) return "labiodental";
  if(/[tdsz]/.test(w)||/[तदटडसज़जशष]/u.test(w)) return "dental";
  if(/[kgqx]/.test(w)||/[कगखघ]/u.test(w)) return "velar";
  if(/[rl]/.test(w)||/[रल]/u.test(w)) return "liquid";
  if(/[aeiou]/.test(w)||/[अआइईउऊएऐओऔ]/u.test(w)) return "open-vowel";
  return "neutral";
}

export function buildLipSyncManifest(text="",options={}){
  const request=normalizeVoiceRequest({text,...options});
  const words=String(request.text||"").trim().split(/\s+/).filter(Boolean);
  const wpm=165*request.rate;
  const totalMs=Math.max(700,Math.round(words.length?words.length/wpm*60000:700));
  const perWord=words.length?totalMs/words.length:totalMs;
  const segments=words.map((word,index)=>({
    index,
    word:word.replace(/[“”"]/g,""),
    startMs:Math.round(index*perWord),
    endMs:Math.round((index+1)*perWord),
    viseme:classifyViseme(word),
    emphasis:/[!?]/.test(word)?"high":"normal"
  }));
  return {
    schemaVersion:CHARACTER_VOICE_SCHEMA_VERSION,
    text:request.text,
    language:request.language,
    estimatedDurationMs:totalMs,
    method:"word-timing-estimate",
    pixelLipSyncVerified:false,
    segments
  };
}

export function isLikelyCharacterVoiceRequest(text=""){
  const raw=String(text||"");
  const voiceCue=/\b(?:voice|awaaz|aawaz|speak|bolo|bolna|kaho|say|audio|sound|voiceover|narrate|narration|bulwao|bulwa)\b/i.test(raw);
  const characterCue=/\b(?:character|hero|heroine|protagonist|villain|patra|kirdar)\b/i.test(raw)
    || /\b(?:ki|ka|ke|ko)\s+(?:voice|awaaz|aawaz)\b/i.test(raw);
  return voiceCue&&characterCue;
}
