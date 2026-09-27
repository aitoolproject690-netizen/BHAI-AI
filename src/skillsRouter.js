/**
 * BHAI AI Skill Selector & Router
 * Automatically selects and routes tasks to the most relevant skill based on intent.
 */

export const SKILLS = {
  GITHUB: "github",
  WEB_RESEARCH: "web-research",
  CODING: "coding",
  FILE: "file"
};

export function selectSkillForTask(taskText = "") {
  const text = taskText.toLowerCase();
  
  // GitHub intent
  if (text.includes("github") || text.includes("repo") || text.includes("commit") || text.includes("pull request") || text.includes("branch")) {
    return SKILLS.GITHUB;
  }
  
  // Web Research intent
  if (text.includes("search") || text.includes("web") || text.includes("lookup") || text.includes("find online") || text.includes("latest news") || text.includes("documentation")) {
    return SKILLS.WEB_RESEARCH;
  }
  
  // Coding intent
  if (text.includes("code") || text.includes("fix") || text.includes("bug") || text.includes("implement") || text.includes("refactor") || text.includes("function") || text.includes("component") || text.includes("script")) {
    return SKILLS.CODING;
  }
  
  // File intent
  if (text.includes("file") || text.includes("directory") || text.includes("folder") || text.includes("read file") || text.includes("create file") || text.includes("list")) {
    return SKILLS.FILE;
  }
  
  // Default fallback skill for general tasks
  return SKILLS.CODING;
}

export function getSkillPromptContext(skillName) {
  switch (skillName) {
    case SKILLS.GITHUB:
      return "[Active Skill: GitHub] - Focus on repository inspection, reading, and committing changes safely.";
    case SKILLS.WEB_RESEARCH:
      return "[Active Skill: Web Research] - Focus on fetching real-time web search data and documentation.";
    case SKILLS.CODING:
      return "[Active Skill: Coding] - Focus on writing, refactoring, and debugging clean code.";
    case SKILLS.FILE:
      return "[Active Skill: File Management] - Focus on file tree navigation and file read/write operations.";
    default:
      return "[Active Skill: General Agent]";
  }
}
