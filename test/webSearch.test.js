import test from "node:test";
import assert from "node:assert/strict";
import { __test, webSearch } from "../src/webSearch.js";

test("DuckDuckGo parser extracts normalized results",()=>{
  const html='<a rel="nofollow" class="result__a" href="https://example.com/petrol">Petrol basics</a><div class="result__snippet">Gasoline is a refined petroleum fuel.</div>';
  assert.deepEqual(__test.parseDuckDuckGo(html),[
    {title:"Petrol basics",url:"https://example.com/petrol",snippet:"Gasoline is a refined petroleum fuel."}
  ]);
});

test("Bing parser extracts result cards",()=>{
  const html='<li class="b_algo"><h2><a href="https://example.com/a">Fuel answer</a></h2><div class="b_caption"><p>Useful evidence.</p></div></li>';
  assert.deepEqual(__test.parseBing(html),[
    {title:"Fuel answer",url:"https://example.com/a",snippet:"Useful evidence."}
  ]);
});

test("Google parser skips Google-owned links",()=>{
  const html='<a href="/url?q=https://example.com/sky&sa=U"><h3>Why is the sky blue?</h3></a><a href="https://www.google.com/preferences"><h3>Preferences</h3></a>';
  const rows=__test.parseGoogle(html);
  assert.equal(rows.length,1);
  assert.equal(rows[0].url,"https://example.com/sky");
  assert.equal(rows[0].title,"Why is the sky blue?");
});

test("webSearch falls back when the first search host fails",async()=>{
  const original=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async(url)=>{
    const u=String(url); calls.push(u);
    if(u.includes("duckduckgo")) throw new Error("fetch failed");
    if(u.includes("bing.com/search")){
      return new Response('<li class="b_algo"><h2><a href="https://example.com/petrol">Petrol evidence</a></h2><div class="b_caption"><p>Gasoline is a refined petroleum product made of hydrocarbons and may contain additives.</p></div></li>',{status:200});
    }
    throw new Error("unexpected provider");
  };
  try{
    const rows=await webSearch("Petrol (gasoline) me kya hota hai?");
    assert.equal(rows[0].url,"https://example.com/petrol");
    assert.ok(calls.length>=2);
    assert.ok(calls.some(url=>String(url).includes("bing.com/search")));
  }finally{ globalThis.fetch=original; }
});

test("research source filter excludes unrelated fuel sources",()=>{
  const rows=__test.filterResearchSources("Petrol (gasoline) me kya hota hai?",[
    {title:"Gasoline",url:"https://en.wikipedia.org/wiki/Gasoline",snippet:"Gasoline is a mixture of hydrocarbons."},
    {title:"Jet fuel",url:"https://en.wikipedia.org/wiki/Jet_fuel",snippet:"Jet fuel is a mixture of hydrocarbons."},
    {title:"Aviation fuel",url:"https://en.wikipedia.org/wiki/Aviation_fuel",snippet:"Aviation fuel is used in aircraft."},
    {title:"EIA gasoline octane",url:"https://www.eia.gov/energyexplained/gasoline/octane-in-depth.php",snippet:"Gasoline octane rating and gasoline."},
    {title:"Hydrocarbon gas liquids",url:"https://www.eia.gov/energyexplained/hydrocarbon-gas-liquids/uses.php",snippet:"Hydrocarbon gas liquids have many uses."}
  ]);
  assert.ok(rows.some(x=>x.title==="Gasoline"));
  assert.ok(rows.some(x=>x.title==="EIA gasoline octane"));
  assert.ok(!rows.some(x=>/jet fuel|aviation fuel/i.test(x.title+" "+x.snippet)));
  assert.ok(!rows.some(x=>/hydrocarbon gas liquids/i.test(x.title)));
});

test("research query expansion targets petrol chemical composition instead of prices",()=>{
  const q=__test.buildSearchQueries("Petrol (गैसोलीन) में असल में क्या-क्या होता है?");
  assert.match(q[0],/gasoline chemical composition/i);
});

test("research relevance scoring penalizes petrol price and station results",()=>{
  const score=__test.relevanceScore({title:"Latest Petrol Price Comparison",snippet:"Petrol station prices and discounts"},"gasoline petrol chemical composition hydrocarbons");
  assert.ok(score<=0);
  const good=__test.relevanceScore({title:"Gasoline composition and hydrocarbons",snippet:"Gasoline is a mixture of hydrocarbons used as motor fuel"},"gasoline petrol chemical composition hydrocarbons");
  assert.ok(good>score);
});



