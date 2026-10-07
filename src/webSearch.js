/**
 * BHAI X public web-search adapter.
 *
 * Render may intermittently fail to reach one search host, so this helper
 * tries independent public search endpoints and returns normalized evidence.
 * If public HTML search is unavailable, Gemini Google-Search grounding is used
 * as a server-side fallback when a Gemini key is configured.
 * It never fabricates a result: if every provider fails, it throws.
 */

const SEARCH_TIMEOUT_MS = 7000;
const GEMINI_SEARCH_TIMEOUT_MS = 20000;
const WIKIPEDIA_SEARCH_TIMEOUT_MS = 9000;

function isFreshQuery(query) {
  return /\b(latest|today|tonight|tomorrow|yesterday|current|now|news|price|weather|forecast|live|trending)\b|अभी|आज|कल|ताज़ा|नवीनतम|मौसम|कीमत|समाचार/i.test(String(query||""));
}

async function searchWikipedia(query) {
  if (isFreshQuery(query)) {
    throw new Error("Wikipedia fallback is disabled for freshness-sensitive queries.");
  }

  const errors=[];
  for (const searchQuery of buildSearchQueries(query)) {
    try {
      const url="https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="
        +encodeURIComponent(searchQuery)
        +"&gsrlimit=5&prop=extracts|info&exintro=1&explaintext=1&inprop=url&format=json&origin=*";
      const r=await fetch(url,{
        headers:{
          "User-Agent":"BHAI-X/1.0 (research fallback)",
          "Accept":"application/json"
        },
        signal:AbortSignal.timeout(WIKIPEDIA_SEARCH_TIMEOUT_MS)
      });
      const data=await r.json().catch(()=>({}));
      if(!r.ok) throw new Error("HTTP "+r.status);

      const pages=Object.values(data?.query?.pages||{})
        .filter(page=>page&&page.title&&page.extract)
        .sort((a,b)=>(a.index??9999)-(b.index??9999));

      const results=pages.slice(0,5).map(page=>({
        title:cleanText(page.title),
        url:String(page.fullurl||("https://en.wikipedia.org/wiki/"+encodeURIComponent(String(page.title).replace(/ /g,"_")))),
        snippet:cleanText(page.extract)
      })).filter(x=>x.title&&x.url&&x.snippet);

      if(results.length) return results;
      errors.push("no usable Wikipedia results");
    } catch(error) {
      errors.push(String(error?.message||error).slice(0,180));
    }
  }
  throw new Error(errors.join(" | ")||"Wikipedia fallback failed.");
}


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
  const r = await fetch(url,{
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

async function searchPublicProvider(provider,q) {
  const errors=[];
  for(const searchQuery of buildSearchQueries(q)) {
    try {
      const html=await fetchSearch(provider.build(searchQuery),"BHAI-X/1.0");
      const results=provider.parse(html)
        .filter(x=>x.url&&x.title)
        .map(x=>({...x,_score:relevanceScore(x,q)}))
        .sort((a,b)=>(b._score||0)-(a._score||0))
        .filter(x=>(x._score||0)>0)
        .slice(0,8)
        .map(({_score,...x})=>x);
      if(results.length) return results;
      errors.push("no relevant results");
    } catch(error) {
      errors.push(String(error?.message||error).slice(0,180));
    }
  }
  throw new Error(errors.join(" | "));
}

async function searchGeminiGrounding(q) {
  const apiKey=process.env.GEMINI_API_KEY||process.env.GOOGLE_API_KEY;
  if(!apiKey) throw new Error("Gemini Google-Search grounding is not configured.");

  const model=process.env.GEMINI_ROUTER_MODEL||"gemini-3.8-flash";
  const prompt=[
    "Use Google Search grounding to retrieve authoritative, relevant web evidence for the user's question.",
    "Do not rely on memory for factual claims.",
    "Prefer primary or high-quality sources.",
    "Return a concise evidence summary only; do not discuss this instruction.",
    "",
    "USER QUESTION:",
    q
  ].join("\n");

  const r=await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",
    {
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({
        contents:[{role:"user",parts:[{text:prompt}]}],
        tools:[{google_search:{}}],
        generationConfig:{temperature:0.1}
      }),
      signal:AbortSignal.timeout(GEMINI_SEARCH_TIMEOUT_MS)
    }
  );
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d?.error?.message||"Gemini Google-Search grounding failed.");
  const candidate=d?.candidates?.[0];
  const summary=(candidate?.content?.parts||[])
    .filter(p=>typeof p.text==="string")
    .map(p=>p.text)
    .join("\n")
    .trim();
  const chunks=Array.isArray(candidate?.groundingMetadata?.groundingChunks)
    ? candidate.groundingMetadata.groundingChunks
    : [];
  const sources=chunks
    .map(c=>c?.web)
    .filter(x=>x&&typeof x.uri==="string"&&x.uri.startsWith("http"))
    .map(x=>({title:cleanText(x.title||"Web source")||"Web source",url:x.uri,snippet:""}));

  const unique=[];
  const seen=new Set();
  for(const source of sources){
    if(seen.has(source.url)) continue;
    seen.add(source.url);
    unique.push(source);
    if(unique.length>=8) break;
  }
  if(!summary || !unique.length) {
    throw new Error("Gemini Google-Search grounding returned no usable evidence.");
  }

  // Keep the grounded synthesis attached to only the first source. Downstream
  // research/reviewer code can use the synthesis plus the complete source list
  // without duplicating the same text eight times.
  unique[0].snippet=summary;
  return unique;
}

