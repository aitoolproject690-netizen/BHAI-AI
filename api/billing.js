import crypto from "node:crypto";
import {getDb,initDb} from "./db.js";

const json=(res,s,d)=>res.status(s).json(d);
const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");

const PLANS={
 pro_monthly:{name:"BHAI X Pro",amount:Number(process.env.BHAI_PRO_MONTHLY||199),days:30},
 pro_quarterly:{name:"BHAI X Pro 3 Months",amount:Number(process.env.BHAI_PRO_QUARTERLY||499),days:90},
 pro_yearly:{name:"BHAI X Pro Yearly",amount:Number(process.env.BHAI_PRO_YEARLY||1499),days:365}
};

async function schema(db){
 await db.query("CREATE TABLE IF NOT EXISTS bhai_subscriptions (id TEXT PRIMARY KEY,account_id TEXT NOT NULL,plan_id TEXT NOT NULL,plan_name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',amount INTEGER NOT NULL,provider TEXT NOT NULL DEFAULT 'razorpay',provider_order_id TEXT UNIQUE,payment_id TEXT,started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL)");
 await db.query("CREATE INDEX IF NOT EXISTS bhai_subscriptions_account_idx ON bhai_subscriptions(account_id,expires_at DESC)");
}

async function session(req,db){
 const t=String(req.headers?.authorization||"").replace(/^Bearer\s+/i,"").trim();
 if(!t)return null;
 const r=await db.query("SELECT a.id,a.email,a.role,a.credits,a.blocked FROM bhai_sessions s JOIN bhai_accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>NOW()",[hash(t)]);
 const a=r.rows[0]; return a&&!a.blocked?a:null;
}

function planFor(id){return PLANS[String(id)]||null;}

export default async function handler(req,res){
 await initDb().catch(()=>false); const db=await getDb();
 if(!db)return json(res,503,{error:"DATABASE_URL is required"}); await schema(db);
 const a=await session(req,db); if(!a)return json(res,401,{error:"Login required"});

 if(req.method==="GET"){
  if(req.query?.plans==="1")return json(res,200,{ok:true,plans:Object.entries(PLANS).map(([id,p])=>({id,...p}))});
  const r=await db.query("SELECT id,plan_id,plan_name,status,amount,provider,provider_order_id,payment_id,started_at,expires_at FROM bhai_subscriptions WHERE account_id=$1 ORDER BY expires_at DESC LIMIT 10",[a.id]);
  const active=r.rows.find(x=>x.status==="active"&&new Date(x.expires_at)>new Date())||null;
  return json(res,200,{ok:true,active,subscriptions:r.rows});
 }

 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const action=String(req.body?.action||"");

 if(action==="create_order"){
  const plan=planFor(req.body?.planId); if(!plan)return json(res,400,{error:"Invalid plan"});
  const key=process.env.RAZORPAY_KEY_ID,secret=process.env.RAZORPAY_KEY_SECRET;
  if(!key||!secret)return json(res,503,{error:"Payment gateway is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Render."});
  const receipt=("bhai_"+a.id+"_"+Date.now()).slice(0,40);
  const auth=Buffer.from(key+":"+secret).toString("base64");
  const rr=await fetch("https://api.razorpay.com/v1/orders",{method:"POST",headers:{"Authorization":"Basic "+auth,"Content-Type":"application/json"},body:JSON.stringify({amount:Math.round(plan.amount*100),currency:"INR",receipt,notes:{account_id:a.id,plan_id:req.body?.planId}})});
  const d=await rr.json().catch(()=>({}));
  if(!rr.ok)return json(res,502,{error:d.error?.description||"Could not create payment order"});
  return json(res,200,{ok:true,keyId:key,order:d,plan});
 }

 if(action==="verify"){
  const {razorpay_order_id,razorpay_payment_id,razorpay_signature,planId}=req.body||{};
  const plan=planFor(planId); if(!plan||!razorpay_order_id||!razorpay_payment_id||!razorpay_signature)return json(res,400,{error:"Payment verification data is incomplete"});
  const secret=process.env.RAZORPAY_KEY_SECRET; if(!secret)return json(res,503,{error:"Payment gateway is not configured"});
  const expected=crypto.createHmac("sha256",secret).update(String(razorpay_order_id)+"|"+String(razorpay_payment_id)).digest("hex");
  const ok=expected.length===String(razorpay_signature).length&&crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(razorpay_signature)));
  if(!ok)return json(res,400,{error:"Payment signature verification failed"});
  const existing=await db.query("SELECT id FROM bhai_subscriptions WHERE provider_order_id=$1",[razorpay_order_id]);
  if(existing.rows[0])return json(res,200,{ok:true,alreadyActivated:true});
  const current=await db.query("SELECT expires_at FROM bhai_subscriptions WHERE account_id=$1 AND status='active' AND expires_at>NOW() ORDER BY expires_at DESC LIMIT 1",[a.id]);
  const start=current.rows[0]?new Date(current.rows[0].expires_at):new Date();
  const expiry=new Date(start.getTime()+plan.days*86400000);
  const id=crypto.randomUUID();
  await db.query("INSERT INTO bhai_subscriptions(id,account_id,plan_id,plan_name,status,amount,provider,provider_order_id,payment_id,started_at,expires_at) VALUES($1,$2,$3,$4,'active',$5,'razorpay',$6,$7,$8,$9)",[id,a.id,planId,plan.name,plan.amount,razorpay_order_id,razorpay_payment_id,start,expiry]);
  return json(res,200,{ok:true,subscription:{id,plan_id:planId,plan_name:plan.name,status:"active",expires_at:expiry}});
 }

 return json(res,400,{error:"Unsupported billing action"});
}
