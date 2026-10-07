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
    assert.ok(calls.some(url=>url.includes("chemical%20composition")||url.includes("chemical+composition")));
  }finally{ globalThis.fetch=original; }
});

test("research query expansion targets petrol chemical composition instead of prices",()=>{
  const q=__test.buildSearchQueries("Petrol (गैसोलीन) में असल में क्या-क्या होता है?");
  assert.match(q[0],/gasoline petrol chemical composition/i);
});

test("research relevance scoring penalizes petrol price and station results",()=>{
  const score=__test.relevanceScore({title:"Latest Petrol Price Comparison",snippet:"Petrol station prices and discounts"},"gasoline petrol chemical composition hydrocarbons");
  assert.ok(score<=0);
  const good=__test.relevanceScore({title:"Gasoline composition and hydrocarbons",snippet:"Gasoline is a mixture of hydrocarbons used as motor fuel"},"gasoline petrol chemical composition hydrocarbons");
  assert.ok(good>score);
});

