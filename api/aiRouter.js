/**
 * BHAI X Multi-AI Router
 * Server-side provider adapters. API keys never leave the server.
 *
 * Providers:
 * - Google Gemini (existing primary executor)
 * - OpenAI Responses API
 * - Anthropic Messages API
 *
 * Routing is deterministic and role-based; it is not tied to one vendor.
 */

import { inspectAnswerDraft, buildAnswerReviewerPrompt, parseReviewerVerdict, buildEvidenceBackedAnswer } from "../src/answerValidation.js";

const timeout = ms => AbortSignal.timeout(ms);

const CORE_TIMEOUT_MS = 35000;
const CORE_COOLDOWN_MS = 2000;
const PROVIDER_TRANSIENT_COOLDOWN_MS = 15000;
const PROVIDER_ACCOUNT_COOLDOWN_MS = 10 * 60 * 1000;
const providerCooldownUntil = new Map();
let coreCircuitOpenUntil = 0;

const PROVIDERS = {
  core: {
    id: "core",
    name: "BHAI-CORE",
    env: ["BHAI_CORE_API_KEY", "BHAI_CORE_KEY"],
    modelEnv: "BHAI_CORE_MODEL",
    defaultModel: ""
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
    modelEnv: "GEMINI_ROUTER_MODEL",
    defaultModel: "gemini-3.8-flash"
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    env: ["OPENAI_API_KEY"],
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-5.6-luna"
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    env: ["ANTHROPIC_API_KEY"],
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-5"
  },
  huggingface: {
    id: "huggingface",
    name: "Hugging Face Inference Providers",
    env: ["HF_TOKEN"],
    modelEnv: "HF_CHAT_MODEL",
    defaultModel: "openai/gpt-oss-120b:fastest"
  }
};

