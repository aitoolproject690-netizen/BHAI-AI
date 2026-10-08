import crypto from "node:crypto";
import {getDb} from "./db.js";
import {getSession} from "./accounts.js";

export const YOUTUBE_SCOPE="https://www.googleapis.com/auth/youtube.upload";

const clean=(v,n=500)=>String(v??"").trim().slice(0,n);
const sha256=v=>crypto.createHash("sha256").update(String(v)).digest("hex");

function config(){
 const clientId=String(process.env.YOUTUBE_CLIENT_ID||"").trim();
 const clientSecret=String(process.env.YOUTUBE_CLIENT_SECRET||"").trim();
 return {
  clientId,clientSecret,
  redirectUri:String(process.env.YOUTUBE_OAUTH_REDIRECT_URI||"").trim()
   || ((process.env.RENDER_EXTERNAL_URL||"").replace(/\/$/,"")+"/api/youtube/callback")
 };
}
export function youtubeConfigured(){
 const c=config();
 return Boolean(c.clientId&&c.clientSecret&&c.redirectUri);
}
function encryptionKey(){
 const secret=String(process.env.BHAI_YOUTUBE_TOKEN_SECRET||"").trim();
 if(!secret)throw new Error("BHAI_YOUTUBE_TOKEN_SECRET is required for encrypted YouTube tokens.");
 return crypto.createHash("sha256").update(secret).digest();
}
function encrypt(value){
 const iv=crypto.randomBytes(12),key=encryptionKey(),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
 const data=Buffer.concat([cipher.update(String(value),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),data.toString("base64url")].join(".");
}
function decrypt(value){
 const p=String(value||"").split(".");
 if(p.length!==4||p[0]!=="v1")throw new Error("Invalid encrypted YouTube token.");
 const key=encryptionKey(),dec=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(p[1],"base64url"));
 dec.setAuthTag(Buffer.from(p[2],"base64url"));
 return Buffer.concat([dec.update(Buffer.from(p[3],"base64url")),dec.final()]).toString("utf8");
}
async function schema(db){
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_youtube_connections (
   account_id TEXT PRIMARY KEY,
   refresh_token TEXT NOT NULL,
   access_token TEXT,
   expires_at TIMESTAMPTZ,
   scope TEXT NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
   updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
 await db.query(`CREATE TABLE IF NOT EXISTS bhai_youtube_oauth_states (
   state_hash TEXT PRIMARY KEY,
   account_id TEXT NOT NULL,
   expires_at TIMESTAMPTZ NOT NULL,
   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
 )`);
}
async function tokenRow(db,accountId){
 await schema(db);
 const q=await db.query("SELECT account_id,refresh_token,access_token,expires_at,scope,updated_at FROM bhai_youtube_connections WHERE account_id=$1",[accountId]);
 return q.rows[0]||null;
}
export async function getYouTubeStatus(accountId){
 const db=await getDb(); if(!db)throw new Error("DATABASE_URL is required");
 const c=config(),row=await tokenRow(db,accountId);
 return {
  configured:youtubeConfigured(),
  oauthConfigured:Boolean(c.clientId&&c.clientSecret&&c.redirectUri),
  connected:Boolean(row),
  scope:row?.scope||null,
  updatedAt:row?.updated_at||null
 };
}
export async function beginYouTubeOAuth(accountId){
 const db=await getDb();if(!db)throw new Error("DATABASE_URL is required");
 if(!youtubeConfigured())throw new Error("YouTube OAuth is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and BHAI_YOUTUBE_TOKEN_SECRET on the server.");
 await schema(db);
 const state=crypto.randomBytes(32).toString("base64url");
 await db.query("DELETE FROM bhai_youtube_oauth_states WHERE expires_at<NOW()");
 await db.query("INSERT INTO bhai_youtube_oauth_states(state_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[sha256(state),accountId]);
 const c=config();
 const qs=new URLSearchParams({
  client_id:c.clientId,redirect_uri:c.redirectUri,response_type:"code",
  access_type:"offline",prompt:"consent",include_granted_scopes:"true",scope:YOUTUBE_SCOPE,state
 });
 return c.authUrl="https://accounts.google.com/o/oauth2/v2/auth?"+qs.toString(),{authUrl:c.authUrl,expiresInSeconds:600};
}
async function exchangeCode(code){
 const c=config();
 const r=await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({code,client_id:c.clientId,client_secret:c.clientSecret,redirect_uri:c.redirectUri,grant_type:"authorization_code"}),
  signal:AbortSignal.timeout(20000)
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||"Google OAuth token exchange failed.");
 return d;
}
async function saveTokens(db,accountId,tokens){
 const previous=await tokenRow(db,accountId);
 const refresh=tokens.refresh_token?encrypt(tokens.refresh_token):previous?.refresh_token;
 if(!refresh)throw new Error("Google did not return a refresh token. Reconnect YouTube with offline consent.");
 const access=encrypt(tokens.access_token);
 const expires=new Date(Date.now()+Math.max(60,Number(tokens.expires_in||3600))*1000).toISOString();
 await db.query(`INSERT INTO bhai_youtube_connections(account_id,refresh_token,access_token,expires_at,scope)
   VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(account_id) DO UPDATE SET refresh_token=EXCLUDED.refresh_token,access_token=EXCLUDED.access_token,expires_at=EXCLUDED.expires_at,scope=EXCLUDED.scope,updated_at=NOW()`,
  [accountId,refresh,access,expires,String(tokens.scope||YOUTUBE_SCOPE)]);
}
async function accessToken(db,accountId){
 const row=await tokenRow(db,accountId);if(!row)return null;
 if(row.access_token&&row.expires_at&&new Date(row.expires_at).getTime()>Date.now()+60000)return decrypt(row.access_token);
 const c=config();
 const refresh=decrypt(row.refresh_token);
 const r=await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:refresh,grant_type:"refresh_token"}),
  signal:AbortSignal.timeout(20000)
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.access_token)throw new Error(d.error_description||d.error||"YouTube access token refresh failed.");
 await saveTokens(db,accountId,d);
 return String(d.access_token);
}
export async function completeYouTubeOAuth({state,code}){
 const db=await getDb();if(!db)throw new Error("DATABASE_URL is required");
 await schema(db);
 const q=await db.query("SELECT account_id FROM bhai_youtube_oauth_states WHERE state_hash=$1 AND expires_at>NOW()",[sha256(state)]);
 const accountId=q.rows[0]?.account_id;if(!accountId)throw new Error("OAuth state invalid or expired.");
 await db.query("DELETE FROM bhai_youtube_oauth_states WHERE state_hash=$1",[sha256(state)]);
 const tokens=await exchangeCode(code);
 await saveTokens(db,accountId,tokens);
 return {accountId,connected:true};
}
export async function revokeYouTubeConnection(accountId){
 const db=await getDb();if(!db)throw new Error("DATABASE_URL is required");
 const row=await tokenRow(db,accountId);
 if(!row)return {disconnected:true};
 try{
  const token=decrypt(row.refresh_token);
  await fetch("https://oauth2.googleapis.com/revoke?token="+encodeURIComponent(token),{method:"POST",signal:AbortSignal.timeout(15000)});
 }catch{}
 await db.query("DELETE FROM bhai_youtube_connections WHERE account_id=$1",[accountId]);
 return {disconnected:true};
}
function validateUploadMeta(meta={}){
 const title=clean(meta.title||"BHAI X Video",100).replace(/[<>]/g,"");
 const description=clean(meta.description||"Created with BHAI X.",5000).replace(/\u0000/g,"");
 const tags=Array.isArray(meta.tags)?meta.tags.map(x=>clean(x,60).replace(/[<>]/g,"")).filter(Boolean).slice(0,30):[];
 const privacy=["public","unlisted","private"].includes(String(meta.privacy||"private"))?String(meta.privacy):"private";
 return {title:title||"BHAI X Video",description,tags,privacy,categoryId:clean(meta.categoryId||"22",4)};
}
export function normalizeYouTubeUploadRequest(input={}){
 return {videoData:String(input.videoData||input.data||""),mimeType:String(input.mimeType||"video/mp4"),...validateUploadMeta(input)};
}
export async function uploadToYouTube(accountId,input={}){
 const db=await getDb();if(!db)throw new Error("DATABASE_URL is required");
 if(!youtubeConfigured())throw new Error("YouTube publishing is not configured on the server.");
 const req=normalizeYouTubeUploadRequest(input);
 if(!req.videoData)throw new Error("Verified final MP4 data is required for YouTube upload.");
 if(!/^video\/(?:mp4|webm|quicktime)$/i.test(req.mimeType))throw new Error("Only validated video MIME types can be published.");
 const data=Buffer.from(req.videoData,"base64");
 if(data.length<32)throw new Error("Final video payload is empty.");
 const token=await accessToken(db,accountId);if(!token)throw new Error("YouTube account is not connected.");
 const metadata={snippet:{title:req.title,description:req.description,categoryId:req.categoryId},status:{privacyStatus:req.privacy}};
 if(req.tags.length)metadata.snippet.tags=req.tags;
 const init=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{
  method:"POST",
  headers:{
   Authorization:"Bearer "+token,"Content-Type":"application/json","X-Upload-Content-Type":req.mimeType,
   "X-Upload-Content-Length":String(data.length)
  },
  body:JSON.stringify(metadata),signal:AbortSignal.timeout(30000)
 });
 if(!init.ok)throw new Error("YouTube upload session creation failed: HTTP "+init.status+" "+(await init.text()).slice(0,800));
 const location=init.headers.get("location");if(!location)throw new Error("YouTube did not return a resumable upload location.");
 const put=await fetch(location,{
  method:"PUT",headers:{"Content-Type":req.mimeType,"Content-Length":String(data.length)},body:data,
  signal:AbortSignal.timeout(Math.max(120000,Math.ceil(data.length/1024/1024)*10000))
 });
 const result=await put.json().catch(()=>({}));
 if(!put.ok||!result.id)throw new Error("YouTube video upload failed: HTTP "+put.status+" "+(result.error?.message||"unknown upload error"));
 const videoId=String(result.id);
 return {
  ok:true,verified:true,videoId,url:"https://www.youtube.com/watch?v="+encodeURIComponent(videoId),
  privacyStatus:result.status?.privacyStatus||req.privacy,
  title:result.snippet?.title||req.title,
  uploadedAt:new Date().toISOString(),
  quota:{method:"videos.insert",providerQuotaCost:1}
 };
}

