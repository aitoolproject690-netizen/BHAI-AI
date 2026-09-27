export default async function handler(req,res){
  if(req.method!=="GET"&&req.method!=="POST") return res.status(405).json({error:"Method not allowed"});
  const q=req.method==="GET"?req.query?.q:req.body?.q;
  if(!q||String(q).trim().length<2) return res.status(400).json({error:"Search query is required"});
  try{
    const url="https://html.duckduckgo.com/html/?q="+encodeURIComponent(String(q).trim());
    const r=await fetch(url,{headers:{"User-Agent":"Mozilla/5.0 BHAI-AI/1.0"}});
    const html=await r.text();
    if(!r.ok) return res.status(502).json({error:"Search provider failed"});
    const results=[];
    const blocks=html.match(/<div class="result[^]*?<\/div>\s*<\/div>/g)||[];
    for(const block of blocks.slice(0,8)){
      const m=block.match(/<a rel="nofollow" class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/);
      if(!m) continue;
      const title=m[2].replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
      const href=m[1].replace(/&amp;/g,"&");
      const sm=block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet=(sm?sm[1]:"").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").replace(/&#x27;/g,"'").trim();
      if(title&&href) results.push({title,url:href,snippet});
    }
    return res.status(200).json({query:String(q),results});
  }catch(e){return res.status(500).json({error:e?.message||"Search error"});}
}