function firstEnv(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

function configured(id) {
  if (id === "core") {
    return Boolean(coreBaseUrl() && firstEnv(PROVIDERS.core.env));
  }
  return !!firstEnv(PROVIDERS[id]?.env || []);
}

function providerModel(id) {
  const p = PROVIDERS[id];
  return process.env[p.modelEnv] || p.defaultModel;
}

function coreBaseUrl() {
  return String(process.env.BHAI_CORE_URL || "").trim().replace(/\/+$/, "");
}

export function getAIProviderStatus() {
  return Object.values(PROVIDERS).map(p => ({
    id: p.id,
    name: p.name,
    type: "ai",
    configured: configured(p.id),
    status: configured(p.id) ? "configured" : "not_configured",
    model: configured(p.id) ? providerModel(p.id) : null
  }));
}

export function getConfiguredAIProviders() {
  return getAIProviderStatus().filter(p => p.configured).map(p => p.id);
}

export function routeAI({ task="", preferred="", role="chat", exclude=[] }={}) {
  const available = getConfiguredAIProviders().filter(id => !exclude.includes(id));
  if (!available.length) throw new Error("No AI provider is configured.");

  if (preferred && available.includes(preferred)) return preferred;

  const lower = String(task).toLowerCase();
  const order = role === "reviewer"
    ? ["openai", "anthropic", "huggingface", "gemini", "core"]
    : role === "researcher" || role === "web-research"
      ? ["gemini", "openai", "anthropic", "huggingface", "core"]
      : role === "medical"
        ? ["gemini", "openai", "anthropic", "huggingface", "core"]
        : /code|debug|github|repo|repository|build|test|engineering/.test(lower)
          ? ["core", "gemini", "openai", "anthropic", "huggingface"]
          : ["core", "gemini", "openai", "huggingface", "anthropic"];

  return order.find(id => available.includes(id)) || available[0];
}

function normalizeMessages(messages=[]) {
  return messages
    .filter(m => m && ["user","assistant","model"].includes(m.role))
    .map(m => ({
      role: m.role === "model" ? "assistant" : m.role,
      text: String(m.text ?? m.content ?? "")
    }))
    .filter(m => m.text);
}

async function callCore({apiKey,model,system,messages}) {
  if (Date.now() < coreCircuitOpenUntil) {
    throw new Error("BHAI-CORE circuit open; skipping unavailable Core.");
  }

  try {
    const r = await fetch(coreBaseUrl()+"/v1/chat/completions", {
      method:"POST",
      headers:{...(apiKey?{"x-bhai-key":apiKey}:{}),"Content-Type":"application/json"},
      body:JSON.stringify({messages:[...(system?[{role:"system",content:String(system)}]:[]),...normalizeMessages(messages).map(m=>({role:m.role,content:m.text}))],temperature:0.2}),
      signal:timeout(CORE_TIMEOUT_MS)
    });
    const d = await r.json().catch(()=>({}));
    if (!r.ok) {
      const status = r.status;
      const msg = d?.error?.message || d?.error || d?.message || "BHAI-CORE request failed";
      throw Object.assign(new Error(String(msg)), { status });
    }
    const text = typeof d?.text === "string" ? d.text.trim() : (typeof d?.output_text === "string" ? d.output_text.trim() : String(d?.choices?.[0]?.message?.content || "").trim());
    if (!text) throw new Error("BHAI-CORE returned no text.");
    coreCircuitOpenUntil = 0;
    console.log("[AI Router] BHAI-CORE success", JSON.stringify({
      provider: d?.provider || null,
      model: d?.model || model || null,
      backend_provider: d?.provider || null
    }));
    return {text,provider:"core",backend_provider:d.provider || null,model:d.model || model || null};
  } catch (error) {
    const status = Number(error?.status || 0);
    const message = String(error?.message || error);
    const transient = status >= 500 || /timeout|timed out|fetch failed|network error|network request|connection (?:refused|reset|closed)|socket|dns|name resolution|temporarily unavailable|service unavailable/i.test(message);
    coreCircuitOpenUntil = transient ? Date.now() + CORE_COOLDOWN_MS : 0;
    console.warn("[AI Router] BHAI-CORE failure", JSON.stringify({
      status: status || null,
      error: message.slice(0, 240),
      fallback: transient ? "cooldown" : "immediate"
    }));
    throw error;
  }
}

function providerError(message,status,provider) {
  return Object.assign(new Error(String(message || "Provider request failed")), {
    status: Number(status || 0),
    provider
  });
}

async function callGemini({apiKey,model,system,messages}) {
  const contents = normalizeMessages(messages).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{text:m.text}]
  }));
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",
    {
      method:"POST",
      headers:{"Content-Type":"application/json","x-goog-api-key":apiKey},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:String(system||"")}]},
        contents,
        generationConfig:{temperature:0.2}
      }),
      signal:timeout(30000)
    }
  );
  const d = await r.json().catch(()=>({}));
  if (!r.ok) {
    const msg=d?.error?.message || "Gemini API request failed";
    if(r.status===404 && model===providerModel("gemini")) {
      try {
        const mr=await fetch("https://generativelanguage.googleapis.com/v1beta/models",{headers:{"x-goog-api-key":apiKey},signal:timeout(10000)});
        const md=await mr.json().catch(()=>({}));
        const compatible=(md.models||[]).find(m=>Array.isArray(m.supportedGenerationMethods)&&m.supportedGenerationMethods.includes("generateContent"))?.name?.replace(/^models\//,"");
        if(compatible&&compatible!==model)return callGemini({apiKey,model:compatible,system,messages});
      }catch{}
    }
    throw providerError(msg,r.status,"gemini");
  }
  const text=(d?.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
  if(!text)throw new Error("Gemini returned no text.");
  return {text,provider:"gemini",model};
}

async function callOpenAI({apiKey,model,system,messages}) {
  const input=normalizeMessages(messages).map(m=>({role:m.role,content:[{type:"input_text",text:m.text}]}));
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},body:JSON.stringify({model,instructions:String(system||""),input}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw providerError(d?.error?.message||"OpenAI API request failed",r.status,"openai");
  const text=typeof d.output_text==="string"?d.output_text.trim():(d.output||[]).flatMap(x=>x.content||[]).filter(x=>typeof x.text==="string").map(x=>x.text).join("\n").trim();
  if(!text)throw new Error("OpenAI returned no text.");
  return {text,provider:"openai",model};
}

async function callHuggingFace({apiKey,model,system,messages}) {
  const input=[...(system?[{role:"system",content:String(system)}]:[]),...normalizeMessages(messages).map(m=>({role:m.role,content:m.text}))];
  const r=await fetch("https://router.huggingface.co/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},body:JSON.stringify({model,messages:input,stream:false}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok){const message=String(d?.error?.message||d?.error||"Hugging Face Inference Providers request failed");throw providerError(message,r.status,"huggingface");}
  const text=d?.choices?.[0]?.message?.content;
  if(typeof text!=="string"||!text.trim())throw new Error("Hugging Face returned no text.");
  return {text:text.trim(),provider:"huggingface",model};
}

async function callAnthropic({apiKey,model,system,messages}) {
  const input=normalizeMessages(messages).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text}));
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:4096,system:String(system||""),messages:input}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw providerError(d?.error?.message||"Anthropic API request failed",r.status,"anthropic");
  const text=(d?.content||[]).filter(x=>x.type==="text"&&typeof x.text==="string").map(x=>x.text).join("\n").trim();
  if(!text)throw new Error("Anthropic returned no text.");
  return {text,provider:"anthropic",model};
}

