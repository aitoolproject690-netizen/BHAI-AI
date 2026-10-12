const clean=(value,max=4000)=>String(value??"").trim().slice(0,max);

function imageSignature(bytes,mimeType){
 const mime=String(mimeType||"").split(";")[0].toLowerCase();
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes.length>=4&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[bytes.length-2]===0xff&&bytes[bytes.length-1]===0xd9;
 const webp=bytes.length>=12&&bytes.subarray(0,4).toString("ascii")==="RIFF"&&bytes.subarray(8,12).toString("ascii")==="WEBP";
 return (mime==="image/png"&&png)||(mime==="image/jpeg"&&jpeg)||(mime==="image/webp"&&webp);
}

/**
 * Uses only BHAI-CORE's scoped private ComfyUI GPU bridge.
 * Never falls back to /v1/image/generate with provider=mobile/Local Dream.
 */
export async function generateImageViaBhAiCore(prompt,aspectRatio="16:9",options={}){
 const env=options.env||process.env;
 const fetchImpl=options.fetchImpl||globalThis.fetch;
 const internalKey=clean(env.BHAI_CORE_INTERNAL_IMAGE_KEY||"",2000);
 if(!internalKey)return null;
 if(typeof fetchImpl!=="function")throw new Error("Fetch is unavailable for BHAI-CORE self-hosted GPU image generation.");
 const coreUrl=clean(env.BHAI_CORE_URL||"https://bhai-core.onrender.com",2000).replace(/\/+$/,"");
 let parsed;
 try{parsed=new URL(coreUrl);}catch{throw new Error("BHAI_CORE_URL must be a valid URL.");}
 if(!["http:","https:"].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error("BHAI_CORE_URL must use HTTP(S) without embedded credentials.");
 const width=aspectRatio==="9:16"?576:aspectRatio==="1:1"?768:aspectRatio==="4:5"?640:768;
 const height=aspectRatio==="9:16"?1024:aspectRatio==="1:1"?768:aspectRatio==="4:5"?800:432;
 const response=await fetchImpl(coreUrl+"/v1/internal/image/generate",{
  method:"POST",
  headers:{"content-type":"application/json","x-bhai-internal-key":internalKey},
  body:JSON.stringify({prompt:clean(prompt),aspectRatio,width,height}),
  signal:AbortSignal.timeout(Number(options.timeoutMs)>0?Number(options.timeoutMs):180000)
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error("BHAI-CORE self-hosted GPU image returned HTTP "+response.status+" — "+clean(body?.error||body?.message||"unknown",500));
 if(body?.ok!==true||body?.verification?.ok!==true||typeof body?.data!=="string"||!body.data)throw new Error("BHAI-CORE self-hosted GPU image returned no verified image data.");
 const bytes=Buffer.from(body.data,"base64");
 if(!bytes.length||bytes.length>12*1024*1024)throw new Error("BHAI-CORE self-hosted GPU image is empty or exceeds 12 MB.");
 const mimeType=clean(body.mimeType||"image/png",100).split(";")[0].toLowerCase();
 if(!imageSignature(bytes,mimeType))throw new Error("BHAI-CORE self-hosted GPU image failed image signature verification.");
 return {
  mimeType,data:body.data,provider:"bhai-core-comfyui-gpu",local:true,
  seed:Number.isInteger(body.seed)?body.seed:null,
  width:Number(body.width)||width,height:Number(body.height)||height,
  generationTimeMs:Number(body.generationTimeMs)||null
 };
}
