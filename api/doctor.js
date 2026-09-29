import {getDb,initDb} from "./db.js";
import {requireSession} from "./_utils.js";
const json=(res,s,d)=>res.status(s).json(d);
async function check(url,name){try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});return{name,ok:r.ok,status:r.status};}catch(e){return{name,ok:false,error:String(e.message||e)}}}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;
 const base=String(req.body?.url||"").replace(/\/$/,""); const checks=[];
 if(base)checks.push(await check(base+"/api/health","backend"));
 checks.push({name:"node",ok:Number(process.versions.node.split(".")[0])>=20});
 checks.push({name:"ai-key",ok:!!(process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY)});
 checks.push({name:"database",ok:!!process.env.DATABASE_URL});
 if(process.env.DATABASE_URL){try{await initDb();const db=await getDb();checks.push({name:"database-connection",ok:!!db});}catch(e){checks.push({name:"database-connection",ok:false,error:e.message})}}
 return json(res,200,{ok:checks.every(x=>x.ok),checks,fixes:checks.filter(x=>!x.ok).map(x=>"Investigate "+x.name),verifiedAt:new Date().toISOString()});
}