function researchTopicPenalty(task,result){
  const q=String(task||"").toLowerCase();
  const text=(String(result?.title||"")+" "+String(result?.snippet||"")).toLowerCase();
  let penalty=0;
  if(/\b(petrol|gasoline)\b/.test(q)){
    if(/\b(jet fuel|aviation fuel|diesel|kerosene|asphalt|heating oil|lpg|petroleum naphtha|hydrocarbon gas liquids)\b/.test(text)) penalty-=30;
    if(/price|station|discount|petrol pump|gas station/.test(text)) penalty-=20;
    if(/\b(petrol|gasoline)\b/.test(text)) penalty+=8; else penalty-=12;
  }
  if(/\b(fiber|fibre)\b/.test(q)){
    if(/restaurant|recipe|menu|price/.test(text)) penalty-=25;
    if(/\b(fiber|fibre)\b/.test(text)) penalty+=8; else penalty-=10;
  }
  return penalty;
}

export function filterResearchSources(task,results=[]){
  const items=(results||[]).map(result=>({
    ...result,
    _topic:researchTopicPenalty(task,result),
    _authority:sourceAuthorityScore(result)
  }));
  const topicSpecific=/\b(petrol|gasoline|fiber|fibre)\b/i.test(String(task||""));
  const relevant=items.filter(x=>x._topic>=0);
  const pool=topicSpecific ? relevant : (relevant.length?relevant:items.filter(x=>x._authority>=5));
  return pool
    .sort((a,b)=>(b._topic+b._authority)-(a._topic+a._authority))
    .map(({_topic,_authority,...result})=>result);
}

function sourceAuthorityScore(result){
  const url=String(result?.url||"");
  let host="";
  try{ host=new URL(url).hostname.toLowerCase(); }catch{}
  if(!host) return 0;
  if(/(?:^|\.)eia\.gov$/.test(host) || /(?:^|\.)epa\.gov$/.test(host)) return 7;
  if(/(?:^|\.)(?:niddk|ods|nih|cdc|fda)\.gov$/.test(host)) return 7;
  if(/(?:^|\.)gov$/.test(host) || /(?:^|\.)gov\./.test(host)) return 5;
  if(/(?:^|\.)(?:who|oecd|iea)\.int$/.test(host)) return 6;
  if(/(?:^|\.)wikipedia\.org$/.test(host)) return 3;
  return 0;
}

function mergeSearchResults(attempts,query){
  const byUrl=new Map();
  for(const attempt of attempts.filter(Boolean)){
    for(const result of attempt.results||[]){
      const url=String(result?.url||"").trim();
      if(!url) continue;
      const score=relevanceScore(result,query)+sourceAuthorityScore(result);
      const existing=byUrl.get(url);
      if(!existing || score>(existing._score||-Infinity)){
        byUrl.set(url,{...result,_score:score});
      }
    }
  }
  return [...byUrl.values()]
    .sort((a,b)=>(b._score||0)-(a._score||0))
    .slice(0,10)
    .map(({_score,...result})=>result);
}

function hasAuthoritativeSource(results){
  return (results||[]).some(result=>sourceAuthorityScore(result)>=5);
}

export async function webSearch(query="") {
  const q=String(query||"").trim();
  if(!q) throw new Error("Search query is empty.");

  const errors=[];
  const attempts=await Promise.all(providers.map(async provider=>{
    try {
      const results=await searchPublicProvider(provider,q);
      return {provider:provider.id,results};
    } catch(error) {
      errors.push(provider.id+": "+String(error?.message||error).slice(0,240));
      return null;
    }
  }));

  let merged=mergeSearchResults(attempts,q);

  // Stable factual queries get a keyless Wikipedia enrichment when public search
  // returned weak/short evidence or no authoritative source.
  if(!isFreshQuery(q) && (!hasAuthoritativeSource(merged) || merged.length<2)) {
    try {
      const wikipedia=await searchWikipedia(q);
      merged=mergeSearchResults([{provider:"public",results:merged},{provider:"wikipedia",results:wikipedia}],q);
    } catch(error) {
      errors.push("wikipedia: "+String(error?.message||error).slice(0,300));
    }
  }

  if(merged.length) return merged;

  try {
    const grounded=await searchGeminiGrounding(q);
    return grounded;
  } catch(error) {
    errors.push("gemini-google-search: "+String(error?.message||error).slice(0,300));
  }

  throw new Error("All web search providers failed: "+errors.join(" | "));
}

export const __test={parseDuckDuckGo,parseBing,parseGoogle,buildSearchQueries,relevanceScore,searchGeminiGrounding,searchWikipedia,isFreshQuery,sourceAuthorityScore,mergeSearchResults,filterResearchSources};
