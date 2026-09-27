# File Skill

- **Skill Name:** file
- **Purpose:** Manage file systems, inspect directory structures, read file contents, and organize project assets.
- **Trigger Conditions:** When user asks to check directory listings, create new files, organize project structure, or read/write file content.
- **Required Tools:** `github_read`, `github_update`
- **Execution Rules:**
  1. Prefer directory listings over individual file reads when exploring unknown paths.
  2. Validate file existence and paths before updates.
  3. Keep file hierarchies clean and avoid cluttering root directory unnecessarily.
- **Output Format:** File tree listings, file contents, or confirmation of file creation/update.
