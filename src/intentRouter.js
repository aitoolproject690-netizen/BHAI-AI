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
const INSULT_WORDS = /\b(?:chutiya|chutiye|bewakoof|bewkoof|gadha|gadhi|pagal|kamine|kamina|nalayak|ullu|saala|sala)\b/i;
const MEDICAL_WORDS = /\b(?:sardi|shardi|cold|runny nose|naak se pani|naak bah|khansi|cough|bukhar|fever|dard|pain|headache|medicine|dawai|dava|doctor|hospital|symptom|tabiyat|health|sehat|pregnan|baby|baccha|infant|vomit|diarrhea|dast|blood|bleeding|saans|breathing|chest|seene|allergy|rash|swelling|infection|thakan|weakness|chakkar|dizziness|bp|blood pressure|sugar|diabetes|nutrition|diet|fiber|fibre|vitamin|protein|supplement|constipation)\b/i;

// Indirect current-context cues matter too: users often ask about the present
// situation without writing "latest", "today", or "current" explicitly.
const WEATHER_CLIMATE_WORDS = /\b(?:garmi|garmee|heat|heatwave|loo|baarish|barish|rain|rainfall|monsoon|mausam|weather|temperature|temp|tapman|humidity|nami|drought|sukha|sukha padna|sukha pada|thand|cold wave|flood|baadh|pani|water level|water shortage|rainy season|summer|winter|season)\b/i;
const CURRENT_CONTEXT_CUES = /\b(?:is\s+bar|iss\s+bar|is\s+bhaar|iss\s+bhaar|is\s+baar|iss\s+baar|this\s+year|this\s+season|this\s+summer|this\s+winter|is\s+saal|iss\s+saal|is\s+season|iss\s+season|aajkal|in\s+dino|in\s+dinon|these\s+days|lately|recently|abhi|filhaal|filhal|is\s+waqt|right\s+now|aane\s+wala|aane\s+wali|padne\s+wala|padne\s+wali|hone\s+wala|hone\s+wali|expected|forecast|prediction|kitni\s+garmi|bahut\s+garmi|kam\s+baarish|kam\s+pani|kam\s+paanee|zyada\s+garmi|zyada\s+baarish|pani\s+kam|paanee\s+kam)\b/i;
const CURRENT_STATUS_CUES = /(?:\b(?:kya\s+scene|haalat\s+kya|situation\s+kya|kaisa\s+weather|weather\s+kaisa|mausam\s+kaisa|kaisa\s+mausam|garmi\s+kaisi|garmi\s+kitni|baarish\s+kaisi|baarish\s+kitni|temperature\s+kya|temperature\s+kitna|tapman\s+kya|tapman\s+kitna|padegi|padega|hogi|hoga|rahegi|rahega)\b)/i;

// Natural conversational phrases that are clearly social/check-in chatter,
// not a request to search, code, execute, or generate media.
const CONVERSATION_KEYS = [
  /\b(?:bas|aise|waise)\s+hi\b.{0,80}\b(?:test|check|try|dekh|dekhta|dekhna)\b/i,
  /\b(?:sirf|bas|just)\s+(?:check|test|dekh|try)\s+(?:kar|kr)\b.{0,80}(?:raha|rha|rahi|rhi)?\b/i,
  /\b(?:aise|waise)\s+hi\b.{0,100}\b(?:puch|pooch|puchh)\s+(?:raha|rha|rahi|rhi|tha|thi)\b/i,
  /\b(?:bas|sirf)\s+dekh\s+(?:raha|rha|rahi|rhi|tha|thi)\b/i,
  /\b(?:test|check|try)\s+(?:kar|kr)\s+(?:raha|rha|rahi|rhi)\b.{0,80}\b(?:reply|jawab|response)\b/i,
  /\b(?:kya|kaisa)\s+(?:reply|jawab|response)\s+(?:dega|deta|deti|aayega|aata|milega|milta)\b/i,
  /\b(?:mazak|mazaak|masti|timepass)\b.{0,50}(?:kar|tha|thi|hai|hoon|hun)?\b/i,
  /\b(?:sun bhai|bhai sun|oye bhai|arre bhai)\b/i,
  /\b(?:haan bhai|han bhai|nahi bhai|nahin bhai|bas bhai|acha bhai|accha bhai)\b/i,
  /\b(?:ready ho|online ho|jag rahe ho|zinda ho|free ho)\b/i
];

