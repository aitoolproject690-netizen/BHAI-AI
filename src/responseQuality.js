/**
 * Lightweight response-quality checks for AI output.
 * Reject obvious corruption and tiny-model non-answers while staying conservative.
 */

const KNOWN_GARBLED=/^(?:essors|rylic|are|я|р|л|ж|д|ц|щ|ы)(?:\s+|$)/iu;
const EXPLANATORY_TASK=/\b(?:batao|samjhao|explain|describe|kaise|kyu|kyon|why|how|ek\s+sentence|in\s+(?:one|a)\s+sentence)\b/i;
const WORD_ONLY=/^[\p{L}\p{N}_-]{1,48}$/u;
const REPEATED_PUNCT=/[A-Za-z\p{L}\p{N}]{3,}[\/\\|_~]{3,}/u;

function isLikelyOneTokenNonAnswer(value,task){
  if(!WORD_ONLY.test(value)) return false;
  const taskText=String(task??"").trim();
  if(!taskText) return false;
  return EXPLANATORY_TASK.test(taskText);
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
  if(isLikelyOneTokenNonAnswer(value,taskText)) return true;
  return false;
}
