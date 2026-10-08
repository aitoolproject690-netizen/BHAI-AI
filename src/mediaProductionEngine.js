/**
 * BHAI X Media Production Suite
 * Pure contracts for camera direction, character bible, audio mastering,
 * YouTube packaging, Shorts planning and multi-image continuity.
 */

export const MEDIA_PRODUCTION_SCHEMA_VERSION="1.0";

const clean=(v,max=3000)=>String(v??"").trim().slice(0,max);
const uniq=(xs)=>[...new Set((Array.isArray(xs)?xs:[]).map(x=>clean(x,120)).filter(Boolean))];

export function buildCharacterBible(characters=[]){
  const rows=(Array.isArray(characters)?characters:[]).slice(0,32).map((c,i)=>{
    const id=clean(c?.character_id||c?.characterId||c?.id||("character-"+(i+1)),120);
    const identity=c?.identity_json||c?.identity||c||{};
    return {
      characterId:id,
      name:clean(c?.name||identity?.name||("Character "+(i+1)),120),
      identityFingerprint:clean(c?.identity_fingerprint||c?.identityFingerprint,120),
      role:clean(identity?.role,80),
      age:identity?.age??null,
      face:clean(identity?.face,1000),
      hair:clean(identity?.hair,700),
      eyes:clean(identity?.eyes,400),
      skin:clean(identity?.skin,400),
      body:clean(identity?.body,500),
      clothing:clean(identity?.clothing,900),
      personality:clean(identity?.personality,700),
      visualStyle:clean(identity?.visualStyle||"3D anime cinematic cartoon",180)
    };
  });
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    bibleId:"charbible_"+simpleHash(rows),
    locked:true,
    characters:rows,
    contract:"Character IDs, fingerprints, face, hair, eyes, skin, body, clothing and visual style are immutable continuity anchors."
  };
}

export function buildCameraDirection(scene={},options={}){
  const prompt=clean(scene?.cameraPrompt||scene?.camera||"",1000);
  const raw=(prompt+" "+clean(scene?.visualPrompt,1400)+" "+clean(scene?.action,1200)).toLowerCase();
  const style=clean(options.style||"3D anime cinematic cartoon",180);
  const shot=/\b(?:extreme close|macro)\b/.test(raw)?"extreme-close-up":
    /\b(?:close.?up|close up|face)\b/.test(raw)?"close-up":
    /\b(?:medium|waist|mid shot)\b/.test(raw)?"medium":
    /\b(?:wide|establishing|full shot)\b/.test(raw)?"wide":"medium-wide";
  const movement=/\b(?:tracking|track|follow|dolly)\b/.test(raw)?"dolly-track":
    /\b(?:pan|panning)\b/.test(raw)?"pan":
    /\b(?:tilt|tilting)\b/.test(raw)?"tilt":
    /\b(?:zoom|push in|push-in|pull out)\b/.test(raw)?"controlled-zoom":
    /\b(?:handheld|shake|shaky)\b/.test(raw)?"handheld-subtle":"locked-cinematic";
  const angle=/\b(?:low angle|low-angle|from below)\b/.test(raw)?"low":
    /\b(?:high angle|high-angle|from above)\b/.test(raw)?"high":
    /\b(?:overhead|top down|top-down)\b/.test(raw)?"overhead":"eye-level";
  const lighting=/\b(?:night|dark|horror|scary|haunted|suspense)\b/.test(raw)?"moody low-key":
    /\b(?:sunset|golden hour|warm)\b/.test(raw)?"warm cinematic":
    /\b(?:day|morning|bright)\b/.test(raw)?"soft daylight":"cinematic key + rim";
  const transition=/\b(?:fade|dissolve)\b/.test(raw)?"dissolve":"cut";
  const focal=shot==="extreme-close-up"?"facial micro-expression":shot==="close-up"?"face and emotion":shot==="wide"?"character + environment":"character action";
  const lens=shot==="wide"?"24mm":shot==="extreme-close-up"?"85mm":"50mm";
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    sceneId:clean(scene?.id||scene?.sceneId||"",120),
    style,shot,movement,angle,lighting,transition,lens,focal,
    direction:[`SHOT: ${shot}`,`LENS: ${lens}`,`ANGLE: ${angle}`,`CAMERA MOVE: ${movement}`,`LIGHTING: ${lighting}`,`FOCUS: ${focal}`,`TRANSITION: ${transition}`,`VISUAL STYLE: ${style}`].join("\n"),
    sourcePrompt:prompt,
    verified:true
  };
}

export function buildCameraPlan(scenes=[],options={}){
  const list=(Array.isArray(scenes)?scenes:[]).slice(0,48);
  const shots=list.map((scene,index)=>buildCameraDirection(scene,{...options,style:options.style||scene?.visualStyle}));
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    planId:"camplan_"+simpleHash(shots),
    scenes:shots,
    verified:shots.length===list.length,
    contract:"Every renderable scene receives a deterministic camera shot, lens, angle, movement, lighting and transition direction."
  };
}

