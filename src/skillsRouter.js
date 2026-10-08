/**
 * BHAI AI Skill Selector & Router
 * Supports ordered multi-skill chains for complex tasks.
 */
export const SKILLS={GENERAL:"general",GITHUB:"github",WEB_RESEARCH:"web-research",CODING:"coding",FILE:"file",IMAGE:"image",VIDEO:"video",BUILD:"build",AUTOMATION:"automation",HEALTH:"health",SUPPORT:"support"};

const CURRENT_RESEARCH=/search|web|lookup|find online|latest|today|current|news|documentation|research|price|availability|forecast|weather|mausam|garmi|baarish|barish|rainfall|monsoon|temperature|tapman|heatwave|loo|drought|sukha|humidity|flood|baadh|pani.*kam|kam.*pani|is bar|iss bar|is baar|iss baar|is saal|iss saal|this year|this season/;
const VIDEO=/video|clip|animation|animated/;
const IMAGE=/image|photo|picture|draw|poster|illustration|artwork|tasveer|visual/;

export function selectSkillsForTask(taskText=""){
 const text=String(taskText||"").toLowerCase(),skills=[];
 const add=s=>{if(!skills.includes(s))skills.push(s)};
 if(CURRENT_RESEARCH.test(text))add(SKILLS.WEB_RESEARCH);
 if(/dawai|medicine|tablet|capsule|syrup|dose|dosage|side effect|symptom|fever|cough|cold|pain|bleeding|pregnan|baby|doctor|hospital|report|blood test|lab test|health/.test(text))add(SKILLS.HEALTH);
 if(/sad|dukhi|upset|tension|stress|anxious|anxiety|lonely|ro raha|rona|depressed|depression|pareshan|bura lag|mann nahi/.test(text))add(SKILLS.SUPPORT);
 if(/code|fix|bug|implement|refactor|function|component|script|build|error|deploy/.test(text))add(SKILLS.CODING);
 if(/file|directory|folder|read file|create file|list|pdf|document/.test(text))add(SKILLS.FILE);
 if(/github|repo|commit|pull request|branch|repository/.test(text))add(SKILLS.GITHUB);
 if(IMAGE.test(text)&&!VIDEO.test(text))add(SKILLS.IMAGE);
 if(VIDEO.test(text))add(SKILLS.VIDEO);
 if(/apk|android|build app|compile/.test(text))add(SKILLS.BUILD);
 if(/schedule|remind|every day|automate/.test(text))add(SKILLS.AUTOMATION);
 return skills.length?skills:[SKILLS.GENERAL];
}
export function selectSkillForTask(taskText=""){return selectSkillsForTask(taskText)[0];}
export function getSkillPromptContext(skillNames){
 const names=Array.isArray(skillNames)?skillNames:[skillNames],valid=names.filter(Boolean);
 if(!valid.length)return "[Skill Chain: General Agent]";
 return "[Skill Chain: "+valid.join(" → ")+"] Execute the selected skills in this order. Web Research gathers current facts first when needed; Health handles medical-information safety; Support handles empathetic conversation; Coding analyzes/implements; File handles file-level work; GitHub inspects and commits repository changes last; Image handles visual generation; Video handles video generation; Build handles app/build requests; Automation handles scheduled/background tasks; General handles ordinary conversation and broad questions.";
}
