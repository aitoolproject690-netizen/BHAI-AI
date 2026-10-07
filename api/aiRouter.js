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

const timeout = ms => AbortSignal.timeout(ms);

const CORE_TIMEOUT_MS = 20000;
const CORE_COOLDOWN_MS = 10000;
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
    throw new Error(msg);
  }
  const text=(d?.candidates?.[0]?.content?.parts||[]).filter(p=>typeof p.text==="string").map(p=>p.text).join("\n").trim();
  if(!text)throw new Error("Gemini returned no text.");
  return {text,provider:"gemini",model};
}

async function callOpenAI({apiKey,model,system,messages}) {
  const input=normalizeMessages(messages).map(m=>({role:m.role,content:[{type:"input_text",text:m.text}]}));
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},body:JSON.stringify({model,instructions:String(system||""),input}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||"OpenAI API request failed");
  const text=typeof d.output_text==="string"?d.output_text.trim():(d.output||[]).flatMap(x=>x.content||[]).filter(x=>typeof x.text==="string").map(x=>x.text).join("\n").trim();
  if(!text)throw new Error("OpenAI returned no text.");
  return {text,provider:"openai",model};
}

async function callHuggingFace({apiKey,model,system,messages}) {
  const input=[...(system?[{role:"system",content:String(system)}]:[]),...normalizeMessages(messages).map(m=>({role:m.role,content:m.text}))];
  const r=await fetch("https://router.huggingface.co/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+apiKey},body:JSON.stringify({model,messages:input,stream:false}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||"Hugging Face Inference Providers request failed");
  const text=d?.choices?.[0]?.message?.content;
  if(typeof text!=="string"||!text.trim())throw new Error("Hugging Face returned no text.");
  return {text:text.trim(),provider:"huggingface",model};
}

async function callAnthropic({apiKey,model,system,messages}) {
  const input=normalizeMessages(messages).map(m=>({role:m.role==="assistant"?"assistant":"user",content:m.text}));
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","x-api-key":apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model,max_tokens:4096,system:String(system||""),messages:input}),signal:timeout(30000)});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.error?.message||"Anthropic API request failed");
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

function isFallbackError(error) {
  const s=String(error?.message||error);
  const status=Number(error?.status||0);
  if([401,403,408,409,429,500,502,503,504].includes(status)) return true;
  return /401|403|408|409|429|500|502|503|504|quota|rate.?limit|timeout|timed out|temporarily unavailable|currently experiencing high demand|high demand|service unavailable|overloaded|capacity|too many requests|try again later|fetch failed|network error|network request|connection (?:refused|reset|closed)|socket|dns|name resolution|circuit open/i.test(s);
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
  const candidates=[first,...available.filter(x=>x!=="core"),...(available.includes("core")?["core"]:[])];
  let last;
  for(const id of candidates){
    try{return await callProvider(id,{system,messages,model});}
    catch(e){last=e;if(!fallback||!isFallbackError(e))throw e;}
  }
  throw last||new Error("All configured AI providers failed.");
}

export async function reviewWithMultiAI({task="",draft="",system="You are a strict reviewer. Find concrete errors and suggest precise corrections.",preferred="",exclude=[]}={}) {
  const reviewer=routeAI({task,preferred,role:"reviewer",exclude});
  const prompt="TASK:\n"+String(task).slice(0,12000)+"\n\nDRAFT:\n"+String(draft).slice(0,16000)+"\n\nReturn JSON-like plain text with: verdict, issues, corrections. Do not rewrite the whole answer.";
  return generateWithRouter({task,system,messages:[{role:"user",text:prompt}],preferred:reviewer,role:"reviewer",exclude,fallback:false});
}
