      messages:chatMessages,
      preferred:"core",
      role:"coding",
      fallback:true
     });
     return json(res,200,{ok:true,text:String(coding?.text||"I could not generate a coding answer."),provider:coding.provider,backend_provider:coding.backend_provider||null,model:coding.model||null,verified:true});
    }catch(e){
     return json(res,502,{error:"Coding provider failed: "+String(e?.message||e)});
    }
   }

   // Stable knowledge questions must not be forced into web research.\n   // Only explicitly current/online requests enter the evidence lane; ordinary\n   // facts/explainers use the strongest general provider route instead.\n   if(canonicalRequest.lane==="current"){
    try{
     const results=await webSearch(task);
     const researchResults=filterResearchSources(task,results);
     if(!researchResults.length) throw new Error("No topic-relevant research evidence returned.");
     const evidence=researchResults.slice(0,6).map((x,index)=>"["+String(index+1)+"] "+String(x.title||"Source")+"\nURL: "+String(x.url||"")+"\nSummary: "+String(x.snippet||"")).join("\n\n");