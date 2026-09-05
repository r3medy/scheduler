# Calendar and navigation implementation plan

Goal: preserve exact Week-view timestamps, replace native date controls with shadcn Calendar and time inputs, and add Home, callback history, and modal account settings.

Design contract: retain Scheduler's semantic tokens, Figtree, compact controls, and private data model. The supplied sidebar reference overrides the standard shell: reproduce its sculpted black silhouette upright on the left, with Tabler icons and readable labels. Home and History precede a divider; Settings opens a dialog. Keep the calendar dominant and navigation accessible in narrow desktop windows.

- [x] Week view: reproduce late-hour clamping and nearby callback loss; use an exact time anchor with independent collision lanes and footer clearance. Verify 04:50, overlapping times, and 23:59.
- [x] Date entry: install preset-matched shadcn Calendar, expanded inside the modal; share one date/time field across create/edit and both window endpoints. Preserve local-to-UTC conversion, required fields, future validation, conflict reset, and failed submissions.
- [x] Shell: add a shared sidebar to Home and History; provide focus, active route, tooltips, and a skip link.
- [x] History: fetch the authenticated user's closed callbacks with RLS, server pagination and outcome filtering. Show exact all-time closed/reached/voicemail/no-answer counts from surviving records, a compact list, local dates, and existing detail actions. Cover loading, empty and failure states.
- [x] Settings: change the existing six-digit PIN, verifying current credentials with existing rate limiting. Delete only the authenticated account via the server admin client after explicit in-product confirmation; clear session and use existing cascade deletion. Show pending/error/success states.
- [x] Validate: targeted regression and account-action tests, existing suite, typecheck, lint, production build; inspect rendered UI at desktop and narrow widths when available.

Scope note: history uses existing closed records and their reported outcomes; no invented attempt log or performance percentages. No live account is deleted as part of development verification.

Validation: 61 tests pass; lint and TypeScript pass. Production build succeeds with network access for the existing Google Fonts setup. Browser visual QA could not run: no browser provider is available in this session. The nested Base UI popover stalled in the UI test environment; the final date picker uses an expandable in-modal Calendar, and its selection, future-date blocking, UTC submission, edit, and conflict flows pass interaction tests.
