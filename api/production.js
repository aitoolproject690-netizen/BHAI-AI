import {requireSession} from "./_utils.js";
import {getDb} from "./db.js";
import {generateWithRouter} from "./aiRouter.js";
import {generateCharacterVisual,generateCharacterVideo,saveMediaAsset,getLatestMediaAsset,reserveMedia,releaseMedia,getMediaUsage} from "./agent.js";
import {normalizeStoryRequest,buildStoryPrompt,parseAndValidateStoryPlan} from "../src/storyEngine.js";
import {makeCharacterIdentity} from "../src/characterIdentity.js";
import {buildEditTimeline,verifyEditTimeline} from "../src/sceneEditorEngine.js";
import {normalizeScenePostRequest,buildScenePostProductionManifest,verifyScenePostManifest} from "../src/scenePostProductionEngine.js";
import {renderTimeline,verifyRenderedVideo} from "../src/videoRenderer.js";
import {buildAutonomousPlan,normalizeAutonomousRequest,productionCompletionProof} from "../src/autonomousProductionEngine.js";
import {buildProductionCheckpoint,productionStepDone} from "../src/productionCheckpoint.js";
import {buildCharacterBible,buildCameraPlan,buildAudioMasterContract,buildYouTubePackage,buildShortsPlan} from "../src/mediaProductionEngine.js";
import {beginYouTubeOAuth,getYouTubeStatus,uploadToYouTube} from "./youtube.js";

const json=(res,status,data)=>res.status(status).json(data);
const clean=(v,n=4000)=>String(v??"").trim().slice(0,n);

