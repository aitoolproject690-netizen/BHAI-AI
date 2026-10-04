import {ownerReady,ownerState} from "./owner.js";
import {getDb} from "./db.js";
import {getSession} from "./accounts.js";
import {generateImage,generateVideo,saveMediaAsset,getLatestMediaAsset,reserveMedia,releaseMedia,getMediaUsage} from "./agent.js";

const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
 await ownerReady;
 if(req.method!=="POST") return json(res,405,{error:"Method not allowed"});
 const db=await getDb();
 if(!db) return json(res,503,{error:"DATABASE_URL is required"});
 const account=await getSession(req,db);
 if(!account) return json(res,401,{error:"Login required. Open Account and login before using BHAI X media."});
 const control=ownerState();
 if(control.serverMode==="maintenance") return json(res,503,{error:"BHAI X is in owner maintenance mode.",maintenance:true});
 if(control.emergencyLock) return json(res,423,{error:"BHAI X is temporarily locked by the owner.",locked:true});

 const body=req.body||{};
 const type=String(body.type||"").toLowerCase();
 const prompt=String(body.prompt||"").trim();
 const aspectRatio=/^(?:9:16|1:1|4:5|16:9)$/.test(String(body.aspectRatio||""))?String(body.aspectRatio):"16:9";
 if(!prompt) return json(res,400,{error:"Media prompt is required."});
 if(type!=="image"&&type!=="video") return json(res,400,{error:"Media type must be image or video."});

 if(type==="image"){
  try{
   await reserveMedia(db,account.id,"image",10);
   try{
    const media=await generateImage(prompt,aspectRatio);
    await saveMediaAsset(db,account.id,"image",media);
    return json(res,200,{ok:true,text:"## 🖼️ Image generated\n\nBHAI X ne direct media pipeline se image banayi aur output validate kiya.",activity:[{tool:"generate_image",state:"done",details:"Dedicated media endpoint generated and validated the image."}],images:[{mimeType:media.mimeType,data:media.data}],usage:await getMediaUsage(db,account.id)});
   }catch(e){
    await releaseMedia(db,account.id,"image");
    return json(res,502,{error:"Image generation failed: "+String(e?.message||e),activity:[{tool:"generate_image",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
   }
  }catch(e){
   return json(res,502,{error:"Image generation pre-flight failed: "+String(e?.message||e),usage:await getMediaUsage(db,account.id)});
  }
 }

 try{
  await reserveMedia(db,account.id,"video",3);
  try{
   const wantsImage=body.imageToVideo===true;
   let sourceImage=wantsImage?await getLatestMediaAsset(db,account.id,"image"):null;
   let videoPrompt=prompt;
   if(wantsImage&&!sourceImage){
    videoPrompt="Create a cinematic video based on this visual request: "+prompt;
   }
   const media=await generateVideo(videoPrompt,Math.min(5,Math.max(1,Number(body.duration)||5)),aspectRatio,sourceImage);
   return json(res,200,{ok:true,text:"## 🎬 Video generated\n\nBHAI X ne dedicated video pipeline, provider fallback aur output validation complete ki.",activity:[{tool:"generate_video",state:"done",details:"Dedicated media endpoint generated and validated the video."}],images:[{mimeType:media.mimeType,data:media.data,video:true,duration:media.duration}],usage:await getMediaUsage(db,account.id)});
  }catch(e){
   await releaseMedia(db,account.id,"video");
   return json(res,502,{error:"Video generation failed: "+String(e?.message||e),activity:[{tool:"generate_video",state:"failed",details:String(e?.message||e)}],usage:await getMediaUsage(db,account.id)});
  }
 }catch(e){
  return json(res,502,{error:"Video generation pre-flight failed: "+String(e?.message||e),usage:await getMediaUsage(db,account.id)});
 }
}
