const normalize=(value="")=>String(value).toLowerCase().replace(/[!?.,]+/g," ").replace(/\s+/g," ").trim();

const freshTask=/\b(?:new|naya|nayi|ek)\s+(?:app|project|repo|repository|website|file)\b|\b(?:create|make|build|start)\s+(?:a\s+)?(?:new\s+)?(?:app|project|repo|repository|website)\b|\bapp\s+bana(?:\s+de)?\b/i;
const followup=/\b(?:same|that|this|it|us|isko|isse|usse|upar|previous|last|continue|resume|retry|again|phir|wahi|jo\s+(?:app|repo|repository|file|project))\b|\b(?:is|us|ye|woh)\s+(?:app|repo|repository|file|project)\b/i;

export function routeConversationContext(messages=[],latestUserMessage=""){
 const latest=String(latestUserMessage||"").trim();
 const normalized=normalize(latest);
 const contextual=!freshTask.test(normalized)&&followup.test(normalized);
 const clean=(Array.isArray(messages)?messages:[]).filter(m=>m&&["user","assistant"].includes(m.role)&&String(m.text||"").trim());
 const selected=contextual?clean.slice(-10):clean.filter(m=>m.role==="user").slice(-1);
 return {
  mode:contextual?"contextual_followup":"fresh_task",
  isolated:!contextual,
  latest,
  messages:selected,
  contextText:selected.map(m=>String(m.text||"")).join("\n"),
  reason:contextual?"Current message references an existing task.":"Current message starts a new task; previous mission context is isolated."
 };
}

export function shouldCarryPreviousContext(message=""){
 const r=routeConversationContext([{role:"user",text:String(message)}],message);
 return r.mode==="contextual_followup";
}
