/**
 * BHAI X Scene Post-Production Engine
 *
 * Provider-free foundation for VFX, music and SFX.
 * - VFX is represented as a deterministic, editor-ready manifest.
 * - Music/SFX can be rendered as small procedural WAV assets with no external API.
 * - The same scene manifest can later be consumed by a real editor/renderer.
 */

import crypto from "node:crypto";

export const SCENE_POST_SCHEMA_VERSION="1.0";

const clean=(v,max=2400)=>String(v??"").trim().slice(0,max);
const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fb;};

export function normalizeScenePostRequest(input={}){
  const prompt=clean(input.prompt||input.scene||input.request||"",5000);
  const raw=prompt.toLowerCase();
  const duration=clamp(input.duration,1,30,8);
  const mood=clean(
    input.mood ||
    (/(?:horror|scary|dar|haunted|suspense|thriller)/i.test(raw)?"suspense":
      /(?:sad|dukhi|emotional|cry|rona)/i.test(raw)?"sad":
      /(?:happy|joy|funny|comedy|khushi)/i.test(raw)?"happy":"cinematic"),
    80
  );
  const style=clean(input.style||"cinematic",100);
  return {prompt,duration,mood,style};
}

const VFX_RULES=[
  {cue:/\b(?:rain|rainy|baarish|barish)\b/i,effect:{type:"rain",intensity:0.75}},
  {cue:/\b(?:fog|mist|dhund|kohra)\b/i,effect:{type:"fog",intensity:0.55}},
  {cue:/\b(?:lightning|thunder|bijli|garaj)\b/i,effect:{type:"lightning_flash",intensity:0.8}},
  {cue:/\b(?:glow|roshni|luminous|neon)\b/i,effect:{type:"glow",intensity:0.65}},
  {cue:/\b(?:spark|sparks|chingaari|chingaariyan)\b/i,effect:{type:"sparks",intensity:0.6}},
  {cue:/\b(?:dust|dhool|smoke|dhuan)\b/i,effect:{type:"dust_smoke",intensity:0.45}},
  {cue:/\b(?:shake|shaky|camera shake|hilta camera)\b/i,effect:{type:"camera_shake",intensity:0.5}},
  {cue:/\b(?:slow motion|slow-mo|slowmo|dheere)\b/i,effect:{type:"slow_motion",intensity:0.65}},
  {cue:/\b(?:vignette|dark edges|cinematic dark)\b/i,effect:{type:"vignette",intensity:0.35}},
  {cue:/\b(?:zoom in|close up|close-up)\b/i,effect:{type:"camera_zoom_in",intensity:0.45}},
];

const SFX_RULES=[
  {cue:/\b(?:rain|rainy|baarish|barish)\b/i,name:"rain_ambience"},
  {cue:/\b(?:thunder|garaj|bijli)\b/i,name:"thunder_hit"},
  {cue:/\b(?:footstep|footsteps|steps|kadamo|kadmon)\b/i,name:"footsteps"},
  {cue:/\b(?:door|darwaza|knock|dastak)\b/i,name:"door_hit"},
  {cue:/\b(?:whoosh|swish|fast movement|tez movement)\b/i,name:"whoosh"},
  {cue:/\b(?:heartbeat|dhadkan)\b/i,name:"heartbeat"},
  {cue:/\b(?:crow|birds|chirping|panchhi|parinde)\b/i,name:"birds"},
  {cue:/\b(?:wind|hawa|toofan|storm)\b/i,name:"wind"},
];

export function detectScenePostIntent(text=""){
  const raw=String(text||"");
  const wantsMusic=/\b(?:music|bgm|background music|sangeet|dhun|song|theme)\b/i.test(raw);
  const wantsSfx=/\b(?:sfx|sound effect|sound effects|awaaz|effect sound|foley)\b/i.test(raw);
  const wantsVfx=/\b(?:vfx|visual effects|effect|effects|rain effect|fog effect|glow|lightning|spark|smoke|slow motion|camera shake)\b/i.test(raw);
  const createCue=/\b(?:bana|banao|banado|generate|create|make|add|lagao|laga|prepare|render|produce|design)\b/i.test(raw);
  if(!(wantsMusic||wantsSfx||wantsVfx)||!createCue) return {type:null,music:false,sfx:false,vfx:false};
  return {type:"scene-post",music:wantsMusic,sfx:wantsSfx,vfx:wantsVfx};
}

