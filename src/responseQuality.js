/**
 * Lightweight response-quality checks for AI output.
 * Reject obvious corruption and tiny-model non-answers while staying conservative.
 */

const KNOWN_GARBLED=/^(?:essors|rylic|are|я|р|л|ж|д|ц|щ|ы)(?:\s+|$)/iu;
const EXPLANATORY_TASK=/\b(?:batao|samjhao|explain|describe|kaise|kyu|kyon|why|how|ek\s+sentence|in\s+(?:one|a)\s+sentence)\b/i;
const CURRENT_CONTEXT_TASK=/\b(?:garmi|garmee|heatwave|loo|baarish|barish|rainfall|monsoon|mausam|weather|temperature|tapman|humidity|drought|sukha|thand|cold\s+wave|flood|baadh|pani|water\s+level|water\s+shortage|summer|winter|season)\b/i;
const CURRENT_QUESTION_TASK=/(?:\?|\b(?:is\s+bar|iss\s+bar|is\s+baar|iss\s+baar|is\s+saal|iss\s+saal|this\s+year|this\s+season|aajkal|abhi|filhaal|filhal|aane\s+wala|aane\s+wali|padne\s+wala|padne\s+wali|hoga|hogi|padega|padegi|expected|forecast|prediction|scene|haalat|situation)\b|\b(?:kya|kaisa|kaisi|kitna|kitni|kitne)\b)/i;
const TIME_REASONING_TASK=/(?:\b(?:subah|morning|dopahar|afternoon|shaam|evening|raat|night)\b.{0,30}\b\d{1,2}\b|\b\d{1,2}\s*(?:am|pm|baje|बजे)\b).{0,120}\b(?:travel|safar|ghante?|hours?|minutes?|mins?|pahunch|pahunche|pahuch|reach|arrive|kitne\s+baje)\b/i;
const WORD_ONLY=/^[\p{L}\p{N}_-]{1,48}$/u;
const REPEATED_PUNCT=/[A-Za-z\p{L}\p{N}]{3,}[\/\\|_~]{3,}/u;
const STANDALONE_FRAGMENT=/^(?:from|the|and|or|of|to|a|an|is|are|was|were|be|been|being)$/i;
const NON_ANSWER_FRAGMENT=/^(?:from|pathlib|b|actly|uge|essors|rylic|sohn|labor|undefined|null|nan|object|function|error|failed|failure|none|n\/a)$/i;
const CONVERSATIONAL_TASK=/\b(?:hello|hi|hey|namaste|salam|kaise ho|kya haal|kya scene|bas|aise hi|waise hi|test|check|reply|jawab|response|baat|sun bhai|bhai sun|mazak|mazaak|masti|timepass|random|sirf|just)\b/i;
const ACCEPTABLE_SHORT_REPLIES=new Set(["yes","no","haan","han","nahi","nahin","ok","okay","theek","thik","badhiya","mast","hello","hi","hey","thanks","thank","done"]);

function isMathLikeTask(taskText){
  return /^\s*\d[\d\s().,+\-*/%]*\s*(?:\?|=\s*\?)?\s*$/i.test(taskText)
    || /^(?:what\s+is|calculate|solve)\s+\d[\d\s().,+\-*/%]*\s*\??$/i.test(taskText);
}

function isLikelyOneTokenNonAnswer(value,task){
  if(!WORD_ONLY.test(value)) return false;
  const taskText=String(task??"").trim();
  if(!taskText) return false;
  if(EXPLANATORY_TASK.test(taskText)) return true;
  if(NON_ANSWER_FRAGMENT.test(value)) return true;
  const wordCount=taskText.split(/\s+/).filter(Boolean).length;
  const currentContext=CURRENT_CONTEXT_TASK.test(taskText) && CURRENT_QUESTION_TASK.test(taskText);
  if(currentContext && wordCount>=5 && !isMathLikeTask(taskText)) return true;
  if(TIME_REASONING_TASK.test(taskText) && wordCount>=8 && !/[0-9]/.test(value)) return true;
  return wordCount>=4 && CONVERSATIONAL_TASK.test(taskText) && !ACCEPTABLE_SHORT_REPLIES.has(value.toLowerCase());
}

export function isObviouslyGarbledResponse(text="",task=""){
  const value=String(text??"").trim();
  if(!value) return true;
  if(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) return true;
  const taskText=String(task??"");
  const hasCyrillic=/[\u0400-\u04FF]/u.test(value);
  const taskHasCyrillic=/[\u0400-\u04FF]/u.test(taskText);
  if(hasCyrillic&&!taskHasCyrillic&&!/[\u0900-\u097F]/u.test(taskText)) return true;
  if(KNOWN_GARBLED.test(value)) return true;
  if(REPEATED_PUNCT.test(value)) return true;
  if(STANDALONE_FRAGMENT.test(value)&&taskText.split(/\s+/).filter(Boolean).length>=2) return true;
  if(isLikelyOneTokenNonAnswer(value,taskText)) return true;
  return false;
}
