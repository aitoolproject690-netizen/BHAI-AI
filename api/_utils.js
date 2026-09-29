import {getDb,initDb} from "./db.js";
import {getSession} from "./accounts.js";
export function json(res,status,data){res.statusCode=status;res.setHeader("Content-Type","application/json; charset=utf-8");res.end(JSON.stringify(data));}
export async function requireSession(req,res){await initDb().catch(()=>false);const db=await getDb();if(!db){json(res,503,{error:"DATABASE_URL is required"});return null;}const account=await getSession(req,db);if(!account){json(res,401,{error:"Login required. Open Account and login before using this feature."});return null;}return account;}