async function callProvider(id,args) {
  const apiKey=firstEnv(PROVIDERS[id].env);
  if(id!=="core"&&!apiKey)throw new Error(PROVIDERS[id].name+" is not configured.");
  const model=args.model||providerModel(id);
  if(id==="core")return callCore({...args,apiKey,model});
  if(id==="gemini")return callGemini({...args,apiKey,model});
  if(id==="openai")return callOpenAI({...args,apiKey,model});
  if(id==="anthropic")return callAnthropic({...args,apiKey,model});
  if(id==="huggingface")return callHuggingFace({...args,apiKey,model});
  throw new Error("Unsupported AI provider: "+id);
}

function providerCooldownMs(error) {
  const s=String(error?.message||error).toLowerCase();
  const status=Number(error?.status||0);

  if(
    [401,402,403,404].includes(status) ||
    /no remaining credits|insufficient credits|account balance|billing|payment required|subscription|invalid (?:api )?key|unauthori[sz]ed|forbidden|model (?:not found|unavailable|unsupported|decommissioned)/i.test(s)
  ){
    return PROVIDER_ACCOUNT_COOLDOWN_MS;
  }

  if(
    [408,409,425,429,500,502,503,504].includes(status) ||
    /timeout|timed out|temporarily unavailable|service unavailable|overload|capacity|too many requests|try again later|fetch failed|network error|network request|connection (?:refused|reset|closed)|socket|dns|name resolution|circuit open/i.test(s)
  ){
    return PROVIDER_TRANSIENT_COOLDOWN_MS;
  }

  return 5000;
}

function isProviderCoolingDown(id){
  const until=Number(providerCooldownUntil.get(id)||0);
  if(until<=Date.now()){
    providerCooldownUntil.delete(id);
    return false;
  }
  return true;
}

function isFallbackError(error) {
  const s=String(error?.message||error);
  const status=Number(error?.status||0);

  // Any HTTP provider failure is eligible for the next configured provider.
  // This prevents one vendor's quota, billing, auth, model, or gateway rules
  // from becoming a BHAI-X-wide outage.
  if(status>=400&&status<=599) return true;

  return /401|402|403|404|408|409|422|429|500|502|503|504|quota|rate.?limit|resource exhausted|no remaining credits|remaining credits|insufficient credits|credits?\b|account balance|billing|payment required|subscription|invalid (?:api )?key|unauthori[sz]ed|forbidden|model (?:not found|unavailable|unsupported|decommissioned)|not found|unsupported model|no text|empty response|invalid response|malformed response|timeout|timed out|temporar(?:y|ily) (?:unavailable|failure|overload)|currently experiencing high demand|high demand|service unavailable|overload|overloaded|capacity|too many requests|try again later|fetch failed|network error|network request|connection (?:refused|reset|closed)|socket|dns|name resolution|circuit open|inference providers request failed|request failed/i.test(s);
}