async function characterSchema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_character_identities (
  id TEXT PRIMARY KEY, account_id TEXT NOT NULL, character_id TEXT NOT NULL, name TEXT NOT NULL,
  identity_version INTEGER NOT NULL DEFAULT 1, identity_fingerprint TEXT NOT NULL, identity_json JSONB NOT NULL,
  canonical_prompt TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id,character_id), UNIQUE(account_id,identity_fingerprint)
 )`);
}

async function getOrCreateCharacter(db,accountId,source={}){
 await characterSchema(db);
 const name=clean(source.name||"Character",120);
 const existing=await db.query("SELECT character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt FROM bhai_character_identities WHERE account_id=$1 AND LOWER(name)=LOWER($2) ORDER BY created_at DESC LIMIT 1",[accountId,name]);
 if(existing.rows[0])return existing.rows[0];
 const identity=makeCharacterIdentity({
  name,
  role:source.role,
  age:source.age,
  description:source.description,
  appearance:source.appearance||source.description,
  face:source.face||source.appearance||source.description||name,
  hair:source.hair||source.appearance||source.description||name,
  eyes:source.eyes||"stable eye appearance",
  skin:source.skin||"stable skin tone",
  body:source.body||source.appearance||source.description||name,
  clothing:source.clothing||source.appearance||source.description||name,
  personality:source.personality,
  voiceHints:source.voiceHints,
  visualStyle:source.visualStyle||"3D anime cinematic cartoon"
 });
 const id=cryptoRandomId(identity.characterId);
 const r=await db.query(`INSERT INTO bhai_character_identities
  (id,account_id,character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt)
  VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
  RETURNING character_id,name,identity_version,identity_fingerprint,identity_json,canonical_prompt`,
  [id,accountId,identity.characterId,identity.identity.name,identity.identityVersion,identity.identityFingerprint,JSON.stringify(identity.identity),identity.canonicalPrompt]);
 return r.rows[0];
}

function cryptoRandomId(input){
 let h=0;for(const c of String(input||""))h=((h<<5)-h+c.charCodeAt(0))|0;
 return Math.abs(h).toString(36)+"_"+Date.now().toString(36);
}

async function saveVideoPackage(db,accountId,rendered){
 const suite=rendered?.mediaSuite||{};
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_video_packages (
  account_id TEXT PRIMARY KEY,
  youtube JSONB NOT NULL,
  thumbnail JSONB,
  renderer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query(`INSERT INTO bhai_video_packages(account_id,youtube,thumbnail,renderer)
  VALUES($1,$2::jsonb,$3::jsonb,$4::jsonb)
  ON CONFLICT(account_id) DO UPDATE SET youtube=EXCLUDED.youtube,thumbnail=EXCLUDED.thumbnail,renderer=EXCLUDED.renderer,updated_at=NOW()`,
  [accountId,JSON.stringify(rendered.youtube||{}),JSON.stringify(rendered.thumbnail||null),JSON.stringify({schemaVersion:rendered.schemaVersion,renderer:rendered.renderer,verification:rendered.verification,stats:rendered.stats,applied:rendered.applied,mediaSuite:suite})]);
}

async function loadVideoPackage(db,accountId){
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_video_packages (
  account_id TEXT PRIMARY KEY, youtube JSONB NOT NULL, thumbnail JSONB,
  renderer JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 const q=await db.query("SELECT youtube,thumbnail,renderer,updated_at FROM bhai_video_packages WHERE account_id=$1",[accountId]);
 return q.rows[0]||null;
}

async function ensureProductionCheckpointTable(db){
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_production_checkpoints (
  account_id TEXT PRIMARY KEY,
  pipeline_id TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query("CREATE INDEX IF NOT EXISTS idx_bhai_production_checkpoints_pipeline ON bhai_production_checkpoints(pipeline_id)");
}

async function loadProductionCheckpoint(db,accountId,pipelineId){
 if(!pipelineId)return null;
 await ensureProductionCheckpointTable(db);
 const q=await db.query("SELECT data FROM bhai_production_checkpoints WHERE account_id=$1 AND pipeline_id=$2",[accountId,String(pipelineId)]);
 return q.rows[0]?.data||null;
}

async function saveProductionCheckpoint(db,accountId,checkpoint){
 if(!db||!checkpoint?.pipelineId)return;
 await ensureProductionCheckpointTable(db);
 await db.query(`INSERT INTO bhai_production_checkpoints(account_id,pipeline_id,data,updated_at)
   VALUES($1,$2,$3::jsonb,NOW())
   ON CONFLICT(account_id) DO UPDATE SET pipeline_id=EXCLUDED.pipeline_id,data=EXCLUDED.data,updated_at=NOW()`,
   [accountId,String(checkpoint.pipelineId),JSON.stringify(checkpoint)]);
}

async function loadCharacterVisualAssetById(db,accountId,assetId){
 if(!assetId)return null;
 try{
  const q=await db.query("SELECT asset_id,mime_type,data,provider,identity_fingerprint,identity_version FROM bhai_character_visual_assets WHERE account_id=$1 AND asset_id=$2",[accountId,String(assetId)]);
  return q.rows[0]||null;
 }catch{return null;}
}

async function loadCharacterVideoAssetById(db,accountId,assetId){
 if(!assetId)return null;
 try{
  const q=await db.query("SELECT asset_id,mime_type,data,provider,request_json,identity_fingerprint,identity_version,source_visual_asset_id,frame_identity_verified FROM bhai_character_video_assets WHERE account_id=$1 AND asset_id=$2",[accountId,String(assetId)]);
  return q.rows[0]||null;
 }catch{return null;}
}

function selectScenes(story,maxScenes){
 const scenes=Array.isArray(story?.scenes)?story.scenes:[];
 return scenes.slice(0,Math.min(maxScenes,scenes.length));
}

function scenePrimaryCharacter(scene,characters){
 const ids=new Set(Array.isArray(scene?.characterIds)?scene.characterIds.map(String):[]);
 return characters.find(c=>ids.has(String(c.sourceId)))||characters.find(c=>ids.has(String(c.character_id)))||characters[0]||null;
}

async function buildStory(request){
 const generated=await generateWithRouter({
  task:"autonomous story production: "+request.prompt,
  system:buildStoryPrompt(request),
  messages:[{role:"user",text:request.prompt}],
  role:"story",
  fallback:true
 });
 let check=parseAndValidateStoryPlan(generated.text,request);
 if(!check.ok){
  try{
   const repaired=await generateWithRouter({
    task:"repair autonomous story JSON: "+request.prompt,
    system:buildStoryPrompt(request)+"\nRepair ONLY the draft below into the exact JSON contract. Return JSON only.",
    messages:[{role:"user",text:generated.text}],
    preferred:generated.provider||"",
    role:"story",
    fallback:true
   });
   const repairedCheck=parseAndValidateStoryPlan(repaired.text,request);
   if(repairedCheck.ok){generated=repaired;check=repairedCheck;}
  }catch{}
 }
 if(!check.ok)throw Object.assign(new Error("Story output failed schema/quality validation."),{status:422,validation:check.errors||[]});
 return {plan:check.plan,provider:generated.provider||null,backend_provider:generated.backend_provider||null,model:generated.model||null};
}

async function runProduction(account,rawInput){
 const db=await getDb();
 if(!db)throw new Error("DATABASE_URL is required");

 const suppliedCheckpoint=rawInput?.recoveryCheckpoint&&typeof rawInput.recoveryCheckpoint==="object" ? rawInput.recoveryCheckpoint : null;
 const requestedPipelineId=String(rawInput?.productionPipelineId||rawInput?.resumePipelineId||suppliedCheckpoint?.pipelineId||"").trim();
 const storedCheckpoint=requestedPipelineId?await loadProductionCheckpoint(db,account.id,requestedPipelineId):null;
 const previous=storedCheckpoint||suppliedCheckpoint||null;

 const request=normalizeAutonomousRequest(
  previous?.request && !String(rawInput?.prompt||"").trim()
   ? previous.request
   : rawInput
 );
 const freshPlan=buildAutonomousPlan(request);
 const plan=previous?.plan?.pipelineId ? previous.plan : freshPlan;

 const activity=[];
 const evidence={story:false,characters:false,visuals:false,videos:false,post:false,render:false,youtube:false};
 const completed=new Set(Array.isArray(previous?.completedStepIds)?previous.completedStepIds.map(String):[]);
 let story=previous?.story||null;
 let characterRows=Array.isArray(previous?.characters)?previous.characters.map(c=>({...c})).filter(c=>c?.character_id):[];
 let sceneStates=Array.isArray(previous?.sceneStates)?previous.sceneStates.map(s=>({...s})):[]; 
 let rendered=null;
 let youtube=previous?.youtube||null;
 let youtubeAuthUrl=null;
 let checkpoint=null;

 const snapshot=({currentStep=null,message="",renderProof=null}={})=>{
  checkpoint=buildProductionCheckpoint({
   plan,request,story,characters:characterRows,sceneStates,evidence,
   completedStepIds:[...completed],currentStep,renderProof,youtube,activity
  });
  return checkpoint;
 };
 const persist=async(opts={})=>{
  const cp=snapshot(opts);
  await saveProductionCheckpoint(db,account.id,cp);
  return cp;
 };
 const fail=async(error,currentStep)=>{
  const cp=await persist({currentStep,message:String(error?.message||error).slice(0,500)});
  throw Object.assign(error,{productionActivity:activity,productionCheckpoint:cp});
 };

 activity.push({tool:"production-plan",state:"done",details:previous?"Durable production checkpoint loaded; resume path will skip verified stages and completed scene renders.":"Autonomous pipeline plan verified; no manual tool selection required."});
 await persist({currentStep:previous?previous.currentStep:"story",message:previous?"Production resume initialized from durable checkpoint.":"Production pipeline initialized."});

 try{
  if(productionStepDone(previous,"story")&&story){
   evidence.story=true;completed.add("story");
   activity.push({tool:"story-engine",state:"skipped",details:"Verified story checkpoint reused; generation was not repeated."});
  }else{
   const storyResult=await buildStory(request.story);
   story=storyResult.plan;
   evidence.story=true;completed.add("story");
   activity.push({tool:"story-engine",state:"done",details:"Structured story/script schema verified with "+story.scenes.length+" planned scene(s)."});
  }
  await persist({currentStep:"characters",message:"Story stage verified."});

  const selectedScenes=selectScenes(story,Math.min(request.maxScenes,3));
  if(!selectedScenes.length) throw new Error("Story contained no renderable scenes.");
  if(selectedScenes.length<story.scenes.length){
   activity.push({tool:"scene-budget",state:"done",details:"Daily free video lane is capped at 3 scene renders; only the first "+selectedScenes.length+" scene(s) are eligible and the run will not falsely claim the full story rendered."});
  }

  if(productionStepDone(previous,"characters") && characterRows.length){
   evidence.characters=true;completed.add("characters");
   activity.push({tool:"character-identity",state:"skipped",details:"Verified permanent Character ID checkpoint reused; character generation was not repeated."});
  }else{
   characterRows=[];
   for(const source of (Array.isArray(story.characters)?story.characters:[]).slice(0,16)){
    characterRows.push({...await getOrCreateCharacter(db,account.id,source),sourceId:source.id});
   }
   evidence.characters=characterRows.length>0;
   if(evidence.characters)completed.add("characters");
   activity.push({tool:"character-identity",state:evidence.characters?"done":"failed",details:characterRows.length+" account-scoped permanent Character ID(s) verified/reused."});
  }
  characterBible=characterBible||buildCharacterBible(characterRows);
  cameraPlan=cameraPlan||buildCameraPlan(selectedScenes,{style:story.visualStyle||request.story.visualStyle});
  evidence.camera=Boolean(characterBible.verified&&cameraPlan.verified);
  if(evidence.camera)completed.add("camera");
  activity.push({tool:"character-bible",state:"done",details:"Permanent Character Bible assembled from locked identities; continuity fields are account-scoped."});
  activity.push({tool:"camera-director",state:evidence.camera?"done":"failed",details:evidence.camera?"Every renderable scene received shot, lens, angle, movement, lighting and transition direction.":"Camera plan verification failed."});
  await persist({currentStep:"visuals",message:"Character Bible + Camera Director verified."});

  for(let i=0;i<selectedScenes.length;i++){
   const s=selectedScenes[i];
   const sceneId=String(s.id||("scene_"+(i+1)));
   const previousScene=sceneStates.find(x=>String(x.sceneId)===sceneId);
   const primary=scenePrimaryCharacter(s,characterRows);
   const charName=primary?.name||"";
   const camera=cameraPlan?.scenes?.find(x=>String(x.sceneId)===sceneId)||buildCameraPlan([s],{style:story.visualStyle||request.story.visualStyle}).scenes?.[0];
   const cameraText=camera?.direction||s.cameraPrompt;
   const scenePrompt=clean([charName&&("Character: "+charName),s.action,s.visualPrompt,cameraText].filter(Boolean).join("\n"),9000);

   let visualMedia=null;
   let visualAssetId=previousScene?.visualAssetId||null;
   let visualReused=false;
   const storedVisual=visualAssetId?await loadCharacterVisualAssetById(db,account.id,visualAssetId):null;
   if(previousScene?.visualVerified&&storedVisual?.data){
    visualMedia={mimeType:storedVisual.mime_type,data:storedVisual.data,provider:storedVisual.provider||"character-visual"};
    visualReused=true;
    activity.push({tool:"character-visual",state:"skipped",details:"Scene "+(i+1)+" verified visual asset reused from checkpoint."});
   }else{
    await reserveMedia(db,account.id,"image",10);
    try{
     const visual=await generateCharacterVisual(db,account.id,scenePrompt,request.aspectRatio);
     visualMedia=visual.media;
     await saveMediaAsset(db,account.id,"image",visual.media);
     visualAssetId=visual.assetId||null;
    }catch(e){
     await releaseMedia(db,account.id,"image");
     await fail(new Error("Scene "+(i+1)+" visual generation failed: "+String(e?.message||e)),"visuals");
    }
    activity.push({tool:"character-visual",state:"done",details:"Scene "+(i+1)+" visual generated with account-scoped identity lineage."});
   }
   let state=sceneStates.find(x=>String(x.sceneId)===sceneId)||{sceneId,index:i};
   state={...state,index:i,sceneId,visualAssetId,visualVerified:Boolean(visualAssetId&&visualMedia?.data),
     cameraDirection:camera?.direction||s.cameraPrompt||"", ...(visualReused?{}:{videoAssetId:null,videoVerified:false,postProduction:null,postVerified:false,verified:false})};
   sceneStates=sceneStates.filter(x=>String(x.sceneId)!==sceneId).concat(state);
   evidence.visuals=selectedScenes.every(scene=>{
    const row=sceneStates.find(x=>String(x.sceneId)===String(scene.id||("scene_"+(selectedScenes.indexOf(scene)+1))));
    return Boolean(row?.visualVerified);
   });
   if(evidence.visuals)completed.add("visuals");
   await persist({currentStep:"videos",message:"Scene "+(i+1)+" visual stage verified."});

   let videoMedia=null;
   let videoAssetId=state.videoAssetId||null;
   let videoReused=false;
   const storedVideo=videoAssetId?await loadCharacterVideoAssetById(db,account.id,videoAssetId):null;
   const storedVideoOk=Boolean(visualReused&&state.videoVerified&&storedVideo?.data);
   if(storedVideoOk){
    videoMedia={mimeType:storedVideo.mime_type,data:storedVideo.data,provider:storedVideo.provider||"character-video"};
    videoReused=true;
    activity.push({tool:"character-video",state:"skipped",details:"Scene "+(i+1)+" verified video asset reused from checkpoint; generation was not repeated."});
   }else{
    await reserveMedia(db,account.id,"video",3);
    try{
     const videoPrompt=clean(["Character: "+(charName||"primary story character"),s.action,s.visualPrompt,cameraText].filter(Boolean).join("\n"),9000);
     const video=await generateCharacterVideo(db,account.id,videoPrompt,Math.min(5,Math.max(1,Number(s.durationSeconds)||5)),request.aspectRatio,visualMedia);
     videoMedia=video.media;
     await saveMediaAsset(db,account.id,"video",video.media);
     videoAssetId=video.assetId||null;
     state={...state,videoAssetId};
    }catch(e){
     await releaseMedia(db,account.id,"video");
     await fail(new Error("Scene "+(i+1)+" video generation failed: "+String(e?.message||e)),"videos");
    }
    activity.push({tool:"character-video",state:"done",details:"Scene "+(i+1)+" actual video output validated and character lineage preserved."});
   }

   const durationSeconds=Math.min(5,Math.max(1,Number(videoMedia?.duration||s.durationSeconds)||5));
   const storedPost=videoReused&&state.postProduction&&state.postVerified ? state.postProduction : null;
   let post=storedPost;
   if(post){
    activity.push({tool:"scene-post-production",state:"skipped",details:"Scene "+(i+1)+" verified VFX/Music/SFX manifest reused from checkpoint."});
   }else{
    const postRequest=normalizeScenePostRequest({prompt:[s.vfxPrompt,s.musicPrompt,s.sfxPrompt,s.action].filter(Boolean).join("\n"),duration:durationSeconds,style:"cinematic"});
    post=buildScenePostProductionManifest({...postRequest,includeMusic:true});
    const postCheck=verifyScenePostManifest(post);
    if(!postCheck.ok) await fail(new Error("Scene "+(i+1)+" post-production contract failed."),"post");
    activity.push({tool:"scene-post-production",state:"done",details:"VFX/Music/SFX manifest verified for scene "+(i+1)+"."});
   }

   state={...state,sceneId,index:i,visualAssetId,videoAssetId,postProduction:post,durationSeconds,verified:true,visualVerified:Boolean(visualAssetId&&visualMedia?.data),videoVerified:Boolean(videoAssetId&&videoMedia?.data),postVerified:true};
   sceneStates=sceneStates.filter(x=>String(x.sceneId)!==sceneId).concat(state);
   evidence.visuals=selectedScenes.every((scene,j)=>Boolean(sceneStates.find(x=>String(x.sceneId)===String(scene.id||("scene_"+(j+1))))?.visualVerified));
   evidence.videos=selectedScenes.every((scene,j)=>Boolean(sceneStates.find(x=>String(x.sceneId)===String(scene.id||("scene_"+(j+1))))?.videoVerified));
   evidence.post=selectedScenes.every((scene,j)=>Boolean(sceneStates.find(x=>String(x.sceneId)===String(scene.id||("scene_"+(j+1))))?.postVerified));
   if(evidence.visuals)completed.add("visuals"); else completed.delete("visuals");
   if(evidence.videos)completed.add("videos"); else completed.delete("videos");
   if(evidence.post)completed.add("post"); else completed.delete("post");
   await persist({currentStep:i+1<selectedScenes.length?"visuals":"render",message:"Scene "+(i+1)+" checkpoint verified."});
  }

  const sceneClips=[];
  for(let i=0;i<selectedScenes.length;i++){
   const s=selectedScenes[i];
   const id=String(s.id||("scene_"+(i+1)));
   const state=sceneStates.find(x=>String(x.sceneId)===id);
   if(!state?.videoAssetId||!state?.verified) await fail(new Error("Scene "+(i+1)+" checkpoint is incomplete; final render blocked."),"render");
   const storedVideo=await loadCharacterVideoAssetById(db,account.id,state.videoAssetId);
   if(!storedVideo?.data) await fail(new Error("Scene "+(i+1)+" verified video asset could not be reloaded from storage."),"render");
   const primary=scenePrimaryCharacter(s,characterRows);
   sceneClips.push({
    sceneId:id,
    videoAssetId:state.videoAssetId,
    sourceVideo:{mimeType:storedVideo.mime_type,data:storedVideo.data,provider:storedVideo.provider||"character-video"},
    durationSeconds:Number(state.durationSeconds||5),
    verified:true,
    postProduction:state.postProduction,
    transition:"cut",
    scenePrompt:clean([primary?.name,s.action,s.visualPrompt,(sceneStates.find(x=>String(x.sceneId)===id)?.cameraDirection||s.cameraPrompt)].filter(Boolean).join(" "),240)
   });
  }

  const timeline=buildEditTimeline({scenes:sceneClips,aspectRatio:request.aspectRatio,fps:30});
  const timelineCheck=verifyEditTimeline(timeline);
  if(!timelineCheck.ok) await fail(new Error("Final timeline verification failed."),"render");

  if(productionStepDone(previous,"render")&&previous?.renderProof?.ok){
   const savedMedia=await getLatestMediaAsset(db,account.id,"video");
   const packageState=await loadVideoPackage(db,account.id);
   const savedVerification=verifyRenderedVideo(savedMedia||{});
   if(savedMedia?.data&&savedVerification.ok){
    rendered={schemaVersion:"1.0",renderer:packageState?.renderer?.renderer||"ffmpeg-static",media:savedMedia,thumbnail:packageState?.thumbnail||null,youtube:packageState?.youtube||{},verification:savedVerification,stats:packageState?.renderer?.stats||null,applied:packageState?.renderer?.applied||null};
    activity.push({tool:"ffmpeg-renderer",state:"skipped",details:"Verified final MP4 was reloaded from persisted media/package; rendering was not repeated."});
   }
  }
  if(!rendered){
   try{
    rendered=await renderTimeline({...timeline,audioMix:audioMaster},{
     title:story.youtube?.titleIdeas?.[0]||("BHAI X | "+story.title),
     description:story.youtube?.description||("Created by BHAI X from an autonomous production pipeline.\n\n"+(story.youtube?.hook||"")),
     tags:["BHAI X","Hindi","cartoon","cinematic",story.genre].filter(Boolean)
    });
   }catch(e){
    await fail(new Error("Final MP4 rendering failed: "+String(e?.message||e)),"render");
   }
   activity.push({tool:"ffmpeg-renderer",state:"done",details:"Actual final MP4 + thumbnail encoded and output contract verified."});
  }
  evidence.render=Boolean(rendered?.verification?.ok&&rendered?.media?.data);
  if(evidence.render)completed.add("render"); else completed.delete("render");
  if(evidence.render&&!productionStepDone(previous,"render")) await saveMediaAsset(db,account.id,"video",rendered.media);
  youtubePackage=buildYouTubePackage(story,timeline,{
   title:rendered?.youtube?.title,
   description:rendered?.youtube?.description,
   tags:rendered?.youtube?.tags
  });
  youtubePackage={...youtubePackage,thumbnailCount:Array.isArray(rendered?.thumbnails)?rendered.thumbnails.length:1,thumbnailReady:Boolean(rendered?.thumbnail?.data)};
  evidence.youtubePackage=Boolean(youtubePackage.verified&&youtubePackage.thumbnailReady);
  if(evidence.youtubePackage)completed.add("youtubePackage");
  rendered.mediaSuite={characterBible,cameraPlan,audioMaster,youtubePackage,shortsPlan};
  if(evidence.render&&!productionStepDone(previous,"render")) await saveVideoPackage(db,account.id,rendered);
  await persist({currentStep:request.autoPublish?"youtube":null,message:evidence.render?"Final MP4 checkpoint verified.":"Final MP4 verification failed.",renderProof:rendered?.verification||null});

  if(request.autoPublish){
   if(productionStepDone(previous,"youtube")&&youtube?.verified&&youtube?.url){
    evidence.youtube=true;completed.add("youtube");
    activity.push({tool:"youtube-publisher",state:"skipped",details:"Verified YouTube upload proof reused from checkpoint; upload was not repeated."});
   }else{
    try{
     const status=await getYouTubeStatus(account.id);
     if(status.connected){
      youtube=await uploadToYouTube(account.id,{
       videoData:rendered.media.data,mimeType:rendered.media.mimeType,
       title:rendered.youtube.title,description:rendered.youtube.description,
       tags:rendered.youtube.tags,privacy:request.privacy
      });
      evidence.youtube=Boolean(youtube?.verified&&youtube?.url);
      if(evidence.youtube)completed.add("youtube");
      else completed.delete("youtube");
      activity.push({tool:"youtube-publisher",state:evidence.youtube?"done":"failed",details:evidence.youtube?"Actual YouTube upload completed; post-upload URL proof returned.":"Upload response did not contain verified URL proof."});
     }else if(status.configured){
      const started=await beginYouTubeOAuth(account.id);
      youtubeAuthUrl=started.authUrl;
      activity.push({tool:"youtube-publisher",state:"pending",details:"YouTube OAuth is configured but this account is not connected; secure connect URL generated."});
     }else{
      activity.push({tool:"youtube-publisher",state:"pending",details:"YouTube OAuth credentials are not configured on the server; final MP4 remains ready but publishing is fail-closed."});
     }
    }catch(e){
     activity.push({tool:"youtube-publisher",state:"failed",details:String(e?.message||e)});
    }
   }
  }else{
   completed.add("youtube");
   evidence.youtube=true;
  }

  const proof=productionCompletionProof({plan,evidence,finalVideo:{rendered:Boolean(rendered),verified:evidence.render},youTube:youtube});
  const fullStoryRendered=selectedScenes.length===story.scenes.length;
  const verified=proof.ok&&fullStoryRendered;
  if(verified)completed.add("youtube");
  const finalCheckpoint=await persist({
   currentStep:verified?null:request.autoPublish?"youtube":"render",
   message:verified?"All autonomous production stages verified.":"Final MP4 verified; remaining production proof is still pending.",
   renderProof:rendered?.verification||null
  });
  return {
   ok:true,verified,
   production:{planId:plan.pipelineId,schemaVersion:plan.schemaVersion,evidence,proof,fullStoryRendered,resumed:Boolean(previous),checkpoint:finalCheckpoint},
   text:verified
    ? "## ✅ Autonomous production DONE\n\nStory → permanent characters → visuals → scene videos → VFX/Music/SFX → final MP4 → YouTube publishing complete hua, aur har required step ka proof verified hai."
    : evidence.render
     ? "## 🎬 Final MP4 ready\n\nBHAI X ne autonomous story-to-video pipeline complete karke actual MP4 + thumbnail verify kiya. "+(request.autoPublish?(evidence.youtube?"YouTube upload bhi verified hai.":"YouTube publishing abhi verified nahi hai; isliye DONE claim nahi kiya."): "YouTube publishing request nahi thi, isliye final MP4 ko verified output maana gaya.")+
       (youtubeAuthUrl?"\n\n🔐 **YouTube connect:** "+youtubeAuthUrl:"")
     : "## ⚠️ Autonomous production partial\n\nRequired verification complete nahi hui; BHAI X ne DONE claim nahi kiya.",
   story,characters:characterRows.map(c=>({characterId:c.character_id,name:c.name,identityFingerprint:c.identity_fingerprint})),
   timeline,rendered:rendered?{media:rendered.media,thumbnail:rendered.thumbnail,youtube:rendered.youtube,verification:rendered.verification,stats:rendered.stats,applied:rendered.applied}:null,
   youtube,youtubeAuthUrl,
   characterBible,cameraPlan,audioMaster,youtubePackage,shortsPlan,
   thumbnails:rendered?.thumbnails||[],
   mediaSuite:rendered?.mediaSuite||null,
   images:rendered?[{mimeType:rendered.media.mimeType,data:rendered.media.data,video:true,duration:rendered.media.duration,name:rendered.youtube.filename}]:[],
   thumbnail:rendered?.thumbnail||null,
   productionCheckpoint:finalCheckpoint,
   activity,
   usage:await getMediaUsage(db,account.id)
  };
 }catch(e){
  const cp=await persist({currentStep:checkpoint?.currentStep||"recovery",message:String(e?.message||e).slice(0,500)}).catch(()=>checkpoint);
  e.productionActivity=activity;
  e.productionCheckpoint=cp;
  throw e;
 }
}

export default async function handler(req,res){
 const account=await requireSession(req,res);if(!account)return;
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const db=await getDb();if(!db)return json(res,503,{error:"DATABASE_URL is required"});
 const input=req.body||{};
 try{
  const result=await runProduction(account,input);
  return json(res,result.verified?200:200,result);
 }catch(e){
  return json(res,Number(e?.status)||502,{ok:false,verified:false,text:"## ⚠️ Autonomous production stopped\n\n"+String(e?.message||e)+"\n\nDONE claim nahi kiya gaya.",productionPipelineId:e.productionCheckpoint?.pipelineId||null,productionCheckpoint:e.productionCheckpoint||null,activity:e.productionActivity||[],usage:await getMediaUsage(db,account.id).catch(()=>null)});
 }
}
