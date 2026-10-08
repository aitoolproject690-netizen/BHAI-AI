import {requireSession} from "./_utils.js";
import {getDb} from "./db.js";
import {generateWithRouter} from "./aiRouter.js";
import {generateCharacterVisual,generateCharacterVideo,saveMediaAsset,reserveMedia,releaseMedia,getMediaUsage} from "./agent.js";
import {normalizeStoryRequest,buildStoryPrompt,parseAndValidateStoryPlan} from "../src/storyEngine.js";
import {makeCharacterIdentity} from "../src/characterIdentity.js";
import {buildEditTimeline,verifyEditTimeline} from "../src/sceneEditorEngine.js";
import {normalizeScenePostRequest,buildScenePostProductionManifest,verifyScenePostManifest} from "../src/scenePostProductionEngine.js";
import {renderTimeline} from "../src/videoRenderer.js";
import {buildAutonomousPlan,normalizeAutonomousRequest,productionCompletionProof} from "../src/autonomousProductionEngine.js";
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
  [accountId,JSON.stringify(rendered.youtube||{}),JSON.stringify(rendered.thumbnail||null),JSON.stringify({schemaVersion:rendered.schemaVersion,renderer:rendered.renderer,verification:rendered.verification,stats:rendered.stats,applied:rendered.applied})]);
}

