/**
 * Small deterministic reasoning helpers for common date/time arithmetic.
 * These answers do not need an AI provider and therefore remain available
 * even when every external model is rate-limited or unavailable.
 */

function parseClock(value=""){
  const m=String(value).match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|बजे)?\b/i);
  if(!m) return null;
  let hour=Number(m[1]);
  const minute=Number(m[2]||0);
  const suffix=String(m[3]||"").toLowerCase();
  if(hour>23||minute>59) return null;
  if(suffix==="pm"&&hour<12) hour+=12;
  if(suffix==="am"&&hour===12) hour=0;
  return {hour,minute};
}

function parseDuration(text=""){
  const m=String(text).match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|घंट(?:े|ा)|ghante?|h)\b/i);
  if(m) return Math.round(Number(m[1])*60);
  const mins=String(text).match(/\b(\d+)\s*(?:minutes?|mins?|मिनट|minute|m)\b/i);
  if(mins) return Number(mins[1]);
  return null;
}

export function solveSimpleTime(text=""){
  const raw=String(text||"").trim();
  if(!raw) return null;
  if(!/(?:\b(?:pahunche|pahunch|pahuch|reach|arrive|arrival)\b|\b(?:kitne\s+baje|what\s+time|when\s+will)\b)/i.test(raw)) return null;
  if(!/(?:travel|safar|trip|journey|ghante?|hours?|minutes?|mins?|घंट|मिनट)/i.test(raw)) return null;

  const startMatch=raw.match(/(?:\b(?:subah|morning|dopahar|afternoon|shaam|evening|raat|night)\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:baje|बजे)?/i);
  if(!startMatch) return null;
  let hour=Number(startMatch[1]);
  const minute=Number(startMatch[2]||0);
  const suffix=String(startMatch[3]||"").toLowerCase();
  if(hour>23||minute>59) return null;
  if(suffix==="pm"&&hour<12) hour+=12;
  if(suffix==="am"&&hour===12) hour=0;
  const duration=parseDuration(raw);
  if(duration==null) return null;

  const total=((hour*60)+minute+duration)%(24*60);
  const outHour=total===0?0:Math.floor(total/60);
  const outMinute=total%60;
  const period=outHour<12?"AM":"PM";
  const displayHour=outHour%12===0?12:outHour%12;
  const formatted=outMinute===0?displayHour+" "+period:displayHour+":"+String(outMinute).padStart(2,"0")+" "+period;
  return "Agar " + (startMatch[1] + (minute?":"+String(minute).padStart(2,"0"):"")) + " baje nikloge aur " + (duration%60===0?(duration/60)+" ghante":duration+" minute") + " travel karoge, to lagbhag " + formatted + " pahuchoge.";
}

export const __test={parseClock,parseDuration};
