import crypto from"node:crypto";
import{getDb,initDb}from"./db.js";
import{getSession}from"./accounts.js";

const json=(res,s,d)=>res.status(s).json(d);
const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
const scopes=["chat","coding","github","image","video","files","search","agent"];

async function schema(db){
 await db.query("CREATE TABLE IF NOT EXISTS bhai_api_keys (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,name TEXT NOT NULL,key_prefix TEXT NOT NULL,key_hash TEXT UNIQUE NOT NULL,scopes JSONB NOT NULL DEFAULT '[]'::jsonb,status TEXT NOT NULL DEFAULT 'active',usage_count BIGINT NOT NULL DEFAULT 0,last_used_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),revoked_at TIMESTAMPTZ)");
 await db.query("CREATE INDEX IF NOT EXISTS bhai_api_keys_account_idx ON bhai_api_keys(account_id,created_at DESC)");
}
function makeKey(){
 return "bhai_live_"+crypto.randomBytes(32).toString("base64url");
}
function cleanScopes(input){
 const a=Array.isArray(input)?input.map(String).filter(x=>scopes.includes(x)):[];
 return [...new Set(a)];
}
export async function validateApiKey(raw,requiredScope=""){
 const db=await getDb();if(!db||!raw)return null;
 await schema(db);
 const r=await db.query("SELECT id,account_id,name,scopes,status FROM bhai_api_keys WHERE key_hash=$1 AND status='active'",[hash(raw)]);
 const k=r.rows[0];if(!k)return null;
 const allowed=Array.isArray(k.scopes)?k.scopes:JSON.parse(k.scopes||"[]");
 if(requiredScope&&!(allowed.includes(requiredScope)))return null;
 await db.query("UPDATE bhai_api_keys SET usage_count=usage_count+1,last_used_at=NOW() WHERE id=$1",[k.id]);
 return {...k,scopes:allowed};
}
export default async function handler(req,res){
 await initDb().catch(()=>false);
 const db=await getDb();if(!db)return json(res,503,{error:"DATABASE_URL is required"});
 await schema(db);
 const account=await getSession(req,db);if(!account)return json(res,401,{error:"Login required"});
 if(req.method==="GET"){
  const r=await db.query("SELECT id,name,key_prefix,scopes,status,usage_count,last_used_at,created_at,revoked_at FROM bhai_api_keys WHERE account_id=$1 ORDER BY created_at DESC",[account.id]);
  return json(res,200,{ok:true,keys:r.rows});
 }
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const action=String(req.body?.action||"");
 if(action==="create"){
  const name=String(req.body?.name||"My App").trim().slice(0,80);
  const selected=cleanScopes(req.body?.scopes);
  if(!name)return json(res,400,{error:"Key name is required"});
  if(!selected.length)return json(res,400,{error:"Select at least one permission"});
  const key=makeKey(),id=crypto.randomUUID();
  await db.query("INSERT INTO bhai_api_keys(id,account_id,name,key_prefix,key_hash,scopes) VALUES($1,$2,$3,$4,$5,$6)",[id,account.id,name,key.slice(0,16),hash(key),JSON.stringify(selected)]);
  return json(res,201,{ok:true,key,id,name,scopes:selected});
 }
 if(action==="revoke"||action==="regenerate"){
  const id=String(req.body?.id||"");
  const existing=await db.query("SELECT id,name,scopes,status FROM bhai_api_keys WHERE id=$1 AND account_id=$2",[id,account.id]);
  const k=existing.rows[0];if(!k)return json(res,404,{error:"API key not found"});
  if(action==="revoke"){
   await db.query("UPDATE bhai_api_keys SET status='revoked',revoked_at=NOW() WHERE id=$1",[id]);
   return json(res,200,{ok:true,status:"revoked"});
  }
  const key=makeKey();
  await db.query("UPDATE bhai_api_keys SET key_prefix=$1,key_hash=$2,status='active',revoked_at=NULL,created_at=NOW(),usage_count=0,last_used_at=NULL WHERE id=$3",[key.slice(0,16),hash(key),id]);
  return json(res,200,{ok:true,key,id,scopes:k.scopes});
 }
 return json(res,400,{error:"Unsupported API key action"});
}
