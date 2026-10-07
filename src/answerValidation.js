/**
 * Evidence/answer validation helpers for BHAI X.
 * This layer is intentionally provider-agnostic: models create drafts,
 * while this module decides when a draft needs independent review.
 */

import { isObviouslyGarbledResponse } from "./responseQuality.js";

const QUESTION_SHAPE=/\b(?:what|why|how|when|where|which|who|explain|define|meaning|kaise|kyu|kyon|kya)\b|\?/i;
const ABSOLUTE_CLAIM=/\b(?:always|never|definitely|guaranteed|100%|directly causes?|proves?|completely rules out|must|will certainly)\b/i;
const NUMERIC_DETAIL=/\b\d+(?:\.\d+)?\s*(?:mg|mcg|g|kg|ml|l|litre|litres|liter|liters|bpm|mmhg|°c|c|%|km\/h|kwh|v|a)\b/i;
const STRONG_CAUSAL=/\b(?:causes?|leads? to|results? in|prevents?|cures?|treats?)\b/i;

const EVIDENCE_TOKEN=/[a-z]{3,}|[\u0900-\u097f]{2,}/giu;
const EVIDENCE_STOPWORDS=new Set(["what","when","where","which","who","why","how","does","do","is","are","the","and","for","from","with","this","that","into","about","have","has","had","will","would","could","should","can","may","might","में","का","की","के","क्या","असल","होता","होती","होते","और","एक","से","पर","यह","वह","है","हैं","किस","कैसे","क्यों"]);

function evidenceTokens(value){
  return new Set(String(value||"").toLowerCase().match(EVIDENCE_TOKEN)||[]);
}

function evidenceSentences(value){
  return String(value||"")
    .replace(/https?:\/\/\S+/gi," ")
    .replace(/\[[^\]]*\]\([^)]*\)/g," ")
    .split(/(?<=[.!?।])\s+|\n+/)
    .map(x=>x.replace(/\s+/g," ").trim())
    .filter(x=>x.length>=24);
}

export function buildEvidenceBackedAnswer(task="",evidence="",{maxSentences=4,maxChars=1400}={}){
  const sourcePattern=/\[(\d+)\]\s+([^\n]+)\nURL:\s*(https?:\/\/[^\s]+)\nSummary:\s*([\s\S]*?)(?=\n\n\[\d+\]\s+|$)/g;
  const questionTokens=[...evidenceTokens(task)].filter(x=>!EVIDENCE_STOPWORDS.has(x));
  const candidates=[];
  let match;
  while((match=sourcePattern.exec(String(evidence||"")))){
    for(const sentence of evidenceSentences(match[4])){
      const st=evidenceTokens(sentence);
      let score=0;
      for(const token of questionTokens) if(st.has(token)) score++;
      const petrolComposition=/\b(petrol|gasoline)\b/i.test(task) && /(composition|chemical|contain|consist|संघटन|रासायनिक|क्या|होता)/i.test(task);
      const fiberHealth=/\b(fiber|fibre)\b/i.test(task) && /(deficien|lack|effect|benefit|क्या|कमी|असर)/i.test(task);
      if(petrolComposition && /price|station|discount|fuel price|petrol pump|gas station/i.test(sentence)) continue;
      if(fiberHealth && /restaurant|recipe|price|menu/i.test(sentence)) continue;
      if(/\b(petrol|gasoline)\b/i.test(task) && /\b(petrol|gasoline|hydrocarbon|fuel)\b/i.test(sentence)) score+=2;
      if(/\b(fiber|fibre)\b/i.test(task) && /\b(fiber|fibre|constipation|nutrition|diet|health)\b/i.test(sentence)) score+=2;
      if(score>0) candidates.push({sentence,score});
    }
  }
  candidates.sort((a,b)=>b.score-a.score||a.sentence.length-b.sentence.length);
  const chosen=[];
  const seen=new Set();
  let total=0;
  for(const item of candidates){
    const normalized=item.sentence.toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/giu," ").trim();
    if(!normalized||seen.has(normalized)) continue;
    const next=chosen.length?total+item.sentence.length+2:item.sentence.length;
    if(chosen.length>=maxSentences||next>maxChars) continue;
    seen.add(normalized);
    chosen.push(item.sentence);
    total=next;
  }
  if(!chosen.length) return null;
  return "Evidence-backed summary:\n\n"+chosen.map(x=>"- "+x).join("\n");
}

