# BHAI AI - Skills & Capabilities Manual

Welcome to **BHAI AI**, your practical, Hinglish-speaking personal work agent. This document outlines the current architecture, available skills, tools, DO IT behavior, and the roadmap for the agent skill system.

---

## 🚀 1. Architecture Overview
BHAI AI is built as a full-stack real-time agent system:
- **Frontend (`src/`):** React 18 with Vite, featuring chat history, voice input (SpeechRecognition), file attachment handling, and a live **Task Execution Activity Panel**.
- **Backend (`api/agent.js` & `server.js`):** Node.js handler communicating with Gemini models (supporting Gemini 3.5 Flash-Lite / 1.5 Flash), tool declarations, and recursive tool execution loops (up to 8 rounds).
- **Deployment:** Configured for Vercel Serverless and Node.js (`server.js`).

---

## 🛠️ 2. Current Tools & Capabilities
BHAI AI comes equipped with native tool-use functions:
1. **`web_search`**: Searches the public web via DuckDuckGo HTML parser to fetch real-time information, documentation, and news.
2. **`github_info`**: Retrieves repository metadata, default branches, and status.
3. **`github_read`**: Inspects GitHub repository directory structures and reads file contents.
4. **`github_update`**: Creates or replaces files in a GitHub repository with automatic SHA detection and commit integration.

---

## ⚡ 3. DO IT Behavior & Safety
- **DO IT ON:** Allows the agent to directly execute approved actions, create/update files on GitHub, and perform agentic modifications with automatic commit hashes.
- **DO IT OFF:** Operates in advisory/safe mode where destructive or repository-modifying actions are blocked or require confirmation.
- **Guardrails:** Refuses overly large files (>500KB) and checks permissions before making repository changes.

---

## 📊 4. Live Task Execution System
When a user sends a task, the frontend transitions through a live state machine displayed in the **Activity Panel**:
1. **Planning**: Analyzing user intent and requirements.
2. **Tool Selection**: Choosing appropriate tools (`web_search`, `github_read`, etc.).
3. **Working**: Executing tool calls on backend servers and repositories.
4. **Completed**: Finalizing and rendering the response back to the user.

---

## 🔮 5. Future Skill-System Roadmap
- **Custom Skill Plugins:** Modular JS skill loaders for database queries, code linting, and automated testing.
- **Advanced Memory Integration:** Long-term vector/embedding-based memory across chat sessions.
- **Multi-Agent Collaboration:** Specialized sub-agents for UI design, backend refactoring, and security audits.
- **IDE & Terminal Integration:** Direct terminal command execution and workspace syncing.