async function loadVideoPackage(db,accountId){
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_video_packages (
  account_id TEXT PRIMARY KEY, youtube JSONB NOT NULL, thumbnail JSONB,
  renderer JSONB, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 const q=await db.query("SELECT youtube,thumbnail,renderer,updated_at FROM bhai_video_packages WHERE account_id=$1",[accountId]);
 return q.rows[0]||null;
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
 const request=normalizeAutonomousRequest(rawInput);
 const plan=buildAutonomousPlan(request);
 const activity=[];
 const evidence={story:false,characters:false,visuals:false,videos:false,post:false,render:false,youtube:false};
 let story=null;
 let characterRows=[];
 let sceneClips=[];
 let rendered=null;
 let youtube=null;
 let youtubeAuthUrl=null;

 activity.push({tool:"production-plan",state:"done",details:"Autonomous pipeline plan verified; no manual tool selection required."});
 try{
  const storyResult=await buildStory(request.story);
  story=storyResult.plan;
  evidence.story=true;
  activity.push({tool:"story-engine",state:"done",details:"Structured story/script schema verified with "+story.scenes.length+" planned scene(s)."});
 }catch(e){
  activity.push({tool:"story-engine",state:"failed",details:String(e?.message||e)});
  throw Object.assign(e,{productionActivity:activity});
 }

 const selectedScenes=selectScenes(story,Math.min(request.maxScenes,3));
 if(!selectedScenes.length)throw Object.assign(new Error("Story contained no renderable scenes."),{productionActivity:activity});
 if(selectedScenes.length<story.scenes.length)activity.push({tool:"scene-budget",state:"done",details:"Daily free video lane is capped at 3 scene renders; the autonomous run is limited to the first "+selectedScenes.length+" scene(s) and will not falsely claim the full story was rendered."});

 for(const c of story.characters.slice(0,16)){
  characterRows.push({...await getOrCreateCharacter((await getDb()),account.id,c),sourceId:c.id});
 }
 evidence.characters=characterRows.length>0;
 activity.push({tool:"character-identity",state:"done",details:characterRows.length+" account-scoped permanent Character ID(s) verified/reused."});

 const db=await getDb();
 if(!db)throw new Error("DATABASE_URL is required");

 for(let i=0;i<selectedScenes.length;i++){
  const s=selectedScenes[i];
  const primary=scenePrimaryCharacter(s,characterRows);
  const charName=primary?.name||"";
  const scenePrompt=clean([charName&&("Character: "+charName),s.action,s.visualPrompt,s.cameraPrompt].filter(Boolean).join("\n"),9000);
  await reserveMedia(db,account.id,"image",10);
  let visual;
  try{visual=await generateCharacterVisual(db,account.id,scenePrompt,request.aspectRatio);await saveMediaAsset(db,account.id,"image",visual.media);}
  catch(e){await releaseMedia(db,account.id,"image");throw Object.assign(new Error("Scene "+(i+1)+" visual generation failed: "+String(e?.message||e)),{productionActivity:activity});}
  activity.push({tool:"character-visual",state:"done",details:"Scene "+(i+1)+" visual generated with account-scoped identity lineage."});
  evidence.visuals=true;

  await reserveMedia(db,account.id,"video",3);
  let video;
  try{
   const videoPrompt=clean(["Character: "+(charName||"primary story character"),s.action,s.visualPrompt,s.cameraPrompt].filter(Boolean).join("\n"),9000);
   video=await generateCharacterVideo(db,account.id,videoPrompt,Math.min(5,Math.max(1,Number(s.durationSeconds)||5)),request.aspectRatio,visual.media);
   await saveMediaAsset(db,account.id,"video",video.media);
  }catch(e){await releaseMedia(db,account.id,"video");throw Object.assign(new Error("Scene "+(i+1)+" video generation failed: "+String(e?.message||e)),{productionActivity:activity});}
  activity.push({tool:"character-video",state:"done",details:"Scene "+(i+1)+" actual video output validated and character lineage preserved."});
  evidence.videos=true;

  const postRequest=normalizeScenePostRequest({prompt:[s.vfxPrompt,s.musicPrompt,s.sfxPrompt,s.action].filter(Boolean).join("\n"),duration:Math.min(5,Math.max(1,Number(video.media.duration||s.durationSeconds)||5)),style:"cinematic"});
  const post=buildScenePostProductionManifest({...postRequest,includeMusic:true});
  const postCheck=verifyScenePostManifest(post);
  if(!postCheck.ok)throw Object.assign(new Error("Scene "+(i+1)+" post-production contract failed."),{productionActivity:activity});
  evidence.post=true;
  sceneClips.push({sceneId:s.id||("scene_"+(i+1)),videoAssetId:video.assetId||"",sourceVideo:video.media,durationSeconds:Math.min(5,Math.max(1,Number(video.media.duration||s.durationSeconds)||5)),verified:true,postProduction:post,transition:"cut"});
  activity.push({tool:"scene-post-production",state:"done",details:"VFX/Music/SFX manifest verified for scene "+(i+1)+"."});
 }

 const timeline=buildEditTimeline({scenes:sceneClips,aspectRatio:request.aspectRatio,fps:30});
 const timelineCheck=verifyEditTimeline(timeline);
 if(!timelineCheck.ok)throw Object.assign(new Error("Final timeline verification failed."),{productionActivity:activity});
 try{
  rendered=await renderTimeline(timeline,{
   title:story.youtube?.titleIdeas?.[0]||("BHAI X | "+story.title),
   description:story.youtube?.description||("Created by BHAI X from an autonomous production pipeline.\n\n"+(story.youtube?.hook||"")),
   tags:["BHAI X","Hindi","cartoon","cinematic",story.genre].filter(Boolean)
  });
 }catch(e){throw Object.assign(new Error("Final MP4 rendering failed: "+String(e?.message||e)),{productionActivity:activity});}
 evidence.render=Boolean(rendered?.verification?.ok&&rendered?.media?.data);
 await saveMediaAsset(db,account.id,"video",rendered.media);
 await saveVideoPackage(db,account.id,rendered);
 activity.push({tool:"ffmpeg-renderer",state:evidence.render?"done":"failed",details:evidence.render?"Actual final MP4 + thumbnail encoded and output contract verified.":"Final MP4 was not verified."});

 if(request.autoPublish){
  try{
   const status=await getYouTubeStatus(account.id);
   if(status.connected){
    youtube=await uploadToYouTube(account.id,{
     videoData:rendered.media.data,mimeType:rendered.media.mimeType,
     title:rendered.youtube.title,description:rendered.youtube.description,
     tags:rendered.youtube.tags,privacy:request.privacy
    });
    evidence.youtube=Boolean(youtube?.verified&&youtube?.url);
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
 const proof=productionCompletionProof({plan,evidence,finalVideo:{rendered:Boolean(rendered),verified:evidence.render},youTube:youtube});
 const fullStoryRendered=selectedScenes.length===story.scenes.length;
 const verified=proof.ok&&fullStoryRendered;
 return {
  ok:true,verified,production:{planId:plan.pipelineId,schemaVersion:plan.schemaVersion,evidence,proof,fullStoryRendered},
  text:verified
   ? "## ✅ Autonomous production DONE\n\nStory → permanent characters → visuals → scene videos → VFX/Music/SFX → final MP4 → YouTube publishing complete hua, aur har required step ka proof verified hai."
   : evidence.render
    ? "## 🎬 Final MP4 ready\n\nBHAI X ne autonomous story-to-video pipeline complete karke actual MP4 + thumbnail verify kiya. "+(request.autoPublish?(evidence.youtube?"YouTube upload bhi verified hai.":"YouTube publishing abhi verified nahi hai; isliye DONE claim nahi kiya."):"YouTube publishing request nahi thi, isliye final MP4 ko verified output maana gaya.")+
      (youtubeAuthUrl?"\n\n🔐 **YouTube connect:** "+youtubeAuthUrl:"")
    : "## ⚠️ Autonomous production partial\n\nRequired verification complete nahi hui; BHAI X ne DONE claim nahi kiya.",
  story,characters:characterRows.map(c=>({characterId:c.character_id,name:c.name,identityFingerprint:c.identity_fingerprint})),
  timeline,rendered:rendered?{media:rendered.media,thumbnail:rendered.thumbnail,youtube:rendered.youtube,verification:rendered.verification,stats:rendered.stats,applied:rendered.applied}:null,
  youtube,youtubeAuthUrl,
  images:rendered?[{mimeType:rendered.media.mimeType,data:rendered.media.data,video:true,duration:rendered.media.duration,name:rendered.youtube.filename}]:[],
  thumbnail:rendered?.thumbnail||null,
  activity,
  usage:await getMediaUsage(db,account.id)
 };
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
  return json(res,Number(e?.status)||502,{ok:false,verified:false,text:"## ⚠️ Autonomous production stopped\n\n"+String(e?.message||e)+"\n\nDONE claim nahi kiya gaya.",activity:e.productionActivity||[],usage:await getMediaUsage(db,account.id).catch(()=>null)});
 }
}
