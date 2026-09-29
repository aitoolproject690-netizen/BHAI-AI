import {getDb,initDb} from "./db.js";
const memory=new Map();
let ready=null;
const boot=()=>ready||(ready=initDb().catch(()=>false));
export default async function handler(req,res){
 await boot();
 const key=String(req.query?.key||req.body?.key||"default");
 const db=await getDb();
 if(req.method==="GET"){
  if(db){const r=await db.query("SELECT data FROM bhai_memory WHERE key=$1",[key]);return res.json({ok:true,key,data:r.rows[0]?.data||{}})}
  return res.json({ok:true,key,data:memory.get(key)||{},persistent:false});
 }
 if(req.method!=="POST")return res.status(405).json({error:"Method not allowed"});
 const data=req.body?.data;
 if(data===undefined)return res.status(400).json({error:"data is required"});
 if(db)await db.query("INSERT INTO bhai_memory(key,data,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",[key,data]);
 else memory.set(key,data);
 return res.json({ok:true,key,data,persistent:!!db});
}