import crypto from "node:crypto";

export function createRequestId(){
 return crypto.randomUUID();
}

export function attachRequestId(res,requestId){
 const id=String(requestId||createRequestId());
 res.__bhaiRequestId=id;
 if(!res.headersSent) res.setHeader("X-BHAI-Request-ID",id);
 return id;
}

export function sendJson(res,status,data){
 try{
  if(res.headersSent) return false;
  if(!res.__bhaiRequestId) attachRequestId(res);
  const payload=data&&typeof data==="object" ? {...data,requestId:data.requestId||res.__bhaiRequestId} : {data,requestId:res.__bhaiRequestId};
  const body=JSON.stringify(payload);
  res.statusCode=status;
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Length",String(Buffer.byteLength(body)));
  res.end(body);
  return true;
 }catch(error){
  try{
   if(!res.headersSent){
    const fallback=JSON.stringify({error:"Response serialization failed.",requestId:res.__bhaiRequestId||createRequestId()});
    res.statusCode=500;
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Content-Length",String(Buffer.byteLength(fallback)));
    res.end(fallback);
    return true;
   }
  }catch{}
  console.error("[ResponseGuard] failed to send JSON:",error);
  return false;
 }
}

export function sendError(res,status,error,extra={}){
 const message=String(error?.message||error||"Unknown server error").slice(0,1000);
 return sendJson(res,status,{error:message,...extra});
}

export function wrapApiHandler(handler){
 return async function guardedApiHandler(req,res){
  try{return await handler(req,res);}
  catch(error){
   console.error("[ResponseGuard]",req.method,req.url,res.__bhaiRequestId,error);
   return sendError(res,500,error,{requestId:res.__bhaiRequestId});
  }
 };
}
