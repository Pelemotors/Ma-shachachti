# Project instructions

- This is Ma-shachachti, an independent project. Never use REMATCHER repositories, keys, databases, production URLs or real household data in fixtures.
- Keep all UI copy in Hebrew, use RTL and accessible labels, maintain Heebo and the plum/rose/cream design tokens.
- Keep responses short, warm and practical. Agent instructions must ship in the production bundle (see `docs/AI_CHAT_RELIABILITY.he.md` R02); changing instructions requires checking behavioral examples.
- **P0 before new features:** AI Chat Reliability. Deploy is not done on Vercel READY / build PASS / `/api/health` 200 alone — only when production chat smoke passes. Always-on principles: `.cursor/rules/ai-chat-reliability.mdc`. Full plan R01–R30: `docs/AI_CHAT_RELIABILITY.he.md`.
- All user data is private. Auth is verified on the server via Supabase getUser. RLS owns authorization. Never expose service-role, OpenAI, VAPID-private or cron secrets to browser code.
- All engines consume the same canonical AppState. Do not create parallel AI task lists. Validate every action with Zod and lib/engine.ts. Do not execute raw model-generated SQL or code.
- Preserve the nine approved decisions in docs/PRODUCT.he.md. Unknown is not false, maybe is not commitment, no-report is not incomplete, and not-today does not change a due date.
- Use explicit transaction revisions. Never overwrite a conflict silently. Report success only after persistence returns successfully. Chat revision conflicts must not discard the AI reply — revalidate actions against latest state instead.
- External adapters fail closed. Keep local demonstration clearly labelled and separate from authenticated cloud data. Never silently switch to demo when cloud storage fails.
- No destructive or broad AI action without explicit confirmation. The model cannot change consent, permissions or conversation history.
- Test changes affecting engine rules, authorization, state synchronization or external calls. Required gate: npm test, npm run typecheck, npm run build.
- Treat database/schema.sql as initial installation for a new dedicated project. For later schema changes use versioned migrations and verify against the target database before applying. Prefer EXPAND → deploy → verify → CONTRACT.
- Do not deploy unless authorized. A code push may trigger an existing external deployment, so inspect repository/project linkage before release work.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
