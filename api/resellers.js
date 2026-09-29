import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";
const json=(res,s,d)=>res.status(s).json(d);
const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
function ownerOk(req){const e=process.env.OWNER_ACCESS_KEY,s=req.headers?.["x-owner-key"]||req.body?.ownerKey||"";if(!e||!s)return false;const a=Buffer.from(String(e)),b=Buffer.from(String(s));return a.length===b.length&&crypto.timingSafeEqual(a,b);}
export default async function handler(req,res){
 if(!ownerOk(req))return json(res,401,{error:"Owner authorization required."});
 await initDb().catch(()=>false);const db=await getDb();if(!db)return json(res,503,{error:"DATABASE_URL is required"});
 await db.query("CREATE TABLE IF NOT EXISTS bhai_resellers (id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,balance INTEGER NOT NULL DEFAULT 0,blocked BOOLEAN NOT NULL DEFAULT FALSE,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 await db.query("CREATE TABLE IF NOT EXISTS bhai_reseller_ledger (id TEXT PRIMARY KEY,reseller_id TEXT NOT NULL,amount INTEGER NOT NULL,reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
 if(req.method==="GET"){const r=await db.query("SELECT id,email,balance,blocked,created_at FROM bhai_resellers ORDER BY created_at DESC");return json(res,200,{ok:true,resellers:r.rows});}
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const a=String(req.body?.action||"");
 if(a==="create"){const email=String(req.body?.email||"").trim().toLowerCase(),password=String(req.body?.password||"");if(!email||password.length<8)return json(res,400,{error:"email and password(8+) required"});try{const id=crypto.randomUUID();await db.query("INSERT INTO bhai_resellers(id,email,password_hash) VALUES($1,$2,$3)",[id,email,hash(password)]);return json(res,201,{ok:true,reseller:{id,email,balance:0,blocked:false}})}catch{return json(res,409,{error:"Reseller already exists"})}}
 if(a==="block"){const id=String(req.body?.id||"");await db.query("UPDATE bhai_resellers SET blocked=NOT blocked WHERE id=$1",[id]);return json(res,200,{ok:true,id});}
 if(a==="balance"){const id=String(req.body?.id||""),amount=Number(req.body?.amount);if(!id||!Number.isInteger(amount)||amount===0)return json(res,400,{error:"id and non-zero integer amount required"});const r=await db.query("UPDATE bhai_resellers SET balance=GREATEST(balance+$2,0) WHERE id=$1 RETURNING balance",[id,amount]);if(!r.rows[0])return json(res,404,{error:"Reseller not found"});await db.query("INSERT INTO bhai_reseller_ledger(id,reseller_id,amount,reason) VALUES($1,$2,$3,$4)",[crypto.randomUUID(),id,amount,String(req.body?.reason||"owner adjustment")]);return json(res,200,{ok:true,id,balance:r.rows[0].balance});}
 if(a==="ledger"){const id=String(req.body?.id||"");const r=await db.query("SELECT id,amount,reason,created_at FROM bhai_reseller_ledger WHERE reseller_id=$1 ORDER BY created_at DESC LIMIT 100",[id]);return json(res,200,{ok:true,ledger:r.rows});}
 return json(res,400,{error:"Unknown reseller action"});
}