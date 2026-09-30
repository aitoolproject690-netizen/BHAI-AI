import {getAIProviderStatus,getConfiguredAIProviders} from "./aiRouter.js";
import {getSession} from "./accounts.js";
import {getDb} from "./db.js";

const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
  if(req.method!=="GET")return json(res,405,{error:"Method not allowed"});
  const db=await getDb();
  const account=db?await getSession(req,db):null;
  if(!account)return json(res,401,{error:"Login required. Open Account and login before viewing AI provider status."});
  const providers=getAIProviderStatus();
  return json(res,200,{
    ok:true,
    providers,
    configured:getConfiguredAIProviders(),
    routing:{
      primary:"gemini -> openai -> huggingface -> anthropic",
      reviewer:"openai -> anthropic -> huggingface -> gemini",
      fallback:true,
      note:"Routing uses server-side credentials. API keys are never returned to the client."
    }
  });
}
