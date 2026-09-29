const json=(res,s,d)=>res.status(s).json(d);
async function check(url){try{const r=await fetch(url,{signal:AbortSignal.timeout(5000)});return{ok:r.ok,status:r.status};}catch(e){return{ok:false,error:e.message};}}
export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 const base=String(req.body?.url||"").replace(/\/$/,""); if(!base)return json(res,400,{error:"url is required"});
 const checks=[{name:"root",...(await check(base+"/"))},{name:"health",...(await check(base+"/api/health"))},{name:"capabilities",...(await check(base+"/api/capabilities"))},{name:"system",...(await check(base+"/api/system"))}];
 return json(res,200,{ok:checks.every(x=>x.ok),checks,verifiedAt:new Date().toISOString()});
}