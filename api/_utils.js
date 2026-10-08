import {getDb,initDb} from "./db.js";
import {getSession,getAccountById} from "./accounts.js";
import {isInternalRequest} from "./internalAuth.js";
import {validateApiKey} from "./apiKeys.js";
import {sendJson} from "./responseGuard.js";
export function json(res,status,data){return sendJson(res,status,data);}
export async function requireSession(req,res){
 await initDb().catch(()=>false);
 const db=await getDb();
 if(!db){json(res,503,{error:"DATABASE_URL is required"});return null;}
 if(isInternalRequest(req)){
  const internalAccount=await getAccountById(req.headers["x-bhai-account-id"],db);
  if(internalAccount)return internalAccount;
 }
 const account=await getSession(req,db);
 if(account)return account;const raw=String(req.headers?.authorization||"").replace(/^Bearer\\s+/i,"").trim();if(raw.startsWith("bhai_live_")){const key=await validateApiKey(raw);if(key)return {id:key.account_id,role:"api",apiKeyId:key.id,apiKeyName:key.name,scopes:key.scopes};}json(res,401,{error:"Login required or valid BHAI-X API key required."});return null;}