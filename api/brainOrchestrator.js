import { classifyUserRequest } from "../src/requestRouter.js";
import { isCasualIntent, detectMediaIntent } from "../src/intentRouter.js";
import { isAutonomousProductionRequest, isYouTubePublishRequest } from "../src/autonomousProductionEngine.js";
import { routeConversationContext, shouldAutoExecuteTask } from "./contextRouter.js";

export const BRAIN_SCHEMA_VERSION = "2.0";

const clean=(v,n=12000)=>String(v??"").trim().slice(0,n);
const LOCAL_CUES=/\b(?:local|private|offline|phone|mobile|device|apna\s+(?:model|ai)|hamara\s+(?:model|ai)|cloud\s+ke\s+bina|internet\s+ke\s+bina)\b/i;

function explicitMutation(text=""){
  return /\b(?:create|make|build|bana|banado|ban[aā]o|fix|repair|update|modify|change|write|commit|push|delete|remove|deploy|publish|ship|release|run|execute|verify|test)\b/i.test(String(text||""));
}

function explicitGithub(text=""){
  return /\b(?:github|git\s*hub|repo(?:sitory)?)\b/i.test(String(text||""));
}

function buildTools(task,classifier){
  const autonomous=isAutonomousProductionRequest(task);
  const youtube=isYouTubePublishRequest(task);
  const media=classifier.media||detectMediaIntent(task);
  if(autonomous) return ["story","characters","visuals","videos","post-production","render",...(youtube?["youtube"]:[])];
  if(youtube) return ["youtube","final-output-verifier"];
  if(media.type==="image") return ["image"];
  if(media.type==="video") return ["video"];
  if(classifier.lane==="current") return ["web-search","evidence-verifier"];
  if(classifier.lane==="medical") return ["medical-safety","evidence-verifier"];
  if(classifier.lane==="coding") return ["coding"];
  if(explicitGithub(task)&&explicitMutation(task)) return ["github","preflight","verify"];
  if(classifier.lane==="math"||classifier.lane==="deterministic") return ["deterministic-reasoning"];
  if(classifier.lane==="conversation") return ["conversation"];
  return ["chat-general"];
}

export function buildBrainPlan({messages=[],task=""}={}){
  const latest=clean(task);
  const safeMessages=Array.isArray(messages)?messages:[];
  const request=classifyUserRequest(latest);
  const context=routeConversationContext(safeMessages,latest);
  const autonomous=isAutonomousProductionRequest(latest);
  const youtube=isYouTubePublishRequest(latest);
  const casual=isCasualIntent(latest);
  const mutation=explicitMutation(latest);
  const github=explicitGithub(latest);
  const mobilePreferred=Boolean(LOCAL_CUES.test(latest) || request.lane==="conversation" || request.lane==="general");
  const autoExecute=Boolean(!casual && (autonomous || youtube || (github&&mutation) || shouldAutoExecuteTask(latest)));
  const proofRequired=Boolean(autoExecute && (autonomous || youtube || (github&&mutation)));
  const tools=buildTools(latest,request);
  const mode=autonomous?"autonomous_production":youtube?"youtube_publish":context.mode;
  return {
    schemaVersion:BRAIN_SCHEMA_VERSION,
    latest,
    mode,
    lane:request.lane,
    type:request.type,
    request,
    context,
    signals:{
      autonomous,
      youtubePublish:youtube,
      casual,
      mutation,
      github,
      mobilePreferred,
      autoExecute,
      proofRequired
    },
    tools,
    directive: proofRequired
      ? "Execute the selected tools in order, verify each required output, and never claim DONE without proof."
      : autoExecute
        ? "Choose the minimum tools needed, execute the task, and report the real result."
        : "Answer or assist directly; do not invent execution that did not happen."
  };
}

export function brainSummary(plan){
  const p=plan||{};
  return [
    "BRAIN v"+BRAIN_SCHEMA_VERSION,
    "mode="+String(p.mode||"unknown"),
    "lane="+String(p.lane||"unknown"),
    "tools="+(Array.isArray(p.tools)?p.tools.join(" → "):"none"),
    "context="+String(p.context?.mode||"none"),
    "mobilePreferred="+String(Boolean(p.signals?.mobilePreferred)),
    "autoExecute="+String(Boolean(p.signals?.autoExecute)),
    "proofRequired="+String(Boolean(p.signals?.proofRequired))
  ].join(" | ");
}
