import {requireSession} from "./_utils.js";
const json=(res,status,data)=>res.status(status).json(data);

export default async function handler(req,res){
 if(req.method!=="POST")return json(res,405,{error:"Method not allowed"});
 if(!await requireSession(req,res))return;

 const {goal="",completed=[],remaining=[]}=req.body||{};
 const g=String(goal).toLowerCase();
 const done=Array.isArray(completed)?completed.map(String):[];
 const left=Array.isArray(remaining)?remaining.map(String):[];
 const suggestions=[];
 const add=s=>{if(s&&!suggestions.includes(s))suggestions.push(s)};

 const isMedia=/image|photo|picture|draw|generate.*image|video|cinematic|render/.test(g);
 const isHealth=/dawai|medicine|tablet|capsule|syrup|dose|symptom|fever|cough|cold|pain|bleeding|pregnan|baby|doctor|hospital|report|blood test|health/.test(g);
 const isSupport=/sad|dukhi|upset|tension|stress|anxious|anxiety|lonely|ro raha|rona|depressed|depression|pareshan|bura lag|mann nahi/.test(g);
 const isProject=/code|app|project|github|repo|deploy|website|server|bug|fix|build|apk/.test(g);

 if(isMedia){
  if(/image|photo|picture|draw|generate.*image/.test(g)) add("Character/style lock ya background consistency chahiye ho to next image mein wahi reference details use kar sakte hain.");
  else add("Video ko next shot mein continue karna ho to same character, camera style aur lighting details lock rakho.");
 }else if(isHealth){
  add("Medicine ya report ke exact naam/strength aur doctor ki prescription ko reference karke hi next step decide karein.");
 }else if(isSupport){
  add("Agar mann ho to jo sabse zyada pareshaan kar raha hai woh seedha batao; usi point se baat continue kar sakte hain.");
 }else if(isProject){
  if(/deploy|website|server/.test(g)) add("Post-deploy health check aur rollback checkpoint verify karna useful rahega.");
  if(/code|app|project|github|repo|bug|fix|build|apk/.test(g)) add("Automated tests aur dependency/security scan release se pehle run karna useful rahega.");
  if(!done.includes("backup") && (left.length>0 || /risk|change|refactor|migration/.test(g))) add("Risky changes se pehle known-good backup/checkpoint rakhna useful rahega.");
  if(left.length===0) add("Final self-audit karke har requested outcome ko verify karna useful rahega.");
 }

 return json(res,200,{ok:true,suggestions:suggestions.slice(0,3)});
}
