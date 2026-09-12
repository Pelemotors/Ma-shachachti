# Smith Dashboard Implementation

## Scope

The Admin Control Center is an operational interface for the existing
application and is available independently of the future Smith control plane.
It reuses real Admin APIs for users, tasks, health, AI and activity. Smith
remains a visible but disabled future capability; it is not the source of the
dashboard's application data.

`SMITH_CONTROL_ENABLED` controls only Smith-specific autonomous capabilities.
It must not disable Admin metrics or deterministic diagnostics.

## Existing code reused

- Admin authentication: `authorizeAdmin` in `lib/server-auth.ts`
- Browser authorization: `authFetch` in `lib/supabase-browser.ts`
- Server error pattern: `adminJsonError` in `lib/admin-api.ts`
- Existing Admin users, activity, AI and health APIs
- Root RTL and Heebo configuration in `app/layout.tsx`
- Existing `/admin` denied/login/loading behavior

The user-facing `components/chat-app.tsx` is not refactored for Smith.

## Route structure

- `/admin` — existing Administration UI
- `/admin/smith` — operational Admin Control Center
- `/admin/smith/events` — events and incidents
- `/admin/smith/tests` — manual system checks
- `/admin/smith/audit` — recent admin/system activity
- `/admin/smith/setup` — connection and intentional-off states
- `/admin/smith/previews`, `/approvals`, `/rollback` — real routes that
  render a truthful “לא הוגדר עדיין” / DISCONNECTED state

Smith Agent, Preview and ProductionExecutor remain explicitly OFF or
DISCONNECTED. Those routes must not 404.

## Components

- `SmithControlCenter` — Admin auth/data boundary and coordinated refresh
- `SummaryCards` — real health, user, task, incident and AI metrics
- `DiagnosticsPanel` — explicit server-side checks with timestamps and results
- `AgentOffPanel` — truthful disabled Smith Agent surface
- `EventsPanel` — real `activity_events`, without attributing them to Smith
- `ServicePanel` — DB/Auth/OpenAI/Storage/Push/Cron state
- `TestPanel` — committed local evidence or a newly executed local result
- `PreviewApprovalPanel` — explicitly disconnected autonomous boundaries
- `AuditPanel` — recent real Admin/application activity

## Layout

- Desktop header: 60px
- Desktop sidebar: 196px
- Workspace padding: 24–28px
- At 1400px and above: Chat 43%, operations 57%
- At 1200–1399px: summaries wrap 3+2
- At 768–1199px: collapsible navigation, two-column summaries, Chat full width
- Below 768px: drawer navigation, one/two-column summaries, stacked panels,
  44px touch targets and no horizontal page scroll

## Visual tokens

Tokens are scoped to `.smith-admin` and follow the Master Plan:

- near-white blue/green background
- white surfaces
- navy text
- teal Smith identity and success
- blue Preview/Test
- yellow warning
- red only for actual failures

Technical identifiers use LTR, left-aligned monospace. Motion respects
`prefers-reduced-motion`.

## Operational data sources

- system health and DB latency: `/api/admin/health`
- active and pending users: `/api/admin/overview` and `/api/admin/users`
- task totals: `/api/admin/tasks`
- AI attempts, failures and latency: `/api/admin/ai`
- recent events and audit activity: `/api/admin/overview` and
  `/api/admin/activity`

Missing metrics render as `אין נתונים`; numbers are never synthesized.

## Initial truthful states

The Admin Control Center is active. Smith Agent, autonomous chat, autonomous
runner, autonomous Preview creation and ProductionExecutor remain off.
Operational-event wording does not claim that Smith detected an event.

Integrations begin:

- GitHub: Disconnected
- Vercel Preview: Disconnected
- hosted Test environment: Not configured
- Local Security POC: Passed, local only
- Playwright: Not configured
- Production Gate: Disconnected

An integration may move from Disconnected only after a server-side verification,
never because an environment variable merely exists. Intermediate wiring uses
`Partial`.

## API and security

- `GET /api/admin/smith/overview` requires `authorizeAdmin`.
- When `SMITH_CONTROL_ENABLED` is not exactly `true`, it returns only empty and
  disconnected Smith-specific states. Existing Admin data continues loading.
- `POST /api/admin/diagnostics/[check]` accepts only a compile-time allowlist,
  requires `authorizeAdmin`, and exposes no command or argument input.
- Unit/integration and Playwright execution is available only when
  `NODE_ENV=development`; it uses exact `npm` arguments, no shell, a timeout,
  bounded output and a reduced environment.
- Remote-safe diagnostics are read-only. They verify DB, Auth, Admin APIs,
  OpenAI model access, Storage metadata and Push/Reminder telemetry without
  mutating Production.
- Control-plane reads use a server-only client after Admin authorization.
- Regular users and `smith_test` have no schema usage.
- Mutations return `503 Not configured` until their backing control plane is
  enabled and verified.

## Dependencies

- `smith_control`: locally implemented; hosted state remains disconnected
- `smith_test`: Local POC passed; hosted state remains not configured
- GitHub App: not configured
- Vercel provider: not configured
- Playwright runner: not configured
- Production Gate: deliberately disconnected

## Accessibility

- semantic landmarks/headings/tables
- visible keyboard focus
- status text in addition to color
- accessible names for icon controls
- focus-managed dialogs when introduced
- Escape closes overlays
- RTL document semantics with LTR technical values
