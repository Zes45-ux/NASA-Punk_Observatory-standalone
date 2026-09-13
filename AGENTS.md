# Development and release workflow

This repository uses two release tracks. Treat them as a hard boundary.

## Default development branch

- Start every new Codex task on `codex/sites-deploy` and confirm the checkout before editing.
- Perform normal feature work, fixes, tests, and preview preparation on `codex/sites-deploy`.
- Keep Codex Sites-only artifacts (`.openai/hosting.json` and `dist/`) on `codex/sites-deploy`.
- Do not create additional preview branches unless the user explicitly requests one.

## Preview release

- After completing a development task, run `npm run check:all`.
- Synchronize the validated source into `dist/` when needed.
- Commit and push only the intended changes to `origin/codex/sites-deploy`.
- Publish the validated `dist/` output to the existing Codex Site and return its preview URL for review.

## Production release

- `main` is the only Vercel production branch.
- Never update local `main`, push `origin/main`, or trigger a Vercel production release until the user explicitly approves the reviewed Codex Sites preview.
- After approval, transfer the validated source changes to `main` without Sites-only artifacts, verify the branch diff, run `npm run check:all`, push `origin/main`, and verify the resulting Vercel production deployment.
- Never force-push either release branch.

Preserve unrelated working-tree changes and exclude `.agents/`, `.firecrawl/`, and `ORIGINAL_REQUEST.md` unless the user explicitly asks to include them.
