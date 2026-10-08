/**
 * BHAI X Character Visual Engine
 *
 * Turns a permanent character identity into a repeatable visual-generation
 * contract. The engine is provider-neutral: image providers only receive the
 * final locked prompt; the account-scoped Character ID/fingerprint stays the
 * source of truth.
 */

const clean=(value,max=1200)=>String(value??"").trim().slice(0,max);

const normalizeName=(value)=>
  clean(value,120).toLowerCase()
    .replace(/[’']/g,"")
    .replace(/[^a-z0-9\u0900-\u097f]+/gi," ")
    .replace(/\s+/g," ")
    .trim();

const escapeRegExp=(value)=>String(value||"").replace(/[.*+?^\\$\{\}()|[\]\\]/g,"\\$&");

export const CHARACTER_VISUAL_STYLES=Object.freeze({
  "2d":"2D hand-drawn cartoon illustration",
  "3d":"3D anime cinematic cartoon render",
  anime:"anime cinematic illustration",
});

export function normalizeVisualRequest(input={}){
  const raw=clean(input.prompt||input.request||"",2400);
  const styleKey=clean(input.style||"",40).toLowerCase();
  const style=styleKey==="2d"||styleKey==="2d cartoon"?"2d":
    styleKey==="anime"||styleKey==="anime style"?"anime":
    styleKey==="3d"||styleKey==="3d cartoon"||styleKey==="3d anime"?"3d":"";
  const text=raw.toLowerCase();
  const explicitAspect=/^(?:9:16|4:5|1:1|16:9)$/.test(String(input.aspectRatio||""))?String(input.aspectRatio):"";
  const detectedStyle=/\b(?:2d|2-d|2 d|flat cartoon|hand drawn|hand-drawn)\b/i.test(text)?"2d":
    /\b(?:anime|manga)\b/i.test(text)?"anime":
    /\b(?:3d|3-d|three dimensional|cinematic 3d)\b/i.test(text)?"3d":"";
  const aspectRatio=explicitAspect||(/\b9\s*:\s*16\b/.test(text)?"9:16":
    /\b4\s*:\s*5\b/.test(text)?"4:5":
    /\b1\s*:\s*1\b|\bsquare\b/.test(text)?"1:1":"16:9");

  return {
    prompt:raw,
    style:style||detectedStyle||"",
    pose:clean(input.pose||"",500),
    expression:clean(input.expression||"",500),
    camera:clean(input.camera||"",500),
    environment:clean(input.environment||"",700),
    aspectRatio,
  };
}

export function characterNameMatchesPrompt(name,text){
  const needle=normalizeName(name);
  const haystack=normalizeName(text);
  if(!needle||!haystack)return false;
  const re=new RegExp("(^|\\s)"+escapeRegExp(needle)+"(?=\\s|$)","i");
  return re.test(haystack);
}

export function pickCharacterForPrompt(characters=[],text=""){
  const rows=Array.isArray(characters)?characters:[];
  const raw=String(text||"");
  const idMatch=raw.match(/\bchar_[a-z0-9-]+_[a-f0-9]{10}\b/i);
  if(idMatch){
    const exact=rows.find(row=>String(row?.character_id||row?.characterId||"").toLowerCase()===idMatch[0].toLowerCase());
    if(exact)return exact;
  }

  const matches=rows
    .filter(row=>characterNameMatchesPrompt(row?.name||row?.identity_json?.name||"",raw))
    .sort((a,b)=>normalizeName(b?.name||b?.identity_json?.name||"").length-normalizeName(a?.name||a?.identity_json?.name||"").length);

  return matches[0]||null;
}

export function buildCharacterVisualPrompt(character={},request={}){
  const identity=character?.identity_json||character?.identity||character||{};
  const normalized=normalizeVisualRequest(request);
  const preferredStyle=String(normalized.style||identity.visualStyle||"3D anime cinematic cartoon").trim();
  const styleInstruction=CHARACTER_VISUAL_STYLES[normalized.style]||preferredStyle;

  const locked=[
    "NAME: "+clean(identity.name,120),
    "ROLE: "+clean(identity.role,80),
    "AGE: "+(identity.age??"unspecified"),
    "GENDER: "+clean(identity.gender,50),
    "SPECIES: "+clean(identity.species||"human",60),
    "FACE: "+clean(identity.face,1800),
    "HAIR: "+clean(identity.hair,1200),
    "EYES: "+clean(identity.eyes,600),
    "SKIN: "+clean(identity.skin,600),
    "BODY: "+clean(identity.body,900),
    "CLOTHING: "+clean(identity.clothing,1800),
    "VISUAL STYLE BASELINE: "+clean(identity.visualStyle||"3D anime cinematic cartoon",180),
  ].join("\n");

  const requestLines=[
    "SCENE / USER VISUAL REQUEST: "+normalized.prompt,
    "REQUESTED STYLE: "+styleInstruction,
    normalized.pose?"POSE: "+normalized.pose:"",
    normalized.expression?"EXPRESSION: "+normalized.expression:"",
    normalized.camera?"CAMERA: "+normalized.camera:"",
    normalized.environment?"ENVIRONMENT: "+normalized.environment:"",
    "OUTPUT ASPECT RATIO: "+normalized.aspectRatio,
  ].filter(Boolean).join("\n");

  const negative=clean(identity.negativePrompt||"identity drift, different face, different hairstyle, inconsistent clothing, extra limbs, deformed hands",1000);

  return [
    "BHAI X CHARACTER VISUAL GENERATION CONTRACT.",
    "Generate exactly ONE original fictional character visual.",
    "PERMANENT IDENTITY LOCK: The locked identity below is the source of truth. Do not redesign, age, recolor, replace, or reinterpret the character.",
    locked,
    "CHARACTER VISUAL REQUEST:",
    requestLines,
    "CONTINUITY RULES: Preserve facial structure, hair shape/color, eye color, skin tone, body proportions and clothing exactly. Keep the same character identity across future poses, expressions, camera angles, images, animation, video and lip-sync.",
    "IDENTITY DRIFT BLOCK / NEGATIVE PROMPT: "+negative,
  ].join("\n");
}

export function verifyCharacterVisualContract(character={},prompt=""){
  const identity=character?.identity_json||character?.identity||character||{};
  const text=String(prompt||"");
  const required=[identity.name,identity.face,identity.hair,identity.clothing].filter(Boolean);
  const presentOptional=[identity.eyes,identity.skin,identity.body].filter(Boolean);
  const missing=[...required,...presentOptional].filter(value=>!text.includes(String(value)));
  const ok=required.length===4&&missing.length===0&&/PERMANENT IDENTITY LOCK/.test(text)&&/IDENTITY DRIFT BLOCK/.test(text);

  return {
    ok,
    mode:"generation-contract",
    score:ok?1:0,
    visualPixelVerification:false,
    issues:ok?[]:["Locked character fields were not fully embedded in the generated prompt."].filter(Boolean),
  };
}

export function isLikelyCharacterVisualRequest(text=""){
  const raw=String(text||"");
  const imageRequest=/\b(?:image|picture|photo|portrait|poster|illustration|artwork|tasveer|visual)\b/i.test(raw)
    && /\b(?:bana|banao|banado|generate|create|make|draw|design|render|visualize)\b/i.test(raw);
  const characterCue=/\b(?:character|hero|heroine|protagonist|villain|cartoon\s+character|patra|kirdar)\b/i.test(raw)
    || /\b(?:ki|ka|ke)\s+(?:image|picture|photo|portrait|tasveer|visual)\b/i.test(raw);
  return imageRequest&&characterCue;
}
