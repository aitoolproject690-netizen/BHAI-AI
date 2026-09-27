async function search(q){
  const r=await fetch("https://html.duckduckgo.com/html/?q="+encodeURIComponent(String(q).trim()),{headers:{"User-Agent":"Mozilla/5.0 BHAI-AI/1.0"}});
  const html=await r.text(); if(!r.ok) throw new Error("Search provider failed");
  const results=[]; const re=/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/g; let m;
  while((m=re.exec(html))&&results.length<8){
    const title=m[2].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
    const url=m[1].replace(/&amp;/g,"&"); if(title&&url) results.push({title,url});
  }
  return results;
}
export default async function handler(req,res){
  if(req.method!=="GET"&&req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const q=req.method==="GET"?req.query?.q:req.body?.q;
  if(!q||String(q).trim().length<2) return res.status(400).json({error:"Search query is required"});
  try{return res.status(200).json({query:String(q),results:await search(q)});}catch(e){return res.status(502).json({error:e.message||"Search error"});}
}
