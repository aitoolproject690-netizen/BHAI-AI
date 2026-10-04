const API_BASE="https://bhai-ai-vpna.onrender.com";

export const apiUrl=(path)=>API_BASE+path;

function requestId(){
 try{return crypto.randomUUID();}catch{return "bhai-"+Date.now()+"-"+Math.random().toString(36).slice(2);}
}

export async function readJsonResponse(response,label="Backend"){
 const raw=await response.text();
 const requestId=response.headers?.get?.("x-bhai-request-id")||"";
 if(!raw.trim()){
  const err=new Error(label+" returned an empty response (HTTP "+response.status+")"+(requestId?"; requestId="+requestId:"")+"." );
  err.requestId=requestId; err.status=response.status; err.empty=true; throw err;
 }
 let data;
 try{data=JSON.parse(raw);}
 catch{
  const preview=raw.replace(/\s+/g," ").slice(0,220);
  const err=new Error(label+" returned invalid JSON (HTTP "+response.status+")"+(requestId?"; requestId="+requestId:"")+": "+preview);
  err.requestId=requestId; err.status=response.status; throw err;
 }
 if(requestId&&!data?.requestId) data.requestId=requestId;
 return data;
}

export async function requestJson(path,options={},config={}){
 const {label=path,retries=1,retrySafe=false,retryStatuses=[502,503,504],retryDelayMs=700}=config;
 const headers={...(options.headers||{}),"X-BHAI-Request-ID":options.headers?.["X-BHAI-Request-ID"]||requestId()};
 let lastError;
 for(let attempt=0;attempt<=retries;attempt++){
  try{
   const response=await fetch(apiUrl(path),{...options,headers});
   try{
    const data=await readJsonResponse(response,label);
    if(!response.ok||data?.error){
     const err=new Error(data?.error||(`\${label} failed with HTTP \${response.status}`));
     err.status=response.status; err.requestId=data?.requestId||response.headers?.get?.("x-bhai-request-id")||headers["X-BHAI-Request-ID"]; err.data=data;
     if(retrySafe&&attempt<retries&&retryStatuses.includes(response.status)){await new Promise(r=>setTimeout(r,retryDelayMs*(attempt+1)));continue;}
     throw err;
    }
    return data;
   }catch(error){
    lastError=error;
    const canRetry=retrySafe&&attempt<retries&&(error?.empty||retryStatuses.includes(error?.status)||/fetch|network|timeout/i.test(String(error?.message||"")));
    if(!canRetry)throw error;
    await new Promise(r=>setTimeout(r,retryDelayMs*(attempt+1)));
   }
  }catch(error){
   lastError=error;
   const canRetry=retrySafe&&attempt<retries&&(error?.empty||retryStatuses.includes(error?.status)||/fetch|network|timeout/i.test(String(error?.message||"")));
   if(!canRetry)throw error;
   await new Promise(r=>setTimeout(r,retryDelayMs*(attempt+1)));
  }
 }
 throw lastError||new Error(label+" failed.");
}