export default async function handler(req,res){
 const endpoint=new URL(req.url||"/","http://localhost").pathname;
 try{
  if(endpoint==="/api/youtube/callback"){
   if(req.method!=="GET")return res.status(405).json({error:"Method not allowed"});
   const state=String(req.query?.state||"").trim(),code=String(req.query?.code||"").trim(),oauthError=String(req.query?.error||"").trim();
   if(oauthError)return res.status(400).end("YouTube authorization cancelled or denied. You can close this tab and return to BHAI X.");
   if(!state||!code)return res.status(400).end("YouTube OAuth callback is missing state or code.");
   await completeYouTubeOAuth({state,code});
   res.setHeader("Content-Type","text/html; charset=utf-8");
   return res.status(200).end("<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>BHAI X</title></head><body style="font-family:system-ui;background:#080a0f;color:#eef2ff;padding:32px"><h2>✅ YouTube connected</h2><p>BHAI X ko YouTube channel access mil gaya. Ab is tab ko band karke BHAI X par wapas aa sakte ho.</p><script>setTimeout(()=>window.close(),900)</script></body></html>");
  }
  const db=await getDb();if(!db)return res.status(503).json({error:"DATABASE_URL is required"});
  const account=await getSession(req,db);if(!account)return res.status(401).json({error:"Login required."});
  if(req.method==="GET")return res.status(200).json({ok:true,...await getYouTubeStatus(account.id)});
  if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
  const action=String(req.body?.action||"status");
  if(action==="connect")return res.status(200).json({ok:true,...await beginYouTubeOAuth(account.id)});
  if(action==="disconnect")return res.status(200).json({ok:true,...await revokeYouTubeConnection(account.id)});
  if(action==="upload"){
   const input={...(req.body||{})};
   if(!input.videoData&&!input.data){
    const row=await tokenRow(db,account.id);
    if(!row)throw new Error("YouTube account is not connected.");
    const media=await db.query("SELECT mime_type,data FROM bhai_media_assets WHERE account_id=$1 AND type='video' ORDER BY id DESC LIMIT 1",[account.id]);
    const latest=media.rows[0];
    if(!latest)throw new Error("No saved verified final video is available. Render a final MP4 before publishing.");
    input.videoData=latest.data;input.mimeType=latest.mime_type;
    const pkg=await db.query("SELECT youtube FROM bhai_video_packages WHERE account_id=$1",[account.id]).catch(()=>({rows:[]}));
    const meta=pkg.rows[0]?.youtube||{};
    input.title=input.title||meta.title;input.description=input.description||meta.description;input.tags=input.tags||meta.tags;
   }
   return res.status(200).json(await uploadToYouTube(account.id,input));
  }
  return res.status(400).json({error:"Unsupported YouTube action."});
 }catch(e){return res.status(502).json({ok:false,error:String(e?.message||e)});}
}
