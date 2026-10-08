/**
 * BHAI X Real Video Renderer
 *
 * Self-hosted final-video compositor powered by a pinned ffmpeg-static binary.
 * It consumes verified scene clips/images, optional voice audio and the existing
 * post-production manifest, then produces a real MP4 plus a thumbnail.
 *
 * This renderer does not claim face/pixel identity verification. It only proves
 * that the source media, timing contract and encoded MP4 are valid.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { renderProceduralAudio } from "./scenePostProductionEngine.js";

export const VIDEO_RENDERER_SCHEMA_VERSION="1.0";
const MAX_SCENES=12;
const MAX_SCENE_SECONDS=30;
const MAX_TOTAL_SECONDS=180;
const MAX_INPUT_BYTES=24*1024*1024;
const MAX_OUTPUT_BYTES=48*1024*1024;

const clean=(v,max=240)=>String(v??"").trim().slice(0,max);
const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fb;};

function assertFfmpeg(){
  if(!ffmpegPath) throw new Error("Self-hosted FFmpeg binary is unavailable on this platform.");
  return String(ffmpegPath);
}

function safeName(v,fb="asset"){
  const s=clean(v,80).replace(/[^a-z0-9._-]+/gi,"_");
  return s||fb;
}

async function run(command,args,{timeoutMs=180000,cwd}={}){
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    const timer=setTimeout(()=>{child.kill("SIGKILL");reject(new Error("FFmpeg timed out."));},timeoutMs);
    child.stdout.on("data",d=>{stdout+=d.toString();if(stdout.length>200000)stdout=stdout.slice(-200000);});
    child.stderr.on("data",d=>{stderr+=d.toString();if(stderr.length>300000)stderr=stderr.slice(-300000);});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",(code,signal)=>{
      clearTimeout(timer);
      if(code===0)return resolve({stdout,stderr});
      reject(new Error("FFmpeg failed (code="+code+", signal="+String(signal||"none")+"): "+stderr.slice(-1800)));
    });
  });
}

function mediaObject(value,defaultMime){
  if(!value)return null;
  if(typeof value==="string"){
    if(value.startsWith("data:")){
      const m=value.match(/^data:([^;]+);base64,(.+)$/s);
      return m?{mimeType:m[1],data:m[2]}:null;
    }
    return {mimeType:defaultMime,data:value};
  }
  if(typeof value==="object"&&value.data){
    return {mimeType:String(value.mimeType||value.mime_type||defaultMime),data:String(value.data)};
  }
  return null;
}

function extensionForMime(mime,kind){
  const raw=String(mime||"").toLowerCase();
  if(kind==="video"){
    if(raw.includes("webm"))return ".webm";
    if(raw.includes("mov")||raw.includes("quicktime"))return ".mov";
    return ".mp4";
  }
  if(raw.includes("wav"))return ".wav";
  if(raw.includes("ogg"))return ".ogg";
  if(raw.includes("webm"))return ".webm";
  return ".m4a";
}

async function writeBase64(dir,name,value,kind,defaultMime){
  const media=mediaObject(value,defaultMime);
  if(!media?.data) throw new Error("Missing "+kind+" media payload.");
  const buf=Buffer.from(media.data,"base64");
  if(!buf.length) throw new Error("Empty "+kind+" media payload.");
  if(buf.length>MAX_INPUT_BYTES) throw new Error(kind+" media exceeds the 24 MB renderer input limit.");
  const file=path.join(dir,safeName(name,"asset")+extensionForMime(media.mimeType,kind));
  await fs.writeFile(file,buf);
  return {file,mimeType:media.mimeType,size:buf.length};
}

function outputSize(aspect){
  if(aspect==="9:16")return {width:576,height:1024};
  if(aspect==="1:1")return {width:768,height:768};
  if(aspect==="4:5")return {width:640,height:800};
  return {width:1280,height:720};
}

function filterForPost(post,width,height){
  const list=["scale="+width+":"+height+":force_original_aspect_ratio=decrease","pad="+width+":"+height+":(ow-iw)/2:(oh-ih)/2","setsar=1"];
  const effects=Array.isArray(post?.vfx?.effects)?post.vfx.effects:[];
  for(const e of effects){
    const type=String(e?.type||"");
    if(type==="vignette")list.push("vignette=PI/5");
    else if(type==="slow_motion")list.push("setpts=1.12*PTS");
    else if(type==="camera_zoom_in")list.push("scale="+Math.round(width*1.08)+":"+Math.round(height*1.08),"crop="+width+":"+height);
    else if(type==="camera_shake")list.push("crop="+Math.round(width*0.94)+":"+Math.round(height*0.94)+":6*sin(13*t):6*cos(11*t)","scale="+width+":"+height);
    else if(type==="lightning_flash")list.push("eq=brightness=0.18:contrast=1.08:enable='lt(mod(t,3),0.10)'");
    else if(type==="glow")list.push("eq=contrast=1.06:saturation=1.08");
    else if(type==="rain"||type==="sparks"||type==="dust_smoke")list.push("noise=alls=7:allf=t+u");
    else if(type==="fog")list.push("eq=brightness=0.025:saturation=0.86");
  }
  return list.join(",");
}

async function renderScene(dir,scene,index,{width,height,fps,audioMaster}){
  const duration=clamp(scene.durationSeconds||scene.duration,0.1,MAX_SCENE_SECONDS,1);
  const post=scene.postProduction||null;
  const voice=mediaObject(scene.voiceAudio||scene.voice||null,"audio/wav");
  const sourceVideo=mediaObject(scene.sourceVideo||scene.video||null,"video/mp4");
  const sourceImage=mediaObject(scene.sourceImage||scene.image||null,"image/png");
  if(!sourceVideo&&!sourceImage) throw new Error("Scene "+(index+1)+" has no source video or source image.");
  const videoPath=sourceVideo
    ? await writeBase64(dir,"scene_"+(index+1)+"_video",sourceVideo,"video","video/mp4")
    : await writeBase64(dir,"scene_"+(index+1)+"_image",sourceImage,"image","image/png");

  let voicePath=null;
  if(voice) voicePath=await writeBase64(dir,"scene_"+(index+1)+"_voice",voice,"audio","audio/wav");

  // Provider-free post-production audio is real WAV data and can therefore be mixed
  // into the final MP4 without an external music/SFX provider.
  const generatedAudio=[];
  if(post?.music?.enabled){
    generatedAudio.push({name:"music",media:renderProceduralAudio({kind:"music",duration, mood:post.music.mood||post.mood||"cinematic"})});
  }
  const tracks=Array.isArray(post?.sfx?.tracks)?post.sfx.tracks:[];
  for(const track of tracks.slice(0,4)){
    generatedAudio.push({name:String(track.name||"sfx"),media:renderProceduralAudio({kind:"sfx",duration:Math.min(5,duration),name:String(track.name||"generic_sfx")})});
  }
  const audioPaths=[];
  for(const [j,a] of generatedAudio.entries()){
    const written=await writeBase64(dir,"scene_"+(index+1)+"_"+safeName(a.name,"audio")+"_"+j,{mimeType:a.media.mimeType,data:a.media.data},"audio","audio/wav");
    audioPaths.push(written.file);
  }

  const out=path.join(dir,"scene_"+(index+1)+"_render.mp4");
  const vf=filterForPost(post,width,height);
  const args=["-y","-hide_banner","-loglevel","error"];
  if(sourceImage){
    args.push("-loop","1","-i",videoPath.file);
  }else{
    args.push("-i",videoPath.file);
  }
  const inputAudioPaths=voicePath?[voicePath.file,...audioPaths]:audioPaths;
  if(!inputAudioPaths.length){
    args.push("-f","lavfi","-i","anullsrc=channel_layout=stereo:sample_rate=48000");
  }else{
    for(const p of inputAudioPaths)args.push("-i",p);
  }
  args.push("-t",String(duration),"-vf",vf,"-r",String(fps),"-map","0:v:0");

  const master=audioMaster||{};
  const voiceDb=Number.isFinite(Number(master.voiceDb))?Number(master.voiceDb):0;
  const musicDb=Number.isFinite(Number(master.musicDb))?Number(master.musicDb):-8;
  const sfxDb=Number.isFinite(Number(master.sfxDb))?Number(master.sfxDb):-6;
  const audioInputCount=inputAudioPaths.length||1;
  const filterParts=[];
  if(!inputAudioPaths.length){
    args.push("-map","1:a:0");
  }else if(voicePath&&audioInputCount===1){
    filterParts.push("[1:a]aresample=48000,volume="+voiceDb+"dB[a]");
    args.push("-filter_complex",filterParts.join(";"),"-map","[a]");
  }else if(voicePath){
    filterParts.push("[1:a]aresample=48000,volume="+voiceDb+"dB[voice]");
    const bg=[];
    for(let i=1;i<audioInputCount;i++){
      const inputIndex=1+i;
      const db=i===1?musicDb:sfxDb;
      const label="[bg"+i+"]";
      filterParts.push("["+inputIndex+":a]aresample=48000,volume="+db+"dB"+label);
      bg.push(label);
    }
    if(bg.length===1)filterParts.push(bg[0]+"anull[bg]");
    else filterParts.push(bg.join("")+"amix=inputs="+bg.length+":duration=longest:dropout_transition=2[bg]");
    if(master.ducking!==false)filterParts.push("[bg][voice]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300:makeup=0[ducked]","[voice][ducked]amix=inputs=2:duration=longest:dropout_transition=2,aresample=48000[a]");
    else filterParts.push("[voice][bg]amix=inputs=2:duration=longest:dropout_transition=2,aresample=48000[a]");
    args.push("-filter_complex",filterParts.join(";"),"-map","[a]");
  }else{
    const tracks=[];
    for(let i=0;i<audioInputCount;i++){
      const inputIndex=1+i;
      const db=i===0?musicDb:sfxDb;
      const label="[track"+i+"]";
      filterParts.push("["+inputIndex+":a]aresample=48000,volume="+db+"dB"+label);
      tracks.push(label);
    }
    filterParts.push(tracks.join("")+"amix=inputs="+tracks.length+":duration=longest:dropout_transition=2,aresample=48000[a]");
    args.push("-filter_complex",filterParts.join(";"),"-map","[a]");
  }
  args.push("-c:v","libx264","-preset","veryfast","-crf","21","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","128k","-movflags","+faststart",out);
  await run(assertFfmpeg(),args,{timeoutMs:Math.max(120000,Math.round(duration*45000)),cwd:dir});
  const stat=await fs.stat(out);
  if(!stat.size||stat.size>MAX_OUTPUT_BYTES)throw new Error("Rendered scene output is empty or exceeds the 48 MB limit.");
  return {file:out,duration};
}

async function createConcatList(dir,files){
  const list=path.join(dir,"concat.txt");
  const escaped=files.map(f=>"file '"+f.replace(/'/g,"'\\''")+"'").join("\n")+"\n";
  await fs.writeFile(list,escaped,"utf8");
  return list;
}

async function extractThumbnail(dir,video){
  const file=path.join(dir,"thumbnail.jpg");
  await run(assertFfmpeg(),["-y","-hide_banner","-loglevel","error","-ss","0.2","-i",video,"-frames:v","1","-q:v","3",file],{timeoutMs:60000,cwd:dir});
  const stat=await fs.stat(file);
  if(!stat.size)throw new Error("Thumbnail extraction produced an empty file.");
  return {mimeType:"image/jpeg",data:(await fs.readFile(file)).toString("base64")};
}

async function extractThumbnailVariants(dir,video,duration){
  const base=Math.max(0.1,Number(duration)||1);
  const times=[0.15,0.5,0.85].map(x=>Math.max(0.1,Math.min(Math.max(0.1,base-0.1),base*x)));
  const out=[];
  for(let i=0;i<times.length;i++){
    const file=path.join(dir,"thumbnail_"+(i+1)+".jpg");
    await run(assertFfmpeg(),["-y","-hide_banner","-loglevel","error","-ss",String(times[i]),"-i",video,"-frames:v","1","-q:v","3",file],{timeoutMs:60000,cwd:dir});
    const stat=await fs.stat(file);
    if(!stat.size)throw new Error("Thumbnail variant "+(i+1)+" is empty.");
    out.push({index:i+1,mimeType:"image/jpeg",data:(await fs.readFile(file)).toString("base64"),atSeconds:Number(times[i].toFixed(3))});
  }
  return out;
}

export async function renderShortsFromVideo(media={},shortsPlan={},options={}){
  const verification=verifyRenderedVideo(media);
  if(!verification.ok)throw new Error("Verified final MP4 is required before Shorts rendering.");
  const shorts=Array.isArray(shortsPlan?.shorts)?shortsPlan.shorts.slice(0,5):[];
  if(!shorts.length)throw new Error("No verified Shorts plan is available.");
  const data=Buffer.from(String(media.data),"base64");
  if(data.length>MAX_OUTPUT_BYTES)throw new Error("Source video exceeds the Shorts renderer safety limit.");
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"bhai-x-shorts-"));
  try{
    const source=path.join(dir,"source.mp4");
    await fs.writeFile(source,data);
    const sourceDuration=Math.max(1,Number(media.duration)||15);
    const result=[];
    for(let i=0;i<shorts.length;i++){
      const plan=shorts[i],duration=Math.min(15,Math.max(3,Number(plan.durationSeconds)||8));
      const start=Math.max(0,Math.min(Math.max(0,sourceDuration-duration),Number(plan.startSeconds)||0));
      const out=path.join(dir,"short_"+(i+1)+".mp4");
      const vf="scale=576:1024:force_original_aspect_ratio=increase,crop=576:1024";
      await run(assertFfmpeg(),["-y","-hide_banner","-loglevel","error","-ss",String(start),"-i",source,"-t",String(duration),"-vf",vf,"-r","30","-c:v","libx264","-preset","veryfast","-crf","23","-pix_fmt","yuv420p","-c:a","aac","-b:a","96k","-movflags","+faststart",out],{timeoutMs:Math.max(90000,Math.round(duration*30000)),cwd:dir});
      const stat=await fs.stat(out);
      if(!stat.size||stat.size>12*1024*1024)throw new Error("Short "+(i+1)+" is empty or exceeds the 12 MB limit.");
      const shortMedia={mimeType:"video/mp4",data:(await fs.readFile(out)).toString("base64"),duration:Number(duration.toFixed(3)),provider:"bhai-self-hosted-ffmpeg-short"};
      const proof=verifyRenderedVideo(shortMedia);
      if(!proof.ok)throw new Error("Short "+(i+1)+" failed MP4 verification.");
      result.push({id:plan.id||"short_"+(i+1),title:clean(plan.title||"BHAI X Short",90),hook:clean(plan.hook,500),startSeconds:Number(start.toFixed(3)),durationSeconds:shortMedia.duration,aspectRatio:"9:16",media:shortMedia,verification:proof});
    }
    return {schemaVersion:VIDEO_RENDERER_SCHEMA_VERSION,renderer:"ffmpeg-static",verified:true,shorts:result};
  }finally{
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}

async function inspectVideo(file){
  const {stderr}=await run(assertFfmpeg(),["-hide_banner","-i",file,"-f","null","-"],{timeoutMs:60000});
  const match=stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  const duration=match
    ? Number(match[1])*3600+Number(match[2])*60+Number(match[3])
    : null;
  return {ok:true,durationSeconds:duration};
}

function buildYoutubeMetadata(timeline,overrides={}){
  const firstPrompt=clean(timeline?.scenes?.[0]?.scenePrompt||timeline?.scenes?.[0]?.prompt||"BHAI X cinematic episode",120);
  const title=clean(overrides.title||"BHAI X | "+firstPrompt,90);
  const description=clean(overrides.description||"Created with BHAI X self-hosted scene renderer.\n\nScenes: "+String(timeline?.scenes?.length||0)+"\nDuration: "+String(timeline?.totalDurationSeconds||0)+" seconds.",4500);
  return {
    title,
    description,
    tags:Array.isArray(overrides.tags)?overrides.tags.slice(0,30).map(x=>clean(x,60)).filter(Boolean):["BHAI X","cartoon","cinematic","Hindi"],
    filename:(safeName(title,"bhai-x-video")+".mp4").slice(0,120),
    visibility:"private-ready",
    packageVersion:"1.0"
  };
}

export function rendererSupports(){
  try{
    assertFfmpeg();
    return {ok:true,engine:"ffmpeg-static",binary:String(ffmpegPath),schemaVersion:VIDEO_RENDERER_SCHEMA_VERSION};
  }catch(e){
    return {ok:false,engine:"ffmpeg-static",error:String(e?.message||e),schemaVersion:VIDEO_RENDERER_SCHEMA_VERSION};
  }
}

export function verifyRenderedVideo(media={}){
  const data=String(media?.data||"");
  const bytes=data?Buffer.from(data,"base64"):Buffer.alloc(0);
  const ftyp=bytes.subarray(4,8).toString("ascii")==="ftyp";
  return {
    ok:Boolean(data&&bytes.length>32&&ftyp&&/^video\/mp4$/i.test(String(media?.mimeType||""))),
    mode:"encoded-mp4-contract",
    bytes:bytes.length,
    pixelIdentityVerified:false
  };
}

export async function renderTimeline(timeline={},options={}){
  const renderer=rendererSupports();
  if(!renderer.ok)throw new Error(renderer.error);
  const scenes=Array.isArray(timeline.scenes)?timeline.scenes:[];
  if(!scenes.length)throw new Error("Cannot render an empty timeline.");
  if(scenes.length>MAX_SCENES)throw new Error("Timeline exceeds the "+MAX_SCENES+" scene renderer limit.");
  const total=scenes.reduce((sum,s)=>sum+Number(s.durationSeconds||0),0);
  if(total<=0||total>MAX_TOTAL_SECONDS)throw new Error("Timeline duration must be between 0 and "+MAX_TOTAL_SECONDS+" seconds.");
  const aspect=String(timeline?.output?.aspectRatio||options.aspectRatio||"16:9");
  const fps=clamp(timeline?.output?.fps||options.fps,12,60,30);
  const {width,height}=outputSize(aspect);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),"bhai-x-render-"));
  try{
    const rendered=[];
    for(let i=0;i<scenes.length;i++)rendered.push(await renderScene(dir,scenes[i],i,{width,height,fps,audioMaster:timeline.audioMix}));
    const list=await createConcatList(dir,rendered.map(x=>x.file));
    const joined=path.join(dir,"final.mp4");
    await run(assertFfmpeg(),["-y","-hide_banner","-loglevel","error","-f","concat","-safe","0","-i",list,"-c","copy","-movflags","+faststart",joined],{timeoutMs:Math.max(120000,Math.round(total*40000)),cwd:dir});
    const stat=await fs.stat(joined);
    if(!stat.size||stat.size>MAX_OUTPUT_BYTES)throw new Error("Final MP4 is empty or exceeds the 48 MB limit.");
    const inspection=await inspectVideo(joined);
    const data=(await fs.readFile(joined)).toString("base64");
    const media={mimeType:"video/mp4",data,duration:Number((inspection.durationSeconds??total).toFixed(3)),provider:"bhai-self-hosted-ffmpeg"};
    const verification=verifyRenderedVideo(media);
    if(!verification.ok)throw new Error("Final MP4 failed encoded-output verification.");
    const thumbnail=await extractThumbnail(dir,joined);
    const thumbnails=await extractThumbnailVariants(dir,joined,media.duration);
    const youtube=buildYoutubeMetadata({...timeline,totalDurationSeconds:media.duration},{title:options.title,description:options.description,tags:options.tags});
    return {
      schemaVersion:VIDEO_RENDERER_SCHEMA_VERSION,
      renderer:renderer.engine,
      media,
      thumbnail,
      thumbnails,
      youtube,
      verification,
      stats:{sceneCount:scenes.length,requestedDurationSeconds:Number(total.toFixed(3)),encodedDurationSeconds:media.duration,bytes:Buffer.byteLength(data,"base64")},
      applied:{
        sourceMedia:"verified scene video/image inputs",
        vfx:"manifest-driven supported FFmpeg effects",
        music:"provider-free procedural",
        sfx:"provider-free procedural",
        voice:"scene voice audio when supplied; device-native preview is not server-rendered TTS",
        lipSync:"timing manifests are preserved but pixel/phoneme lip-sync is not claimed",
        audioMaster:timeline.audioMix||null
      }
    };
  }finally{
    await fs.rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
