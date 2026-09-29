import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";
const json=(res,s,d)=>res.status(s).json(d);
const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
function ownerOk(req){const expected=process.env.OWNER_ACCESS_KEY,supplied=req.headers?.["x-owner-key"]||req.body?.ownerKey||"";if(!expected||!supplied)return false;const a=Buffer.from(String(expected)),b=Buffer.from(String(supplied));return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export default async function handler(req,res){
 await initDb().catch(()=>false);const db=await getDb();if(!db)return json(res,503,{error:"DATABASE_URL is required"});
 await db.query("CREATE TABLE IF NOT EXISTS bhai_accounts (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',credits INTEGER NOT NULL DEFAULT 0,blocked BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await db.query("CREATE TABLE IF NOT EXISTS bhai_credit_ledger (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 if(req.method==="POST"){
  const action=String(req.body?.action||"");
  if(action==="register"){const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");if(!email||password.length<8)return json(res,400,{error:"email and password(8+) required"});const id=crypto.randomUUID();try{await db.query("INSERT INTO bhai_accounts(id,email,password_hash) VALUES($1,$2,$3)",[id,email,hash(password)]);}catch(e){return json(res,409,{error:"Account already exists"});}return json(res,201,{ok:true,account:{id,email,role:"user",credits:0}});}
  if(action==="login"){const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");const r=await db.query("SELECT id,email,role,credits,blocked FROM bhai_accounts WHERE email=$1 AND password_hash=$2",[email,hash(password)]);const a=r.rows[0];if(!a||a.blocked)return json(res,401,{error:"Invalid or blocked account"});return json(res,200,{ok:true,account:a,session:crypto.randomUUID()});}
  if(action==="credit"){if(!ownerOk(req))return json(res,401,{error:"Owner authorization required."});const id=String(req.body?.accountId||""),amount=Number(req.body?.amount);if(!id||!Number.isInteger(amount)||amount===0)return json(res,400,{error:"accountId and non-zero integer amount required"});await db.query("UPDATE bhai_accounts SET credits=GREATEST(credits+$2,0) WHERE id=$1",[id,amount]);await db.query("INSERT INTO bhai_credit_ledger(id,account_id,amount,reason) VALUES($1,$2,$3,$4)",[crypto.randomUUID(),id,amount,String(req.body?.reason||"admin adjustment")]);return json(res,200,{ok:true,accountId:id,amount});}
 }
 if(req.method==="GET"){const role=String(req.query?.role||"");if(role==="admin"){if(!ownerOk(req))return json(res,401,{error:"Owner authorization required."});const r=await db.query("SELECT id,email,role,credits,blocked,created_at FROM bhai_accounts ORDER BY created_at DESC LIMIT 200");return json(res,200,{ok:true,accounts:r.rows});}return json(res,400,{error:"role=admin required"});}
 return json(res,405,{error:"Method not allowed"});
}