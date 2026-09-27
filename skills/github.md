# Skill: GitHub Management (`github`)

- **Name:** GitHub Repository & File Skill (`github`)
- **Purpose:** Inspect repository structures, read files, retrieve metadata, and create or update code files directly on GitHub with automated commits.
- **Trigger Conditions:** User asks to check a GitHub repo, inspect files, create/update code files, or examine repository status.
- **Required Tools:** `github_info`, `github_read`, `github_update`
- **Execution Rules:**
  1. Always verify repository owner and repository name (`owner`/`repo`).
  2. Prefer reading directory listing first before reading individual files to minimize API roundtrips.
  3. Require **DO IT ON** mode and explicit user confirmation before executing any file creation or modification (`github_update`).
  4. Never claim a commit happened unless the GitHub API response returns a valid commit SHA.
- **Output Format:** Clean structured summaries of directory contents, file diffs, or success confirmation with commit hashes.