function hasClearWorkCue(text=""){
  return /\b(?:github|git\s*hub|repo(?:sitory)?|code|coding|python|javascript|typescript|bug|error|debug|fix|deploy|build|commit|push|pull\s+request|app|project|website|apk|image|picture|photo|video|clip|animation|generate|create|draw|design|render|medical|medicine|dawai|doctor|symptom|fever|cough|pain|blood|bp|research|search|latest|current|today|news|price|weather)\b/i.test(String(text||""));
}

export function normalizeIntent(text="") {
  return String(text)
    .toLowerCase()
    .replace(/[!?.,;:]+/g," ")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu," ")
    .replace(/\s+/g," ")
    .trim()
    .replace(/^bhai\b\s*/i,"")
    .replace(/\s+bhai$/i,"")
    .replace(/\s+/g," ")
    .trim();
}

export function getCasualReply(text=""){
  const key=normalizeIntent(text);
  if(!key)return null;
  if(!hasClearWorkCue(text) && CONVERSATION_KEYS.some(pattern=>pattern.test(String(text||"")))){
    if(/\b(?:kya|kaisa)\s+(?:reply|jawab|response)\s+(?:dega|deta|deti|aayega|aata|milega|milta)\b/i.test(text)){
      return "😂 Haan bhai, samajh gaya — tu bas test kar raha tha ki main kya reply deta hai. Main yahin hoon, bol kya scene hai! 🚀";
    }
    if(/\b(?:mazak|mazaak|masti|timepass)\b/i.test(text)){
      return "😂 Samajh gaya bhai, thodi masti chal rahi thi. Main ready hoon — bol, ab kya karna hai? 😄";
    }
    return "Haan bhai 😄 Samajh gaya. Main yahin hoon — bol kya scene hai? 🚀";
  }
  if(/\bkya\s+kar\s+(?:raha|rahi)\s+hai\b/i.test(key)||/\bkya\s+kar\s+rahe\s+ho\b/i.test(key)){
    return "Bas bhai, yahin BHAI X ka kaam chal raha hai 😄🚀 Tu bata, kya scene hai?";
  }
  if(/\bkhana\s+(?:kha|khaya|khayi|khaye|khata|khati)\b/i.test(key)||/\b(?:aaj\s+)?kya\s+(?:kha|khaya|khayi|khaye|khata|khati)\b/i.test(key)||/\b(?:kha|khaya|khayi|khaye)\s+(?:tune|tumne|aapne|tu|tum)\b/i.test(key)){
    return "😂 Bhai, main AI hoon—khana nahi kha sakta. Tu bata, aaj kya khaya? 🍛😄";
  }
  if(INSULT_WORDS.test(key)){
    return "😂 Arre bhai, gaali baad mein 😄 Jo bhi problem hai seedha bol—main jawab dunga aur help karunga. 😎";
  }
  if(/\b(?:chai|coffee)\s+(?:pi|pili|piya|pi li|pi liya|peeta|peeti|pita|piti)\b/i.test(key)){
    return "😂 Bhai, main AI hoon—chai/coffee bhi nahi pee sakta. Tu pehle ek cup meri taraf se bhi maar! ☕😄";
  }
  return null;
}

