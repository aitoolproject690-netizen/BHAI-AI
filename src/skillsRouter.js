/**
 * BHAI AI Skill Selector & Router
 * Supports ordered multi-skill chains for complex tasks.
 */
export const SKILLS={GITHUB:"github",WEB_RESEARCH:"web-research",CODING:"coding",FILE:"file"};
export function selectSkillsForTask(taskText=""){
 const text=taskText.toLowerCase(),skills=[];
 const add=s=>{if(!skills.includes(s))skills.push(s)};
 if(text.includes("search")||text.includes("web")||text.includes("lookup")||text.includes("find online")||text.includes("latest")||text.includes("documentation")||text.includes("research"))add(SKILLS.WEB_RESEARCH);
 if(text.includes("code")||text.includes("fix")||text.includes("bug")||text.includes("implement")||text.includes("refactor")||text.includes("function")||text.includes("component")||text.includes("script")||text.includes("build"))add(SKILLS.CODING);
 if(text.includes("file")||text.includes("directory")||text.includes("folder")||text.includes("read file")||text.includes("create file")||text.includes("list"))add(SKILLS.FILE);
 if(text.includes("github")||text.includes("repo")||text.includes("commit")||text.includes("pull request")||text.includes("branch")||text.includes("repository"))add(SKILLS.GITHUB);
 return skills.length?skills:[SKILLS.CODING];
}
export function selectSkillForTask(taskText=""){return selectSkillsForTask(taskText)[0];}
export function getSkillPromptContext(skillNames){
 const names=Array.isArray(skillNames)?skillNames:[skillNames],valid=names.filter(Boolean);
 if(!valid.length)return "[Skill Chain: General Agent]";
 return "[Skill Chain: "+valid.join(" → ")+"] Execute the selected skills in this order. Web Research gathers current facts first when needed; Coding analyzes/implements; File handles file-level work; GitHub inspects and commits repository changes last.";
}
