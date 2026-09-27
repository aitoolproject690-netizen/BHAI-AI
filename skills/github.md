# GitHub Skill

- **Skill Name:** github
- **Purpose:** Interact with GitHub repositories to inspect file trees, read code files, fetch repository info, and update/create code files safely.
- **Trigger Conditions:** When user asks to inspect a repo, check file contents, read code, update files, commit changes, or check repository status.
- **Required Tools:** `github_info`, `github_read`, `github_update`
- **Execution Rules:** 
  1. Always verify owner and repo before calling GitHub APIs.
  2. Respect the strict read budget (at most 7 unique `github_read` calls per task).
  3. Require DO IT mode to be ON before executing any file updates or commits.
  4. Always report commit hashes and modified paths on success.
- **Output Format:** JSON responses with repository structure, file contents, or commit confirmation and hash.