export function isCasualIntent(text="") {
  const key=normalizeIntent(text);
  if(CASUAL_KEYS.has(key)) return true;
  if(!hasClearWorkCue(text) && CONVERSATION_KEYS.some(pattern=>pattern.test(String(text||"")))) return true;
  if(getCasualReply(text)) return true;
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

export function isMedicalChatIntent(text="") { return MEDICAL_WORDS.test(String(text||"")); }

/**
 * Detects indirect current-context questions that need fresh external evidence
 * even when the user never says "latest", "today", or "current".
 */
export function isCurrentContextIntent(text="") {
  const raw=String(text||"").trim();
  if(!raw || isCasualIntent(raw)) return false;
  if(!WEATHER_CLIMATE_WORDS.test(raw)) return false;
  return CURRENT_CONTEXT_CUES.test(raw) || CURRENT_STATUS_CUES.test(raw);
}

export function isKnowledgeResearchIntent(text="") {
  const raw=String(text||"").trim();
  if(!raw) return false;
  const normalized=normalizeIntent(raw);
  if(isCasualIntent(raw)) return false;
  const hasOperator = [...raw].some(ch => "+-*/%".includes(ch));
  const hasLetters = [...raw].some(ch => /[A-Za-z]/.test(ch));
  const mathShape = /^\d/.test(raw) && hasOperator && (!hasLetters || /kitna\s+(?:hota|hoga)|what\s+is/i.test(raw));
  if(mathShape) return false;

  const domain=/(?:petrol|gasoline|diesel|fuel|engine|car|battery|electric vehicle|chemistry|chemical|physics|biology|medicine|drug|nutrition|vitamin|fiber|fibre|computer|programming|javascript|python|network|internet|cyber|api|database|cloud|ai|artificial intelligence|machine learning|space|astronomy|geology|history|geography|economics|finance|tax|law|legal|constitution|science|scientific|technology|technical)/i.test(raw);
  const question=/(?:\?|\bwhat\b|\bwhat is\b|\bwhat are\b|\bhow does\b|\bhow do\b|\bwhy does\b|\bwhy do\b|\bexplain\b|\bmeaning\b|\bdefine\b|\bkaise\b|\bkyu\b|\bkyon\b|\bkya hota\b|\bkya hai\b|\bkya kya\b|\bmein kya\b|\bme kya\b|\bmatlab\b|\bkaise kaam\b)/i.test(raw);
  const conversational=/(?:^|\s)(?:who are you|what are you|what can you do|what are you doing|how are you doing|can you help me|tell me about yourself)(?:$|\s)/i.test(normalized);
  if(conversational) return false;

  return question && (domain || /^(?:why|how|what|who|when|where|which|explain|define)\b/i.test(normalized) || /(?:\bkya\b|\bkaise\b|\bkyu\b|\bkyon\b).{0,80}\?/i.test(raw));
}

export function isWebResearchIntent(text="") {
  const raw=String(text||"").trim();
  if(!raw) return false;
  if(isCurrentContextIntent(raw)) return true;
  return /(?:\b(?:search|lookup|look up|find online|search online|research|web search|internet|online)\b|\b(?:latest|newest|current|today|todays|this week|this month|recent|recently|right now|abhi|aaj|is waqt|filhaal|filhal)\b|\b(?:news|price|rate|weather|forecast|availability|opening hours|schedule|who is the current|what is the current|how much is|where can i find)\b)/i.test(raw);
}

export function isGeneralChatIntent(text="") {
  const raw=String(text);
  if(isCasualIntent(raw)||detectMediaIntent(raw).type) return false;
  return !/\b(?:github|git\s*hub|repo(?:sitory)?|create|make|generate|draw|design|render|visualize|produce|banao|bana|banado|ban[aā]o|build|deploy|publish|commit|push|pull\s+request|fix|repair|debug|update|implement|refactor|ship|release)\b/i.test(raw);
}

/**
 * Server-side tool gate for media generation.
 * A model must never turn a non-media request into an image/video job.
 */
export function isMediaToolAllowed(toolName,text="") {
  const type=detectMediaIntent(text).type;
  if(toolName==="generate_image") return type==="image";
  if(toolName==="generate_video") return type==="video";
  return true;
}

/**
 * Detects local coding-help requests that should stay in the chat path.
 * Only explicit project/GitHub execution cues should enter the engineering agent.
 */
export function isLocalCodingIntent(text="") {
  const raw=String(text);
  if(isCasualIntent(raw)||detectMediaIntent(raw).type) return false;
  const codingCue=/(?:python|javascript|typescript|code|coding|function|def\s+\w+|return\b|stack\s*trace|exception|traceback|bug|error|fix\s+(?:this|the)?\s*code|debug)/i.test(raw);
  const executionCue=/(?:github|git\s*hub|repo(?:sitory)?|app\b|project\b|website\b|apk\b|deploy|publish|commit|push|pull\s+request|create\s+(?:a\s+)?repo)/i.test(raw);
  return codingCue && !executionCue;
}
