/**
 * BHAI X Scene Editor / Final Joiner
 * Provider-neutral timeline foundation. It validates composition before any
 * renderer is allowed to claim a final video.
 */
import crypto from "node:crypto";

export const EDITOR_SCHEMA_VERSION="1.0";

const clamp=(v,min,max,fb)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fb;};
const clean=(v,max=500)=>String(v??"").trim().slice(0,max);

export function normalizeSceneClip(input={},index=0){
  const duration=clamp(input.duration||input.durationSeconds,0.1,300,1);
  return {
    sceneId:clean(input.sceneId||`scene_${index+1}`,120),
    videoAssetId:clean(input.videoAssetId||input.assetId||"",180),
    durationSeconds:duration,
    sourceVideo:input.sourceVideo||null,
    voiceAssetId:clean(input.voiceAssetId||"",180)||null,
    voiceAudio:input.voiceAudio||null,
    lipSyncManifest:input.lipSyncManifest||null,
    postProduction:input.postProduction||null,
    transition:clean(input.transition||"cut",80),
    verified:input.verified!==false
  };
}

export function buildEditTimeline(input={}){
  const raw=Array.isArray(input.scenes)?input.scenes:[];
  const scenes=raw.map(normalizeSceneClip);
  let cursor=0;
  const timeline=scenes.map((s,i)=>{
    const start=Number(cursor.toFixed(3));
    const end=Number((cursor+s.durationSeconds).toFixed(3));
    cursor=end;
    return {...s,index:i,startSeconds:start,endSeconds:end};
  });
  const total=Number(cursor.toFixed(3));
  const id=crypto.createHash("sha256").update(JSON.stringify(timeline)).digest("hex").slice(0,24);
  return {
    schemaVersion:EDITOR_SCHEMA_VERSION,
    timelineId:"edit_"+id,
    scenes:timeline,
    totalDurationSeconds:total,
    output:{format:"mp4",aspectRatio:clean(input.aspectRatio||"16:9",20),fps:clamp(input.fps,12,60,30)},
    audioMix:{voiceDb:0,musicDb:-8,sfxDb:-6,ducking:true},
    transitions:timeline.map((s)=>({sceneId:s.sceneId,type:s.transition,durationSeconds:s.transition==="cut"?0:0.4})),
    rendererContract:"Render only after every scene has a verified source video. Preserve voice/lip-sync timing and post-production manifest timing."
  };
}

export function verifyEditTimeline(timeline={}){
  const scenes=Array.isArray(timeline.scenes)?timeline.scenes:[];
  const errors=[];
  if(timeline.schemaVersion!==EDITOR_SCHEMA_VERSION) errors.push("schema");
  if(!timeline.timelineId) errors.push("timelineId");
  if(!scenes.length) errors.push("no-scenes");
  scenes.forEach((s,i)=>{
    if(!s.sceneId) errors.push(`scene-${i}-id`);
    if(!(Number(s.durationSeconds)>0)) errors.push(`scene-${i}-duration`);
    if(!s.videoAssetId && !s.sourceVideo) errors.push(`scene-${i}-video`);
    if(s.verified===false) errors.push(`scene-${i}-unverified`);
    if(s.lipSyncManifest?.durationMs && Math.abs(Number(s.lipSyncManifest.durationMs)/1000-s.durationSeconds)>0.75)
      errors.push(`scene-${i}-lipsync-duration`);
  });
  const ordered=scenes.every((s,i)=>i===0||s.startSeconds>=scenes[i-1].endSeconds);
  if(!ordered) errors.push("timeline-order");
  const expected=scenes.reduce((n,s)=>n+Number(s.durationSeconds||0),0);
  if(Math.abs(expected-Number(timeline.totalDurationSeconds||0))>0.01) errors.push("duration-total");
  return {ok:errors.length===0,errors,verified:errors.length===0,renderReady:errors.length===0};
}

export function isLikelyEditRequest(text=""){
  return /\b(?:join|merge|combine|assemble|edit|editor|timeline|final video|full video|scene join|scenes?\s*(?:ko|to)?\s*(?:jod|join|merge)|video bana(?:o|do))\b/i.test(String(text||""));
}
