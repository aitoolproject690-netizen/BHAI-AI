/**
 * Canonical request classifier for BHAI X chat/agent entrypoints.
 *
 * One precedence order prevents different endpoints from making different
 * routing decisions for the same user message.
 */
import { solveSimpleMath } from "./simpleMath.js";
import { solveSimpleTime } from "./simpleReasoning.js";
import {
  getCasualReply,
  isCasualIntent,
  isKnowledgeResearchIntent,
  isLocalCodingIntent,
  isMedicalChatIntent,
  isStoryScriptIntent,
  isCharacterCreationIntent,
  isWebResearchIntent,
  detectMediaIntent
} from "./intentRouter.js";

export function classifyUserRequest(text="") {
  const task=String(text||"").trim();
  const media=detectMediaIntent(task);

  if(!task) return {lane:"empty",type:"empty",media};

  if(solveSimpleMath(task)!==null){
    return {lane:"math",type:"math",media};
  }

  const deterministicTime=solveSimpleTime(task);
  if(deterministicTime){
    return {lane:"deterministic",type:"time",deterministicReply:deterministicTime,media};
  }

  if(media.type){
    return {
      lane:"media",
      type:media.type,
      media,
      needsFreshWeb:false
    };
  }

  const deterministicReply=getCasualReply(task);
  if(deterministicReply || isCasualIntent(task)){
    return {
      lane:"conversation",
      type:"conversation",
      deterministicReply,
      media
    };
  }

  if(isMedicalChatIntent(task)){
    return {lane:"medical",type:"medical",media};
  }

  if(isStoryScriptIntent(task)){
    return {lane:"story",type:"story",media};
  }

  if(isCharacterCreationIntent(task)){
    return {lane:"character",type:"character",media};
  }

  // Standalone coding must beat research so code questions are not hijacked
  // into irrelevant web evidence.
  if(isLocalCodingIntent(task)){
    return {lane:"coding",type:"coding",media};
  }

  if(isWebResearchIntent(task)){
    return {lane:"current",type:"current",needsFreshWeb:true,media};
  }

  // Knowledge classification is useful for prompt shaping, not for forcing
  // ordinary stable facts into web search.
  if(isKnowledgeResearchIntent(task)){
    return {lane:"knowledge",type:"knowledge",needsFreshWeb:false,media};
  }

  return {lane:"general",type:"general",needsFreshWeb:false,media};
}

export function isCurrentRequest(text=""){
  return classifyUserRequest(text).lane==="current";
}
