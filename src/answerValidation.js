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