export async function generateWithRouter({
  task="",
  system="",
  messages=[],
  preferred="",
  role="chat",
  exclude=[],
  fallback=true,
  model=""
}={}) {
  const first=routeAI({task,preferred,role,exclude});
  const available=getConfiguredAIProviders().filter(x=>!exclude.includes(x)&&x!==first);
  const ordered=[first,...available.filter(x=>x!=="core"),...(available.includes("core")?["core"]:[])];
  const ready=ordered.filter(id=>!isProviderCoolingDown(id));
  const candidates=ready.length?ready:ordered;
  const failedProviders=[];
  const attemptedProviders=[];
  let last;

  for(const id of candidates){
    attemptedProviders.push(id);
    try{
      const result=await callProvider(id,{system,messages,model});
      providerCooldownUntil.delete(id);
      return {
        ...result,
        attemptedProviders:[...attemptedProviders],
        failedProviders:[...failedProviders]
      };
    }catch(e){
      last=e;
      if(!failedProviders.includes(id)) failedProviders.push(id);
      providerCooldownUntil.set(id,Date.now()+providerCooldownMs(e));
      e.failedProviders=[...failedProviders];
      e.attemptedProviders=[...attemptedProviders];
      e.provider=e.provider||id;
      if(!fallback||!isFallbackError(e))throw e;
    }
  }

  if(last){
    last.failedProviders=[...failedProviders];
    last.attemptedProviders=[...attemptedProviders];
  }
  throw last||new Error("All configured AI providers failed.");
}

export async function reviewWithMultiAI({task="",draft="",evidence="",domain="factual",system="You are a strict reviewer. Find concrete errors and suggest precise corrections.",preferred="",exclude=[]}={}) {
  const allConfigured=getConfiguredAIProviders();
  const independent=allConfigured.filter(id=>!exclude.includes(id));
  // Prefer an independent provider. When only the draft provider is available,
  // reuse that provider as a second-pass adversarial reviewer rather than
  // blocking every valid research answer.
  const reviewer=independent.length
    ? routeAI({task,preferred,role:"reviewer",exclude})
    : (exclude[0] && allConfigured.includes(exclude[0]) ? exclude[0] : routeAI({task,preferred,role:"reviewer"}));
  const prompt=buildAnswerReviewerPrompt({
    task,
    draft,
    evidence,
    domain
  });
  return generateWithRouter({
    task,
    system,
    messages:[{role:"user",text:prompt}],
    preferred:reviewer,
    role:"reviewer",
    // Reviewer outages should fail over to another configured reviewer before
    // the answer engine declares the result unverified.
    exclude:independent.length ? exclude : [],
    fallback:true
  });
}

/**
 * Generate an answer and, for factual/research/medical work, run one
 * independent review pass. A failed review gets one correction retry.
 * This deliberately stops after bounded work instead of looping forever.
 */
function buildDirectResearchFallback({task,evidence,role,failedProviders=[]}={}) {
  if(!["researcher","web-research"].includes(role) || !String(evidence||"").trim()) return null;
  const text=buildEvidenceBackedAnswer(task,evidence);
  if(!text) return null;
  return {
    text,
    provider:"evidence-direct",
    model:"bhai-evidence-v1",
    backend_provider:"retrieved-web-evidence",
    verified:true,
    failedProviders:[...new Set(failedProviders.filter(Boolean))],
    quality:{
      reviewed:false,
      verdict:"EVIDENCE_DIRECT",
      reviewer:"deterministic-evidence",
      issues:["AI draft/review was unavailable or rejected; response was composed only from retrieved evidence."],
      corrections:[],
      flags:[]
    }
  };
}