export function inspectAnswerDraft(task="",draft="",{requiresEvidence=false}={}){
  const value=String(draft??"").trim();
  const flags=[];
  if(isObviouslyGarbledResponse(value,task)) flags.push("malformed_or_non_answer");
  if(QUESTION_SHAPE.test(String(task)) && value.split(/\s+/).filter(Boolean).length<=2){
    flags.push("too_short_for_explanatory_question");
  }
  if(requiresEvidence && ABSOLUTE_CLAIM.test(value)) flags.push("absolute_claim");
  if(requiresEvidence && NUMERIC_DETAIL.test(value)) flags.push("specific_measurement");
  if(requiresEvidence && STRONG_CAUSAL.test(value)) flags.push("causal_claim");
  return {
    ok: !flags.includes("malformed_or_non_answer")&&!flags.includes("too_short_for_explanatory_question"),
    needsReview: requiresEvidence || flags.length>0,
    flags
  };
}

export function buildAnswerReviewerPrompt({task="",draft="",evidence="",domain="factual"}={}){
  const sourceBlock=evidence?String(evidence).slice(0,18000):"No external evidence was available. Judge the draft conservatively and do not invent supporting facts.";
  return [
    "You are BHAI X's independent answer-quality reviewer.",
    "Review the proposed answer against the user's question and, when supplied, the evidence.",
    "Your job is to catch hallucinations, wrong terminology, unsupported numbers/thresholds, overconfident causal claims, contradictions, and unsafe medical advice.",
    "Do not reward a confident-sounding answer. A concise uncertain answer is better than a fabricated specific answer.",
    "For medical/health questions, flag diagnosis presented as fact, medication dose/start-stop advice, blanket hydration advice, and emergency claims without adequate basis.",
    "Do not require citations for simple conversational content, but for factual/research answers use the supplied evidence when possible.",
    "Return ONLY a JSON object with this shape:",
    '{"verdict":"PASS|FAIL","issues":["..."],"corrections":["..."]}',
    "",
    "DOMAIN: "+String(domain),
    "QUESTION:",
    String(task).slice(0,8000),
    "",
    "PROPOSED ANSWER:",
    String(draft).slice(0,14000),
    "",
    "EVIDENCE:",
    sourceBlock
  ].join("\n");
}

export function parseReviewerVerdict(text=""){
  const raw=String(text??"").trim();
  const candidates=[];
  const block=raw.match(/\{[\s\S]*\}/);
  if(block)candidates.push(block[0]);
  candidates.push(raw);
  for(const candidate of candidates){
    try{
      const d=JSON.parse(candidate);
      const verdict=String(d?.verdict||"").toUpperCase();
      if(verdict==="PASS"||verdict==="FAIL"){
        return {
          verdict,
          issues:Array.isArray(d.issues)?d.issues.map(String).filter(Boolean):[],
          corrections:Array.isArray(d.corrections)?d.corrections.map(String).filter(Boolean):[]
        };
      }
    }catch{}
  }
  const verdictMatch=raw.match(/\bverdict\s*[:=]\s*\**\s*(PASS|FAIL)\b/i);
  if(verdictMatch){
    return {verdict:verdictMatch[1].toUpperCase(),issues:[],corrections:[]};
  }
  return {verdict:"FAIL",issues:["Reviewer returned no parseable PASS/FAIL verdict."],corrections:["Re-check the answer against evidence and avoid unsupported specifics."]};
}
