import crypto from "node:crypto";
import {buildSceneSpeechRequest,generateCharacterSpeech} from "../src/characterTtsProvider.js";
import {generateCharacterLipSync} from "../src/characterLipSyncProvider.js";

const json=(res,status,data)=>res.status(status).json(data);
const REFERENCE_VIDEO_URL="https://assets.sync.so/docs/example-video.mp4";
let lastRunAt=0;

function safeEqual(a,b){
  const left=Buffer.from(String(a||""));
  const right=Buffer.from(String(b||""));
  return left.length>0&&left.length===right.length&&crypto.timingSafeEqual(left,right);
}

export default async function handler(req,res){
  if(req.method!=="POST")return json(res,405,{ok:false,error:"Method not allowed"});
  const configured=String(process.env.BHAI_E2E_SMOKE_KEY||"");
  if(!configured)return json(res,503,{ok:false,error:"BHAI_E2E_SMOKE_KEY is not configured."});
  if(!safeEqual(req.headers?.["x-bhai-e2e-smoke-key"],configured))return json(res,401,{ok:false,error:"Unauthorized"});
  const now=Date.now();
  if(now-lastRunAt<10*60*1000)return json(res,429,{ok:false,error:"Media E2E smoke test is rate-limited to one run every 10 minutes."});
  lastRunAt=now;
  try{
    const speechRequest=buildSceneSpeechRequest({
      dialogue:[{characterId:"bhai-x-smoke-narrator",text:"Namaste, yeh BHAI X ki asli voice aur lip-sync jaanch hai."}]
    },[{sourceId:"bhai-x-smoke-narrator",character_id:"bhai-x-smoke-narrator",identity_json:{name:"Narrator",role:"narrator"}}]);
    const speech=await generateCharacterSpeech(speechRequest);
    const voiceBytes=Buffer.from(speech.data,"base64");
    if(!speech.verification?.ok||voiceBytes.subarray(0,4).toString("ascii")!=="RIFF"||voiceBytes.subarray(8,12).toString("ascii")!=="WAVE"){
      throw new Error("Real TTS response failed WAV verification.");
    }
    const clipResponse=await fetch(REFERENCE_VIDEO_URL,{signal:AbortSignal.timeout(30000)});
    if(!clipResponse.ok)throw new Error("Lip-sync reference video returned HTTP "+clipResponse.status+".");
    const clipBytes=Buffer.from(await clipResponse.arrayBuffer());
    if(clipBytes.length<32||clipBytes.length>24*1024*1024||clipBytes.subarray(4,8).toString("ascii")!=="ftyp"){
      throw new Error("Lip-sync reference clip failed MP4 verification.");
    }
    const synced=await generateCharacterLipSync({
      videoData:clipBytes.toString("base64"),
      audioData:speech.data,
      videoMimeType:"video/mp4",
      sceneId:"bhai-x-production-smoke",
      durationSeconds:speech.duration
    });
    const outputBytes=Buffer.from(synced.data,"base64");
    if(!synced.verification?.ok||outputBytes.subarray(4,8).toString("ascii")!=="ftyp"){
      throw new Error("Lip-sync provider output failed MP4 verification.");
    }
    return json(res,200,{
      ok:true,
      checkedAt:new Date().toISOString(),
      voice:{ok:true,provider:speech.provider,mimeType:speech.mimeType,bytes:voiceBytes.length,durationSeconds:speech.duration,realProviderResponse:true,wavVerified:true},
      lipSync:{ok:true,provider:synced.provider,jobId:synced.verification.providerJobId,status:synced.verification.status,mimeType:synced.mimeType,bytes:outputBytes.length,durationSeconds:synced.duration,mp4Verified:true,pixelLipSyncVerified:false},
      scope:"Live Gemini TTS + Sync Labs generation using a provider reference clip; this is a real provider E2E smoke, not an independent human-quality score for every generated scene."
    });
  }catch(error){
    return json(res,502,{ok:false,error:String(error?.message||error).slice(0,500),voiceConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY),lipSyncConfigured:Boolean(process.env.SYNC_API_KEY)});
  }
}