export function buildScenePostProductionManifest(input={}){
  const r=normalizeScenePostRequest(input);
  const effects=VFX_RULES.filter(x=>x.cue.test(r.prompt)).map(x=>({...x.effect,enabled:true}));
  const sfx=SFX_RULES.filter(x=>x.cue.test(r.prompt)).map((x,i)=>({
    id:"sfx_"+(i+1),
    name:x.name,
    startMs:0,
    durationMs:Math.round(Math.min(5000,r.duration*1000)),
    volume:0.55
  }));
  const music={
    enabled:true,
    mood:r.mood,
    durationMs:Math.round(r.duration*1000),
    volume:0.32,
    providerMode:"procedural-free-preview"
  };
  const signature=crypto.createHash("sha256").update(JSON.stringify({prompt:r.prompt,duration:r.duration,mood:r.mood,style:r.style,effects,sfx,music})).digest("hex").slice(0,24);
  return {
    schemaVersion:SCENE_POST_SCHEMA_VERSION,
    manifestId:"post_"+signature,
    scenePrompt:r.prompt,
    durationSeconds:r.duration,
    style:r.style,
    mood:r.mood,
    vfx:{enabled:effects.length>0,effects,verificationMode:"manifest-contract",pixelVerified:false},
    music,
    sfx:{enabled:sfx.length>0,tracks:sfx},
    editorContract:"Apply VFX and mix music/SFX only after the source video is stable; keep timing anchored to scene duration."
  };
}

function writeWav(samples,sampleRate=22050){
  const data=Buffer.alloc(samples.length*2);
  for(let i=0;i<samples.length;i++){
    const s=Math.max(-1,Math.min(1,samples[i]));
    data.writeInt16LE(Math.round(s*32767),i*2);
  }
  const header=Buffer.alloc(44);
  header.write("RIFF",0);
  header.writeUInt32LE(36+data.length,4);
  header.write("WAVE",8);
  header.write("fmt ",12);
  header.writeUInt32LE(16,16);
  header.writeUInt16LE(1,20);
  header.writeUInt16LE(1,22);
  header.writeUInt32LE(sampleRate,24);
  header.writeUInt32LE(sampleRate*2,28);
  header.writeUInt16LE(2,32);
  header.writeUInt16LE(16,34);
  header.write("data",36);
  header.writeUInt32LE(data.length,40);
  return Buffer.concat([header,data]);
}

const noteFreq=n=>440*Math.pow(2,(n-69)/12);

function seededNoise(i,seed){
  const x=Math.sin((i+1)*(seed+0.12345)*12.9898)*43758.5453;
  return (x-Math.floor(x))*2-1;
}

export function renderProceduralAudio(input={}){
  const kind=input.kind==="sfx"?"sfx":"music";
  const duration=Math.min(12,Math.max(1,Number(input.duration)||8));
  const sampleRate=22050;
  const count=Math.floor(duration*sampleRate);
  const mood=String(input.mood||"cinematic").toLowerCase();
  const samples=new Float32Array(count);

  if(kind==="music"){
    const chordMap={
      suspense:[45,48,52,55],
      sad:[45,48,52,53],
      happy:[60,64,67,72],
      cinematic:[50,53,57,60]
    };
    const notes=chordMap[mood]||chordMap.cinematic;
    for(let i=0;i<count;i++){
      const t=i/sampleRate;
      const fadeIn=Math.min(1,t/0.4);
      const fadeOut=Math.min(1,(duration-t)/0.7);
      const env=Math.max(0,Math.min(fadeIn,fadeOut))*0.28;
      const beat=Math.floor(t*2)%notes.length;
      const n=noteFreq(notes[beat]);
      samples[i]=(
        Math.sin(2*Math.PI*n*t)*0.48+
        Math.sin(2*Math.PI*(n*1.5)*t)*0.18+
        Math.sin(2*Math.PI*(n*2)*t)*0.10
      )*env;
    }
  }else{
    const name=String(input.name||"generic").toLowerCase();
    for(let i=0;i<count;i++){
      const t=i/sampleRate;
      let v=0;
      if(name.includes("rain")||name.includes("wind")){
        v=seededNoise(i,7)*0.18;
        v+=Math.sin(2*Math.PI*(110+8*Math.sin(t*0.8))*t)*0.05;
      }else if(name.includes("heartbeat")){
        const phase=(t%0.85);
        const hit=phase<0.09?Math.sin(2*Math.PI*80*phase)*Math.exp(-phase*28):0;
        v=hit*0.45;
      }else if(name.includes("thunder")){
        const hit=Math.exp(-t*2.6);
        v=seededNoise(i,13)*hit*0.5+Math.sin(2*Math.PI*42*t)*hit*0.25;
      }else if(name.includes("foot")||name.includes("door")||name.includes("whoosh")){
        const hit=Math.exp(-Math.max(0,t-0.03)*7);
        v=seededNoise(i,19)*hit*0.4;
      }else{
        v=seededNoise(i,23)*Math.exp(-t*4)*0.22;
      }
      samples[i]=v;
    }
  }

  const wav=writeWav(samples,sampleRate);
  return {
    mimeType:"audio/wav",
    data:wav.toString("base64"),
    duration,
    kind,
    provider:"procedural-free"
  };
}

export function verifyScenePostManifest(manifest={}){
  const ok=Boolean(
    manifest?.schemaVersion===SCENE_POST_SCHEMA_VERSION &&
    manifest?.manifestId &&
    manifest?.vfx &&
    manifest?.music &&
    manifest?.sfx &&
    Number(manifest.durationSeconds)>0 &&
    manifest?.vfx?.verificationMode==="manifest-contract" &&
    manifest?.vfx?.pixelVerified===false
  );
  return {ok,mode:"manifest-contract",score:ok?1:0,pixelVerified:false};
}