test("webSearch uses Gemini Google Search grounding when public search is unavailable",async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  const calls=[];
  process.env.GEMINI_API_KEY="test-key";
  globalThis.fetch=async(url)=>{
    const u=String(url); calls.push(u);
    if(u.includes("generativelanguage.googleapis.com")){
      return new Response(JSON.stringify({
        candidates:[{
          content:{parts:[{text:"Grounded evidence summary: gasoline is a complex mixture of hydrocarbons and additives, with composition varying by formulation."}]},
          groundingMetadata:{
            groundingChunks:[
              {web:{uri:"https://www.eia.gov/energyexplained/gasoline/",title:"U.S. Energy Information Administration — Gasoline"}},
              {web:{uri:"https://www.epa.gov/gasoline-standards",title:"U.S. EPA — Gasoline Standards"}}
            ]
          }
        }]
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }
    if(u.includes("duckduckgo")||u.includes("bing.com/search")||u.includes("google.com/search")){
      return new Response("<html><body>no useful search results</body></html>",{status:200});
    }
    throw new Error("unexpected provider");
  };
  try{
    const rows=await webSearch("Petrol (गैसोलीन) में असल में क्या-क्या होता है?");
    assert.equal(rows.length,2);
    assert.equal(rows[0].url,"https://www.eia.gov/energyexplained/gasoline/");
    assert.match(rows[0].snippet,/Grounded evidence summary/i);
    assert.ok(calls.some(url=>String(url).includes("generativelanguage.googleapis.com")));
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});


test("webSearch uses keyless Wikipedia fallback for stable factual research",async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.GEMINI_API_KEY;
  const calls=[];
  delete process.env.GEMINI_API_KEY;
  globalThis.fetch=async(url)=>{
    const u=String(url); calls.push(u);
    if(u.includes("duckduckgo")||u.includes("bing.com/search")||u.includes("google.com/search")){
      throw new Error("provider unavailable");
    }
    if(u.includes("en.wikipedia.org/w/api.php")){
      return new Response(JSON.stringify({
        query:{pages:{
          "123":{pageid:123,index:1,title:"Gasoline",fullurl:"https://en.wikipedia.org/wiki/Gasoline",extract:"Gasoline is a transparent petroleum-derived fuel and a complex mixture of organic compounds, chiefly hydrocarbons."},
          "456":{pageid:456,index:2,title:"Octane rating",fullurl:"https://en.wikipedia.org/wiki/Octane_rating",extract:"Octane rating measures fuel's resistance to knocking in spark-ignition engines."}
        }}
      }),{status:200,headers:{"Content-Type":"application/json"}});
    }
    throw new Error("unexpected provider");
  };
  try{
    const rows=await webSearch("Petrol (गैसोलीन) में असल में क्या-क्या होता है?");
    assert.equal(rows.length,2);
    assert.equal(rows[0].title,"Gasoline");
    assert.match(rows[0].snippet,/complex mixture of organic compounds/i);
    assert.ok(calls.some(url=>String(url).includes("en.wikipedia.org/w/api.php")));
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY=originalKey;
  }
});

test("Wikipedia fallback is not used for freshness-sensitive research",()=>{
  assert.equal(__test.isFreshQuery("What is the latest petrol price today?"),true);
  assert.equal(__test.isFreshQuery("Petrol gasoline chemical composition"),false);
});


test("webSearch aggregates providers and rewards authoritative sources",()=>{
  const rows=__test.mergeSearchResults([
    {provider:"duckduckgo",results:[
      {title:"Generic petrol page",url:"https://example.com/petrol",snippet:"Gasoline is a refined petroleum fuel made of hydrocarbons."},
      {title:"EIA gasoline",url:"https://www.eia.gov/energyexplained/gasoline/",snippet:"Gasoline is a mixture of hydrocarbons."}
    ]},
    {provider:"bing",results:[
      {title:"EIA duplicate",url:"https://www.eia.gov/energyexplained/gasoline/",snippet:"Gasoline is a mixture of hydrocarbons used as motor fuel."}
    ]}
  ],"Petrol gasoline chemical composition hydrocarbons");
  assert.equal(rows[0].url,"https://www.eia.gov/energyexplained/gasoline/");
});


test("webSearch falls back to Pollinations search before Gemini when public search is unavailable",async()=>{
  const originalFetch=globalThis.fetch;
  const originalKey=process.env.POLLINATIONS_API_KEY;
  const originalGemini=process.env.GEMINI_API_KEY;
  process.env.POLLINATIONS_API_KEY="test-pollinations";
  delete process.env.GEMINI_API_KEY;
  const calls=[];
  globalThis.fetch=async(url)=>{
    const u=String(url); calls.push(u);
    if(u.includes("duckduckgo")||u.includes("bing.com/search")||u.includes("google.com/search")) throw new Error("search host unavailable");
    if(u.includes("gen.pollinations.ai/v1/chat/completions")){
      return new Response(JSON.stringify({choices:[{message:{content:"Current petrol prices are monitored by official fuel-price sources. Source: https://ppac.gov.in/ and https://iocl.com/petrol-diesel-price"}}]}),{status:200,headers:{"Content-Type":"application/json"}});
    }
    throw new Error("unexpected provider");
  };
  try{
    const rows=await webSearch("India mein abhi petrol ka price kya chal raha hai?");
    assert.equal(rows.length,2);
    assert.match(rows[0].url,/ppac\\.gov\\.in/);
    assert.ok(calls.some(url=>String(url).includes("gen.pollinations.ai/v1/chat/completions")));
    assert.equal(calls.some(url=>String(url).includes("generativelanguage.googleapis.com")),false);
  }finally{
    globalThis.fetch=originalFetch;
    if(originalKey===undefined) delete process.env.POLLINATIONS_API_KEY; else process.env.POLLINATIONS_API_KEY=originalKey;
    if(originalGemini===undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY=originalGemini;
  }
});