export async function generateVerifiedAnswer({
  task="",
  system="",
  messages=[],
  preferred="",
  role="researcher",
  evidence="",
  fallback=true
}={}) {
  const requiresReview=["researcher","web-research","medical","reviewed"].includes(role);
  const failedProviders=new Set();
  const rememberFailures=value=>{
    for(const id of (value?.failedProviders||[])){
      if(id) failedProviders.add(id);
    }
  };

  let draft;
  try {
    draft=await generateWithRouter({task,system,messages,preferred,role,fallback});
    rememberFailures(draft);
  } catch(error) {
    rememberFailures(error);
    const direct=buildDirectResearchFallback({task,evidence,role,failedProviders:[...failedProviders]});
    if(direct) {
      console.warn("[AI Router] Using direct evidence fallback after provider failure",JSON.stringify({role,failedProviders:[...failedProviders]}));
      return direct;
    }
    throw error;
  }
  let structure=inspectAnswerDraft(task,draft?.text||"",{requiresEvidence:requiresReview});

  if(!structure.ok){
    try{
      draft=await generateWithRouter({
        task,
        system:String(system||"")+"\n\nIMPORTANT: The previous draft was rejected as malformed or too short. Answer the user's question directly in complete sentences. Never output a fragment.",
        messages,
        role,
        exclude:[...new Set([draft?.provider,...failedProviders].filter(Boolean))],
        fallback:true
      });
      rememberFailures(draft);
      structure=inspectAnswerDraft(task,draft?.text||"",{requiresEvidence:requiresReview});
    }catch{}
  }

  if(!structure.ok){
    const direct=buildDirectResearchFallback({task,evidence,role,failedProviders:[...failedProviders]});
    if(direct) {
      direct.quality.flags=structure.flags;
      console.warn("[AI Router] Using direct evidence fallback after malformed draft",JSON.stringify({role,flags:structure.flags}));
      return direct;
    }
    return {
      ...draft,
      verified:false,
      failedProviders:[...failedProviders],
      quality:{reviewed:false,verdict:"FAIL",issues:structure.flags}
    };
  }

  if(!requiresReview){
    return {
      ...draft,
      verified:false,
      failedProviders:[...failedProviders],
      quality:{reviewed:false,verdict:"SKIPPED",issues:structure.flags}
    };
  }

  const reviewerExclude=[...new Set([draft?.provider,...failedProviders].filter(Boolean))];
  try{
    const review=await reviewWithMultiAI({
      task,
      draft:draft.text,
      evidence,
      domain:role==="medical"?"medical":"factual",
      exclude:reviewerExclude
    });
    rememberFailures(review);
    const parsed=parseReviewerVerdict(review?.text||"");

    if(parsed.verdict==="PASS"){
      return {
        ...draft,
        verified:true,
        failedProviders:[...failedProviders],
        quality:{
          reviewed:true,
          verdict:"PASS",
          reviewer:review?.provider||null,
          issues:parsed.issues,
          corrections:parsed.corrections,
          flags:structure.flags
        }
      };
    }

    const correctionPrompt=[
      String(task),
      evidence?"\nEVIDENCE:\n"+String(evidence).slice(0,18000):"",
      "\nINDEPENDENT REVIEW FEEDBACK:",
      ...(parsed.issues||[]).map(x=>"- Issue: "+x),
      ...(parsed.corrections||[]).map(x=>"- Correction: "+x),
      "\nRewrite the answer from scratch using only supported facts. Do not mention the review process. If evidence is insufficient for a specific claim, say so instead of guessing."
    ].join("\n");

    const corrected=await generateWithRouter({
      task,
      system:String(system||"")+"\n\nQUALITY-CORRECTION MODE: Never repeat a claim that the reviewer flagged as unsupported, contradictory, overconfident, or unsafe.",
      messages:[{role:"user",text:correctionPrompt}],
      preferred:draft?.provider||"",
      role,
      exclude:[...failedProviders],
      fallback:true
    });
    rememberFailures(corrected);
    const finalStructure=inspectAnswerDraft(task,corrected?.text||"",{requiresEvidence:true});
    if(!finalStructure.ok){
      return {
        ...corrected,
        verified:false,
        failedProviders:[...failedProviders],
        quality:{
          reviewed:true,
          verdict:"FAIL",
          reviewer:review?.provider||null,
          issues:[...(parsed.issues||[]),"Corrected draft still failed structural quality."],
          corrections:parsed.corrections||[],
          flags:finalStructure.flags
        }
      };
    }

    // A correction is not automatically trusted: independently review the
    // rewritten answer once more against the same evidence before marking it
    // verified. This prevents a reviewer FAIL from being converted into an
    // unverified-but-presented answer by a lucky rewrite.
    try{
      const finalReview=await reviewWithMultiAI({
        task,
        draft:corrected.text,
        evidence,
        domain:role==="medical"?"medical":"factual",
        exclude:[...new Set([corrected?.provider,...failedProviders].filter(Boolean))]
      });
      rememberFailures(finalReview);
      const finalParsed=parseReviewerVerdict(finalReview?.text||"");
      if(finalParsed.verdict!=="PASS"){
        const direct=buildDirectResearchFallback({task,evidence,role,failedProviders:[...failedProviders]});
        if(direct) {
          direct.quality.issues=[...(parsed.issues||[]),...(finalParsed.issues||[]),"Corrected draft failed final evidence review; direct evidence fallback used."];
          direct.quality.corrections=[...(parsed.corrections||[]),...(finalParsed.corrections||[])];
          return direct;
        }
        return {
          ...corrected,
          verified:false,
          failedProviders:[...failedProviders],
          quality:{
            reviewed:true,
            verdict:"FAIL",
            reviewer:finalReview?.provider||review?.provider||null,
            issues:[...(parsed.issues||[]),...(finalParsed.issues||[]),"Corrected draft failed final evidence review."],
            corrections:[...(parsed.corrections||[]),...(finalParsed.corrections||[])],
            flags:finalStructure.flags
          }
        };
      }
      return {
        ...corrected,
        verified:true,
        failedProviders:[...failedProviders],
        quality:{
          reviewed:true,
          verdict:"CORRECTED",
          reviewer:finalReview?.provider||review?.provider||null,
          issues:parsed.issues||[],
          corrections:parsed.corrections||[],
          flags:finalStructure.flags
        }
      };
    }catch(error){
      rememberFailures(error);
      const direct=buildDirectResearchFallback({task,evidence,role,failedProviders:[...failedProviders]});
      if(direct) {
        direct.quality.issues=["Final corrected-answer review was unavailable; direct evidence fallback used."];
        return direct;
      }
      console.warn("[AI Router] final corrected-answer review unavailable:",String(error?.message||error));
      return {
        ...corrected,
        verified:false,
        failedProviders:[...failedProviders],
        quality:{
          reviewed:false,
          verdict:"UNVERIFIED",
          reviewer:null,
          issues:["Final corrected-answer review was unavailable."],
          corrections:parsed.corrections||[],
          flags:finalStructure.flags
        }
      };
    }
  }catch(error){
    rememberFailures(error);
    const direct=buildDirectResearchFallback({task,evidence,role,failedProviders:[...failedProviders]});
    if(direct) {
      direct.quality.issues=["Independent answer review was unavailable; direct evidence fallback used."];
      return direct;
    }
    console.warn("[AI Router] independent answer review unavailable:",String(error?.message||error));
    return {
      ...draft,
      verified:false,
      failedProviders:[...failedProviders],
      quality:{
        reviewed:false,
        verdict:"UNVERIFIED",
        reviewer:null,
        issues:["Independent answer review was unavailable."],
        corrections:[],
        flags:structure.flags
      }
    };
  }
}

