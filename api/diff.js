import crypto from "node:crypto";\nimport {requireSession} from "./_utils.js";
import {getDb,initDb} from "./db.js";
const json=(res,s,d)=>res.status(s).json(d);
export default async function handler(req,res){
 await initDb().catch(()=>false);
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const account=await requireSession(req,res);if(!account)return;
 const db=await getDb(); const item={id:crypto.randomUUID(),type:String(req.body?.type||"change"),summary:String(req.body?.summary||""),files:Array.isArray(req.body?.files)?req.body.files:[],commit:req.body?.commit||null,verification:req.body?.verification||null,createdAt:new Date().toISOString()};
 if(db)await db.query("INSERT INTO bhai_history(id,data,created_at) VALUES($1,$2,NOW()) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",[item.id,item]);
 return json(res,200,{ok:true,item,persistent:!!db});
}