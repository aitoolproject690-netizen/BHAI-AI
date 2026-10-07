/**
 * BHAI X public web-search adapter.
 *
 * Render may intermittently fail to reach one search host, so this helper
 * tries independent public search endpoints and returns normalized evidence.
 * It never fabricates a result: if every provider fails, it throws.
 */

const SEARCH_TIMEOUT_MS = 9000;

function stripTags(value="") {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ");
}

function decodeHtml(value="") {
  return String(value)
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;/gi,'"')
    .replace(/&#x27;|&#39;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/\s+/g," ")
    .trim();
}

function cleanText(value="") {
  return decodeHtml(stripTags(value)).replace(/^[\s–—-]+|[\s–—-]+$/g,"").trim();
}

function absoluteUrl(href,baseUrl) {
  try { return new URL(href,baseUrl).href; } catch { return ""; }
}

function parseDuckDuckGo(html) {
  const out=[];
  const re=/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))&&out.length<8) {
    const title=cleanText(m[2]);
    const url=absoluteUrl(m[1],"https://html.duckduckgo.com");
    const block=html.slice(m.index,Math.min(html.length,m.index+7000));
    const sm=block.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
    const snippet=cleanText(sm?.[1]||"");
    if(title&&url) out.push({title,url,snippet});
  }
  return out;
}

function parseBing(html) {
  const out=[];
  const blocks=html.match(/<li[^>]*class=["'][^"']*b_algo[^"']*["'][^>]*>[\s\S]*?<\/li>/gi)||[];
  for(const block of blocks) {
    if(out.length>=8) break;
    const m=block.match(/<h2[^>]*>\s*<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);
    if(!m) continue;
    const title=cleanText(m[2]);
    const url=absoluteUrl(m[1],"https://www.bing.com");
    const sm=block.match(/class=["'][^"']*b_caption[^"']*["'][^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet=cleanText(sm?.[1]||"");
    if(title&&url) out.push({title,url,snippet});
  }
  return out;
}

function parseGoogle(html) {
  const out=[];
  const seen=new Set();
  const re=/<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi;
  let m;
  while((m=re.exec(html))&&out.length<8) {
    let raw=m[1];
    if(raw.startsWith("/url?")) {
      try { raw=new URL(raw,"https://www.google.com").searchParams.get("q")||raw; } catch {}
    }
    const url=absoluteUrl(raw,"https://www.google.com");
    if(!url || /^(?:https?:\/\/)?(?:www\.)?google\./i.test(url)) continue;
    const title=cleanText(m[2]);
    if(!title || seen.has(url)) continue;
    seen.add(url);
    const block=html.slice(m.index,Math.min(html.length,m.index+7000));
    const snippet=cleanText(block.match(/<div[^>]*>([^<]{40,500})<\/div>/i)?.[1]||"");
    out.push({title,url,snippet});
  }
  return out;
}


function buildSearchQueries(query) {
  const q=String(query||"").trim();
  const lower=q.toLowerCase();
  const queries=[q];
  if(/\b(petrol|gasoline|gas)\b/.test(lower) && /(what|contain|composition|chemical|consist|होता|होती|होते|क्या|संघटन|रासायनिक)/i.test(lower)) {
    queries.unshift(
      "gasoline chemical composition hydrocarbons paraffins naphthenes aromatics olefins additives ethanol",
      "gasoline composition hydrocarbons additives octane ethanol site:eia.gov",
      "gasoline fuel composition hydrocarbons additives ethanol site:epa.gov"
    );
  } else if(/\b(fiber|fibre)\b/.test(lower) && /(deficien|lack|effect|benefit|क्या|कमी|असर)/i.test(lower)) {
    queries.unshift(
      "dietary fiber deficiency effects constipation nutrition evidence",
      "dietary fiber health effects constipation site:niddk.nih.gov",
      "dietary fiber nutrition fact sheet site:ods.od.nih.gov"
    );
  }
  return [...new Set(queries)];
}

function relevanceScore(result, query) {
  const text=(String(result?.title||"")+" "+String(result?.snippet||"")).toLowerCase();
  const q=String(query||"").toLowerCase();
  const terms=q.split(/[^a-z0-9]+/).filter(x=>x.length>=4);
  const hits=terms.filter(t=>text.includes(t)).length;
  let score=hits;
  const petrolTopic=/\b(petrol|gasoline)\b/.test(q) && /(composition|chemical|contain|consist|संघटन|रासायनिक|क्या|होता)/i.test(q);
  const fiberTopic=/\b(fiber|fibre)\b/.test(q) && /(deficien|lack|effect|benefit|क्या|कमी|असर)/i.test(q);
  if(petrolTopic){
    if(/price|station|discount|fuel price|petrol pump|gas station/.test(text)) score-=8;
    const chemistryHits=["hydrocarbon","paraffin","alkane","naphthene","cycloalkane","aromatic","olefin","additive","ethanol","octane","composition"].filter(t=>text.includes(t)).length;
    score += Math.min(chemistryHits,4);
    if(chemistryHits===0) score-=6;
  }
  if(fiberTopic){
    if(/restaurant|recipe|price|menu/.test(text)) score-=8;
    const nutritionHits=["fiber","fibre","constipation","nutrition","diet","health"].filter(t=>text.includes(t)).length;
    score += Math.min(nutritionHits,3);
    if(nutritionHits===0) score-=5;
  }
  return score;
}

async function fetchSearch(url,userAgent) {
  const r=await fetch(url,{
    headers:{
      "User-Agent":userAgent,
      "Accept-Language":"en-US,en;q=0.8",
      "Accept":"text/html,application/xhtml+xml"
    },
    signal:AbortSignal.timeout(SEARCH_TIMEOUT_MS)
  });
  if(!r.ok) throw new Error("HTTP "+r.status);
  const html=await r.text();
  if(!html.trim()) throw new Error("empty response");
  return html;
}

const providers=[
  {id:"duckduckgo",build:q=>"https://html.duckduckgo.com/html/?q="+encodeURIComponent(q),parse:parseDuckDuckGo},
  {id:"bing",build:q=>"https://www.bing.com/search?q="+encodeURIComponent(q)+"&setlang=en-US",parse:parseBing},
  {id:"google",build:q=>"https://www.google.com/search?q="+encodeURIComponent(q)+"&hl=en",parse:parseGoogle}
];

export async function webSearch(query="") {
  const q=String(query||"").trim();
  if(!q) throw new Error("Search query is empty.");
  const errors=[];
  for(const provider of providers) {
    try {
      const candidates=[];
      for(const searchQuery of buildSearchQueries(q)) {
        const html=await fetchSearch(provider.build(searchQuery),"BHAI-X/1.0");
        candidates.push(...provider.parse(html).filter(x=>x.url&&x.title).map(x=>({...x,_score:relevanceScore(x,q)})));
      }
      const results=candidates
        .sort((a,b)=>(b._score||0)-(a._score||0))
        .filter(x=>(x._score||0)>0)
        .slice(0,8)
        .map(({_score,...x})=>x);
      if(results.length) return results;
      errors.push(provider.id+": no relevant results");
    } catch(error) {
      errors.push(provider.id+": "+String(error?.message||error).slice(0,180));
    }
  }
  throw new Error("All web search providers failed: "+errors.join(" | "));
}

export const __test={parseDuckDuckGo,parseBing,parseGoogle,buildSearchQueries,relevanceScore};
