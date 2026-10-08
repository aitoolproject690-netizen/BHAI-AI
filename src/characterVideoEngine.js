/**
 * BHAI X Character Video Engine
 *
 * Carries a permanent character identity into animation/video requests.
 * The visual identity is provider-neutral and can be rendered either from
 * the latest character image (preferred) or directly from a locked prompt.
 */

const clean=(value,max=1200)=>String(value??"").trim().slice(0,max);

const aspectFromText=(text)=>{
  const raw=String(text||"").toLowerCase();
  if(/\b9\s*:\s*16\b|\bvertical\b|\bportrait\s+video\b/.test(raw))return "9:16";
  if(/\b4\s*:\s*5\b/.test(raw))return "4:5";
  if(/\b1\s*:\s*1\b|\bsquare\b/.test(raw))return "1:1";
  return "16:9";
};

const styleInstruction=(style)=>{
  const raw=String(style||"").trim().toLowerCase();
  if(raw==="2d"||raw.includes("hand-drawn"))return "2D hand-drawn cartoon animation";
  if(raw==="anime"||raw.includes("manga"))return "anime cinematic animation";
  return "3D anime cinematic cartoon animation";
};

export function normalizeVideoRequest(input={}){
  const prompt=clean(input.prompt||input.request||"",2600);
  const raw=prompt.toLowerCase();
  const style=/\b(?:2d|2-d|hand.?drawn)\b/i.test(raw)?"2d":
    /\b(?:anime|manga)\b/i.test(raw)?"anime":
    /\b(?:3d|3-d|cinematic 3d)\b/i.test(raw)?"3d":"";
  const explicitAspect=/^(?:9:16|4:5|1:1|16:9)$/.test(String(input.aspectRatio||""))?String(input.aspectRatio):"";
  const duration=Math.min(5,Math.max(1,Number(input.duration)||5));
  return {
    prompt,
    style:String(input.style||style||""),
    duration,
    aspectRatio:explicitAspect||aspectFromText(prompt),
    motion:clean(input.motion||"",700),
    camera:clean(input.camera||"",500),
    expression:clean(input.expression||"",500),
    environment:clean(input.environment||"",700),
  };
}

export function buildCharacterVideoPrompt(character={},request={}){
  const identity=character?.identity_json||character?.identity||character||{};
  const r=normalizeVideoRequest(request);
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

  return [
    "BHAI X CHARACTER VIDEO GENERATION CONTRACT.",
    "Generate one short cinematic animation/video featuring the exact permanent character identity below.",
    "PERMANENT VIDEO IDENTITY LOCK: Treat the locked character identity as immutable. Never redesign, age, recolor, replace or reinterpret the character between frames.",
    locked,
    "VIDEO REQUEST:",
    "SCENE: "+r.prompt,
    "STYLE: "+styleInstruction(r.style),
    "DURATION_SECONDS: "+r.duration,
    "ASPECT_RATIO: "+r.aspectRatio,
    r.motion?"MOTION: "+r.motion:"",
    r.camera?"CAMERA: "+r.camera:"",
    r.expression?"EXPRESSION: "+r.expression:"",
    r.environment?"ENVIRONMENT: "+r.environment:"",
    "CONTINUITY RULES: Preserve the same face, hair, eyes, skin tone, body proportions and clothing in every frame. Maintain identity continuity through motion, camera movement, cuts and expressions. This identity must remain compatible with future lip-sync and voice stages.",
    "VIDEO IDENTITY DRIFT BLOCK / NEGATIVE: "+clean(identity.negativePrompt||"identity drift, different face, different hairstyle, inconsistent clothing, age change, body change, extra limbs, deformed hands",1200),
  ].filter(Boolean).join("\n");
}

export function verifyCharacterVideoContract(character={},prompt=""){
  const identity=character?.identity_json||character?.identity||character||{};
  const text=String(prompt||"");
  const required=[identity.name,identity.face,identity.hair,identity.clothing].filter(Boolean);
  const optional=[identity.eyes,identity.skin,identity.body].filter(Boolean);
  const values=[...required,...optional];
  const missing=values.filter(v=>!text.includes(String(v)));
  const ok=required.length===4&&missing.length===0&&/PERMANENT VIDEO IDENTITY LOCK/.test(text)&&/VIDEO IDENTITY DRIFT BLOCK/.test(text);
  return {
    ok,
    mode:"generation-contract",
    score:ok?1:0,
    frameIdentityVerification:false,
    issues:ok?[]:["Locked character fields were not fully embedded in the video prompt."],
  };
}

export function isLikelyCharacterVideoRequest(text=""){
  const raw=String(text||"");
  const videoCue=/\b(?:video|clip|animation|animated|animate|motion|reel)\b/i.test(raw)
    && /\b(?:bana|banao|banado|generate|create|make|render|produce|animate)\b/i.test(raw);
  const characterCue=/\b(?:character|hero|heroine|protagonist|villain|cartoon\s+character|patra|kirdar)\b/i.test(raw)
    || /\b(?:ki|ka|ke)\s+(?:video|clip|animation|animated|reel)\b/i.test(raw);
  return videoCue&&characterCue;
}