export function buildAudioMasterContract(options={}){
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    masterId:"audiomaster_"+simpleHash(options),
    voiceDb:Number.isFinite(Number(options.voiceDb))?Number(options.voiceDb):0,
    musicDb:Number.isFinite(Number(options.musicDb))?Number(options.musicDb):-8,
    sfxDb:Number.isFinite(Number(options.sfxDb))?Number(options.sfxDb):-6,
    ducking:Boolean(options.ducking!==false),
    sampleRate:48000,
    channels:2,
    codec:"aac",
    targetLoudness:"platform-safe integrated loudness target; renderer applies bounded track gains",
    verified:true
  };
}

export function buildImagePackPrompts(input={}){
  const prompt=clean(input.prompt||"",5000);
  const styleKey=clean(input.style||"3d",40).toLowerCase();
  const style=styleKey==="anime"?"anime cinematic illustration":styleKey==="2d"?"2D hand-drawn cartoon illustration":"3D anime cinematic cartoon render";
  const aspect=/^(?:9:16|4:5|1:1|16:9)$/.test(String(input.aspectRatio||""))?String(input.aspectRatio):"16:9";
  const angles=[
    "hero establishing shot, environment clearly visible",
    "medium emotional character shot, strong facial expression",
    "dynamic cinematic action shot, stronger perspective and depth"
  ];
  return angles.map((shot,index)=>({
    index:index+1,
    style,aspectRatio:aspect,
    prompt:["BHAI X 3-IMAGE CONTINUITY PACK.","IMAGE VARIANT "+(index+1),"Keep the same characters, clothing, colors and environment across all three images.","STYLE: "+style,"ASPECT: "+aspect,"SHOT: "+shot,"USER REQUEST: "+prompt,"NEGATIVE: identity drift, different face, different hairstyle, inconsistent clothing, extra limbs, deformed hands"].join("\n")
  }));
}

export function buildYouTubePackage(story={},timeline={},overrides={}){
  const titleIdeas=uniq(story?.youtube?.titleIdeas);
  const title=clean(overrides.title||titleIdeas[0]||(`BHAI X | ${story?.title||"Cinematic Cartoon Episode"}`),100);
  const description=clean(overrides.description||story?.youtube?.description||(`Created with BHAI X.\\n\\n${story?.logline||"Cinematic cartoon episode."}`),5000);
  const tags=uniq([...(overrides.tags||[]),"BHAI X","Hindi cartoon","3D animation","anime cartoon","cinematic story",story?.genre||"suspense"]).slice(0,30);
  const chapters=(Array.isArray(timeline?.scenes)?timeline.scenes:[]).slice(0,48).map((s,i)=>({
    time:formatChapterTime(s?.startSeconds||0),
    title:clean(s?.title||(`Scene ${i+1}`),90)
  }));
  const hashtags=uniq(tags.slice(0,8).map(t=>"#"+t.toLowerCase().replace(/[^a-z0-9]+/g,"").slice(0,30))).filter(x=>x!=="#");
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    packageVersion:"1.0",
    title,description,tags,hashtags,
    categoryId:"22",
    filename:safeFilename(title)+".mp4",
    hook:clean(story?.youtube?.hook,600),
    thumbnailPrompt:clean(story?.youtube?.thumbnailPrompt||(`High-impact YouTube thumbnail for ${title}, expressive characters, cinematic lighting, clear focal subject, family-safe`),1600),
    chapters,
    visibility:"private-ready",
    verified:Boolean(title&&description&&tags.length&&chapters.every(x=>x.time!==null))
  };
}

export function buildShortsPlan(story={},timeline={}){
  const scenes=Array.isArray(timeline?.scenes)?timeline.scenes:[];
  if(!scenes.length)return {schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,shorts:[],verified:false};
  const picks=scenes.slice(0,Math.min(5,scenes.length));
  const shorts=picks.map((scene,index)=>({
    id:"short_"+(index+1),
    sourceSceneIds:[clean(scene.sceneId||(`scene_${index+1}`),120)],
    startSeconds:Number(scene.startSeconds||0),
    durationSeconds:Math.min(15,Math.max(5,Number(scene.durationSeconds)||8)),
    aspectRatio:"9:16",
    title:clean((story?.youtube?.titleIdeas?.[index]||story?.title||"BHAI X Short")+" #"+(index+1),90),
    hook:clean(story?.youtube?.hook||scene.scenePrompt||scene.title||"Wait for this scene…",500),
    caption:clean(scene.scenePrompt||scene.title||"Full episode on BHAI X",500),
    verified:true
  }));
  return {
    schemaVersion:MEDIA_PRODUCTION_SCHEMA_VERSION,
    planId:"shorts_"+simpleHash(shorts),
    outputCount:shorts.length,
    shorts,
    verified:shorts.every(x=>x.verified&&x.aspectRatio==="9:16"&&x.durationSeconds>0)
  };
}

function simpleHash(value){
  let h=2166136261;
  const s=JSON.stringify(value);
  for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,"0");
}
function formatChapterTime(seconds){
  const n=Math.max(0,Math.floor(Number(seconds)||0));
  const h=Math.floor(n/3600),m=Math.floor((n%3600)/60),s=n%60;
  return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function safeFilename(value){
 return clean(value,90).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"bhai-x-video";
}
