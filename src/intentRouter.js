/**
 * Shared deterministic intent helpers for BHAI X.
 * No provider/model/API knowledge lives here.
 */

const CASUAL_KEYS = new Set([
  "hi","hello","hey","hii","helo","namaste","salam",
  "good morning","good evening","good night",
  "kaise ho","kaisa hai","kya haal","kya haal hai",
  "kya chal raha","kya chal raha hai","kya chal rha","kya chal rha hai",
  "kya kar rahe ho","kya kaam kar rahe ho","kya kam kar rahe ho",
  "kya kaam kr rahe ho","kya kam kr reh ho",
  "kya scene hai","kya hua","thanks","thank you","thik hai","theek hai",
  "ok","okay","nice","wah","haha","bye","goodbye",
  "khana kha liya","khana kha liya hai","khana khaya","khana khaya hai",
  "kha liya","chai pi liya","so gaye","so rahe ho","kahan ho","busy ho","free ho"
]);

const VISUAL_WORDS = /\b(?:image|picture|photo|pic|poster|illustration|artwork|tasveer|scene|visual|चित्र|तस्वीर)\b/i;
const VIDEO_WORDS = /\b(?:video|clip|animation|animated)\b/i;
const CREATE_WORDS = /\b(?:generate|create|make|draw|design|render|visualize|produce|banao|bana|banado|ban[aā]o)\b/i;

export function normalizeIntent(text="") {
  return String(text)
    .toLowerCase()
    .replace(/[!?.,;:]+/g," ")
    .replace(/\s+/g," ")
    .trim()
    .replace(/^bhai\b\s*/i,"")
    .replace(/\s+bhai$/i,"")
    .replace(/\s+/g," ")
    .trim();
}

export function isCasualIntent(text="") {
  const key=normalizeIntent(text);
  if(CASUAL_KEYS.has(key)) return true;
  return /^(?:khana\s+(?:kha|khaya)\s+liya(?:\s+hai)?|kha\s+liya|chai\s+(?:pi|pili)\s+liya|so\s+gaye|so\s+rahe\s+ho|kahan\s+ho|kya\s+kar\s+rahe\s+ho|busy\s+ho|free\s+ho)$/i.test(key);
}

export function detectMediaIntent(text="") {
  const raw=String(text);
  const video=VIDEO_WORDS.test(raw);
  const visual=VISUAL_WORDS.test(raw);
  const create=CREATE_WORDS.test(raw);
  const imageToVideo=
    /\bimage[- ]to[- ]video\b/i.test(raw) ||
    /\b(?:is|iss|isko)\b.{0,120}\b(?:image|picture|photo|pic|tasveer|scene|visual)\b.{0,100}\b(?:video|clip|animation)\b/i.test(raw) ||
    /\b(?:video|clip|animation)\b.{0,140}\b(?:from|using|with)\b.{0,120}\b(?:image|picture|photo|pic|tasveer|scene|visual)\b/i.test(raw) ||
    /\b(?:is|iss|isko)\b.{0,100}\b(?:video|clip|animation)\b/i.test(raw);

  if(video && (create || imageToVideo)) return {type:"video",imageToVideo};
  if(!video && visual && create) return {type:"image",imageToVideo:false};
  if(!video && /\b(?:image|picture|photo|pic|tasveer|scene)\b\s+(?:bana|banao|banado|ban[aā]o)\b/i.test(raw))
    return {type:"image",imageToVideo:false};
  return {type:null,imageToVideo:false};
}

export function isGeneralChatIntent(text="") {
  const raw=String(text);
  if(isCasualIntent(raw)||detectMediaIntent(raw).type) return false;
  return !/\b(?:github|git\s*hub|repo(?:sitory)?|create|make|generate|draw|design|render|visualize|produce|banao|bana|banado|ban[aā]o|build|deploy|publish|commit|push|pull\s+request|fix|repair|debug|update|implement|refactor|ship|release)\b/i.test(raw);
}
