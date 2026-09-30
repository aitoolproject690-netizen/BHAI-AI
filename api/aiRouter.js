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

const PROVIDERS = {
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
  }
};

function firstEnv(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return "";
}

function configured(id) {
  return !!firstEnv(PROVIDERS[id]?.env || []);
}

function providerModel(id) {
  const p = PROVIDERS[id];
  return process.env[p.modelEnv] || p.defaultModel;
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

/**
 * Deterministic routing policy:
 * - explicit provider wins
 * - reviewer role prefers a provider different from the executor
 * - normal chat prefers the configured low-latency route
 * - coding/reasoning can use the configured executor preference
 *
 * No provider is reported as successful until its API call succeeds.
 */
export function routeAI({ task="", preferred="", role="chat", exclude=[] }={}) {
  const available = getConfiguredAIProviders().filter(id => !exclude.includes(id));
  if (!available.length) throw new Error("No AI provider is configured.");

  if (preferred && available.includes(preferred)) return preferred;

  const lower = String(task).toLowerCase();
  const order = role === "reviewer"
    ? ["openai", "anthropic", "gemini"]
    : /code|debug|github|repo|repository|build|test|engineering/.test(lower)
      ? ["gemini", "openai", "anthropic"]
      : ["gemini", "openai", "anthropic"];

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
  if (!r.ok) throw new Error(d?.error?.message || "Gemini API request failed");
  const text = (d?.candidates?.[0]?.content?.parts||[])
    .filter(p => typeof p.text === "string")
    .map(p => p.text).join("\n").trim();
  if (!text) throw new Error("Gemini returned no text.");
  return {text,provider:"gemini",model};
}

async function callOpenAI({apiKey,model,system,messages}) {
  const input = normalizeMessages(messages).map(m => ({
    role:m.role,
    content:[{type:"input_text",text:m.text}]
  }));
  const r = await fetch("https://api.openai.com/v1/responses",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+apiKey
    },
    body:JSON.stringify({
      model,
      instructions:String(system||""),
      input
    }),
    signal:timeout(30000)
  });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d?.error?.message || "OpenAI API request failed");
  const text = typeof d.output_text === "string"
    ? d.output_text.trim()
    : (d.output||[])
      .flatMap(x => x.content||[])
      .filter(x => typeof x.text === "string")
      .map(x => x.text).join("\n").trim();
  if (!text) throw new Error("OpenAI returned no text.");
  return {text,provider:"openai",model};
}

async function callAnthropic({apiKey,model,system,messages}) {
  const input = normalizeMessages(messages)
    .filter(m => m.role !== "assistant" || true)
    .map(m => ({role:m.role==="assistant"?"assistant":"user",content:m.text}));
  const r = await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "x-api-key":apiKey,
      "anthropic-version":"2023-06-01"
    },
    body:JSON.stringify({
      model,
      max_tokens:4096,
      system:String(system||""),
      messages:input
    }),
    signal:timeout(30000)
  });
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d?.error?.message || "Anthropic API request failed");
  const text = (d?.content||[])
    .filter(x => x.type === "text" && typeof x.text === "string")
    .map(x => x.text).join("\n").trim();
  if (!text) throw new Error("Anthropic returned no text.");
  return {text,provider:"anthropic",model};
}

async function callProvider(id,args) {
  const apiKey = firstEnv(PROVIDERS[id].env);
  if (!apiKey) throw new Error(PROVIDERS[id].name+" is not configured.");
  const model = args.model || providerModel(id);
  if (id === "gemini") return callGemini({...args,apiKey,model});
  if (id === "openai") return callOpenAI({...args,apiKey,model});
  if (id === "anthropic") return callAnthropic({...args,apiKey,model});
  throw new Error("Unsupported AI provider: "+id);
}

function isFallbackError(error) {
  const s=String(error?.message||error);
  return /401|403|408|409|429|500|502|503|504|quota|rate.?limit|timeout|timed out|temporarily unavailable|overloaded|capacity/i.test(s);
}

/**
 * Generate text with automatic provider fallback.
 * Returns the actual provider/model used.
 */
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
  const first = routeAI({task,preferred,role,exclude});
  const candidates = [first,...getConfiguredAIProviders().filter(x=>x!==first && !exclude.includes(x))];
  let last;
  for (const id of candidates) {
    try {
      return await callProvider(id,{system,messages,model});
    } catch (e) {
      last=e;
      if (!fallback || !isFallbackError(e)) throw e;
    }
  }
  throw last || new Error("All configured AI providers failed.");
}

/**
 * Ask a second provider to review an answer. The reviewer is intentionally
 * independent from the executor and receives only the task + draft text.
 */
export async function reviewWithMultiAI({
  task="",
  draft="",
  system="You are a strict reviewer. Find concrete errors and suggest precise corrections.",
  preferred="",
  exclude=[]
}={}) {
  const reviewer = routeAI({task,preferred,role:"reviewer",exclude});
  const prompt =
    "TASK:\n"+String(task).slice(0,12000)+
    "\n\nDRAFT:\n"+String(draft).slice(0,16000)+
    "\n\nReturn JSON-like plain text with: verdict, issues, corrections. Do not rewrite the whole answer.";
  return generateWithRouter({
    task,
    system,
    messages:[{role:"user",text:prompt}],
    preferred:reviewer,
    role:"reviewer",
    exclude,
    fallback:false
  });
}
