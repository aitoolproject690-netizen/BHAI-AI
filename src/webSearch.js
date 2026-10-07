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
      const html=await fetchSearch(provider.build(q),"BHAI-X/1.0");
      const results=provider.parse(html).filter(x=>x.url&&x.title);
      if(results.length) return results;
      errors.push(provider.id+": no usable results");
    } catch(error) {
      errors.push(provider.id+": "+String(error?.message||error).slice(0,180));
    }
  }
  throw new Error("All web search providers failed: "+errors.join(" | "));
}

export const __test={parseDuckDuckGo,parseBing,parseGoogle};
