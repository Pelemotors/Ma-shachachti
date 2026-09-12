# Smith Dashboard Implementation

## Scope

The Control Center is the operational interface for the Smith control plane. It
does not replace Smith's state machine, jobs, events or security boundaries.
The supplied visual reference guides density, hierarchy and calm visual
character only. Its numbers, users, previews, tests and approvals are not data
fixtures.

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
- `/admin/smith` — Smith Control Center dashboard
- `/admin/smith/events`
- `/admin/smith/previews`
- `/admin/smith/tests`
- `/admin/smith/approvals`
- `/admin/smith/audit`
- `/admin/smith/rollback`
- `/admin/smith/setup`
- `/admin/smith/work-items/[id]`

The first milestone implements the shared Smith shell and dashboard. Deeper
routes may initially show truthful Empty, Disconnected or Not Configured
states, then gain data views without changing their URLs.

## Components

- `SmithControlCenter` — auth/data boundary and refresh behavior
- `SmithHeader` — Admin identity, search state and environment indicators
- `SmithSidebar` — Admin and Smith route navigation
- `SmithIdentityCard` — current persisted job, or “ממתין למשימה”
- `SummaryCards` — five operational summaries
- `SmithChatPanel` — persistent-chat surface; disabled until its API is enabled
- `ObservationPanel` — dense operational timeline
- `PreviewPanel` — latest real Preview or empty/disconnected state
- `TestPanel` — latest SHA-valid test run or empty state
- `ApprovalPanel` — approval request only, never direct deploy
- `AuditPanel` — recent persisted actions

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

## Summary-card data sources

| Card           | Data source                                   | Initial behavior                                            |
| -------------- | --------------------------------------------- | ----------------------------------------------------------- |
| בריאות מערכת   | Existing verified health API; no inferred 98% | `—` until a defined metric exists                           |
| משתמשים פעילים | Existing Admin overview aggregate             | `—` if unavailable                                          |
| תקלות פעילות   | `smith_observations` error/critical records   | `0` only when control plane is connected and query succeeds |
| Preview מוכן   | non-stale `smith_previews` with `ready`       | `—` while provider/control plane is disconnected            |
| ממתין לאישור   | `smith_approvals` with `requested`            | `—` while control plane is disconnected                     |

No sparkline is rendered until a persisted historical series exists.

## Initial truthful states

Panels begin empty:

- Observations: `לא זוהו אירועים חריגים כרגע.`
- Preview: `אין Preview שמוכן לבדיקה.`
- Approval: `אין שינויים שממתינים לאישור.`
- Tests: `עדיין לא הורצה בדיקה עבור עבודה זו.`
- Audit: `אין פעילות להצגה.`
- Chat: `כתוב ל-Smith מה תרצה לבדוק, לשפר או לבנות.`

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
  disconnected states and never queries a missing hosted schema.
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
