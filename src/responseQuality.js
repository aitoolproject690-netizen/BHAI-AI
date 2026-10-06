/**
 * Lightweight response-quality checks for AI output.
 * This is intentionally conservative: only obvious corruption is rejected.
 */

const KNOWN_GARBLED=/^(?:essors|rylic|are|я|р|л|ж|д|ц|щ|ы)(?:\s+|$)/iu;

export function isObviouslyGarbledResponse(text="", task=""){
  const value=String(text??"").trim();
  if(!value) return true;
  if(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(value)) return true;
  const taskText=String(task??"");
  const hasCyrillic=/[\u0400-\u04FF]/u.test(value);
  const taskHasCyrillic=/[\u0400-\u04FF]/u.test(taskText);
  if(hasCyrillic&&!taskHasCyrillic&&!/[\u0900-\u097F]/u.test(taskText)) return true;
  if(KNOWN_GARBLED.test(value)) return true;
  return false;
}

// agent-tool-loop verification note
