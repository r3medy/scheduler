# Callback Rescheduling Web App — Product Requirements Document

## September 5 navigation update

The latest approved request replaces the original primary navigation with Home at `/`, Callback history at `/history`, and Settings in a modal. History shows closed callbacks, reported outcomes, outcome filters, pagination, and factual all-time counts of surviving records. Settings supports changing the existing six-digit sign-in PIN and permanently deleting the authenticated user's account and callbacks after confirmation and current-PIN verification. Earlier page descriptions below remain background context where they differ from this update.

## 1. Document Purpose and Status

**Status:** Approved product requirements baseline, ready for implementation handoff
**Product:** Private callback scheduling and rescheduling web application
**Primary user:** Individual call-center agent
**Deployment context:** One agency
**Target stack:** Next.js, TypeScript, Supabase, Tailwind CSS v4, Zustand, and shadcn/ui

This document defines the approved product scope, workflows, domain rules, privacy constraints, security requirements, and acceptance criteria for the callback rescheduling web app.

Unless a requirement is explicitly labeled **Deferred** or **Open**, it is an accepted product decision. Deferred details must not be treated as permission to expand the product scope or introduce additional roles, workflows, integrations, analytics, or design-system decisions.

This document intentionally does not define a visual design system. Use of Tailwind CSS v4 and shadcn/ui establishes implementation technologies, not an approved visual language.

---

## 2. Product Summary

The product replaces unstructured callback reminders stored in Teams messages, email notes, and similar personal locations with a private, structured callback tracker.

An agent creates a callback containing the customer and account details needed to make the call, schedules it for an exact time or a time window, receives one browser/native notification when the callback becomes due, and records an outcome. If the customer is not reached, the agent can close the callback or reschedule it while preserving a compact history of prior attempts on the same callback.

Each callback belongs exclusively to the authenticated agent who created it. The product has no shared queue, reassignment, team visibility, supervisor role, administrator role, or agency-wide calendar.

The product records agent-entered information only. It does not integrate with telephony systems and cannot prove that a call occurred.

---

## 3. Problem Statement

Call-center agents currently record promised customer callbacks in unstructured places such as:

- Teams messages
- Email notes
- Personal notes
- Other informal reminder mechanisms

These methods make callbacks difficult to organize, prioritize, reschedule, and reliably retrieve. Important callbacks may become buried or forgotten, and agents do not have a consistent view of what is due next.

The product addresses this problem by providing each agent with a private, structured place to:

- Capture a callback quickly
- See what must be called next
- Distinguish scheduled, currently due, and overdue work
- Record unsuccessful attempts
- Reschedule without losing the context of prior attempts
- Find previously entered callbacks that still exist

The product is an organization and reminder tool. It is not a workforce performance system, compliance record, CRM, or proof-of-contact system.

---

## 4. Users, Roles, and Ownership

### 4.1 Primary user

The only application role is an individual call-center agent.

An agent can:

- Create an account using a company ID and six-digit PIN
- Create callbacks
- View only their own callbacks
- Edit any of their callbacks at any time
- Record callback outcomes
- Reschedule unsuccessful callbacks
- Permanently delete any of their callbacks at any time
- View workload summaries based only on their own existing records
- Manage applicable PIN and notification settings

### 4.2 Callback ownership

Every callback is owned only by the authenticated Supabase user who created it.

Ownership is not transferable. The product does not support:

- Reassigning a callback
- Sharing a callback
- Assigning a callback to another agent
- Placing a callback in a shared queue
- Viewing another agent's callbacks
- Team calendars
- Supervisor visibility
- Administrator visibility
- Agency-wide workload views

Every protected callback query and mutation must enforce ownership through Supabase Row Level Security, not merely through client-side filtering.

### 4.3 Agency and tenant scope

The product is intended for one agency, but agency or tenant modeling is explicitly excluded.

The data model must not add:

- `organization_id`
- `agency_id`
- Tenant membership tables
- Organization switching
- Tenant-level permissions
- Agency-level reporting

The authenticated Supabase user is the only ownership boundary required for product data.

---

## 5. Goals and Success Criteria

### 5.1 Primary goal

Give individual agents a reliable, private, structured alternative to recording callbacks in Teams messages, email notes, and similar unstructured locations.

### 5.2 Primary success criterion

After one month, agents use this product rather than Teams messages, email notes, or similar informal methods to record and manage callbacks.

The primary measure of success is organization and adoption, not agent performance.

Evidence of success may include:

- Agents consistently creating callbacks in the product
- Agents returning to the product to manage due and overdue callbacks
- Agents using rescheduling and outcome recording rather than creating disconnected notes
- Qualitative confirmation that the product has replaced Teams/email callback notes in normal work

No numerical adoption threshold has been approved. Defining a formal adoption target is outside the current requirements.

### 5.3 Secondary goals

- Make callback capture fast from anywhere in the authenticated application
- Keep the next required action visible
- Make exact-time and time-window scheduling understandable
- Preserve useful context when an unsuccessful callback is rescheduled
- Protect customer information from cross-agent access
- Keep workload summaries factual and limited to records that still exist

### 5.4 Explicitly excluded success measures

The product must not introduce or imply:

- Productivity scores
- Agent rankings
- Performance grades
- Outcome percentages used for evaluation
- Team comparisons
- Compliance scores
- Proof that calls occurred
- Proof that an agent met a callback commitment
- Audit-quality historical reporting

---

## 6. Product Principles

### 6.1 Private by default

An agent sees and manages only their own records. Privacy must be enforced by Supabase RLS at the database boundary.

### 6.2 Fast capture

Creating a callback must be available from every authenticated application page through a global **New Callback** dialog or modal.

### 6.3 Next action first

The product should center the work that needs attention next, with overdue callbacks taking priority over later work.

### 6.4 Structured but manual

The product provides a consistent schedule, outcome, and history structure, but all information is manually entered by the agent.

### 6.5 Self-contained callbacks

Each callback is an independent record. Customer and account information is stored directly on the callback and is not converted into reusable customer, contact, or account entities.

### 6.6 Accurate claims

The product must accurately describe its data as agent-reported. It must not present manually entered outcomes as telephony evidence, compliance evidence, or reliable performance evidence.

### 6.7 Minimal role and tenancy complexity

The product has one user role and one ownership rule. Team collaboration, supervisory features, administration, and tenant modeling are out of scope.

### 6.8 Desktop-focused without fixed-width assumptions

The product is not supported on phones, but it must remain usable while an agent frequently resizes a desktop browser, including into narrow desktop windows.

---

## 7. Technology and Source-of-Truth Requirements

The approved stack is:

- **Next.js**
- **TypeScript**
- **Supabase**
- **Tailwind CSS v4**
- **Zustand**
- **shadcn/ui**

### 7.1 Supabase responsibilities

Supabase is the authoritative source for:

- Authentication identity
- Callback records
- Attempt-history records
- Protected server data
- Ownership enforcement through mandatory RLS

### 7.2 Zustand responsibilities

Zustand may be used for transient client-side or interface state, such as:

- Whether the global New Callback dialog is open
- Current calendar view selection
- Temporary filters
- Other non-authoritative UI state

Zustand must not be the source of truth for protected callback data. Client state must never replace Supabase ownership checks or RLS.

### 7.3 Mandatory Row Level Security

RLS must be enabled for every table containing callback or attempt-history data before the application is considered releasable.

Client-side query filters such as `user_id = currentUserId` may be used for efficiency, but they are not a security control and do not replace RLS.

---

## 8. Information Architecture

The authenticated application may have a maximum of four primary application pages.

Authentication screens are outside this four-page limit.

### 8.1 Dashboard

The Dashboard is the primary work surface. It must contain:

- Workload counters or a simple workload visualization
- A prioritized action list
- A full seven-day hourly time-grid calendar matching the approved weekly inspiration concept
- Access to the global New Callback dialog

The prioritized action list must center what should be called next. The required priority order is:

1. Overdue
2. Currently due or in the grace period
3. Other callbacks scheduled today
4. Upcoming callbacks

Exact section labels, tie-breaking behavior, and whether adjacent groups are visually combined may be refined during implementation, but the priority order must remain accurate.

### 8.2 Calendar

The Calendar page provides focused calendar use through:

- Monthly calendar view
- Weekly calendar view

Calendar callbacks must use the point-marker behavior defined in this document. Calendar views must not use duration blocks for callback windows.

### 8.3 Callbacks

The Callbacks page provides:

- A searchable callback list
- Useful filters
- Access to callback details
- Access to compact attempt history
- Structured schedule editing
- Outcome actions
- Permanent deletion

Callback detail may be displayed within the Callbacks page through a detail surface, route state, panel, or modal without creating a fifth primary application page.

The required list view is fulfilled through this page. Collectively, the product provides monthly, weekly, and list-based ways to view callbacks.

### 8.4 Settings

The Settings page provides applicable controls for:

- Agent profile information
- PIN changes
- Browser notification permission or notification status
- Notification guidance when permission is unavailable or denied

The PIN recovery or reset flow is deferred and must not be invented as part of the initial implementation without product approval.

### 8.5 Global New Callback entry point

A global **New Callback** action must be available from every authenticated application page:

- Dashboard
- Calendar
- Callbacks
- Settings

It must open a dialog or modal rather than requiring the agent to navigate to a separate fifth application page.

Authentication screens do not need to expose this action.

### 8.6 Prohibited navigation concepts

The application must not introduce:

- A Kanban page
- A board view
- Team navigation
- Supervisor navigation
- Administration navigation
- Customer-directory navigation
- Shared-calendar navigation

---

## 9. Callback Creation Requirements

### 9.1 Required fields

Every callback must include:

- Callback phone number
- Account number
- Account-holder name
- Scheduling mode
- Scheduling details required by the selected mode

### 9.2 Optional field

- Additional comments

### 9.3 Scheduling modes

The agent must choose one of two scheduling modes:

1. **Exact time**
2. **Time window**

For exact scheduling, the callback has one date and time.

For time-window scheduling, the callback has:

- Window start date and time
- Window end date and time

The window end must be later than the window start.

When creating or editing a callback, the exact time or window start must be
in the future at submission. Both the form and server enforce this rule.
Existing past or overdue callbacks remain viewable.

### 9.4 Timezone handling

All persisted schedule timestamps must be stored in UTC.

Schedule entry and display must use the agent device's local timezone. Agents and customers are assumed to share a timezone.

The product does not require:

- Customer-specific timezone selection
- Agent profile timezone configuration
- Cross-timezone coordination

If the device timezone changes, persisted UTC values remain unchanged and display is based on the device timezone in use when the callback is viewed.

### 9.5 Creation behavior

When the agent submits a valid callback:

- The callback must be assigned to the authenticated Supabase user.
- The callback must be created in the open lifecycle state.
- The schedule must be persisted in UTC.
- The callback must appear in the relevant workload, list, and calendar surfaces.
- Any detected schedule conflict must produce a warning but must not prevent creation.

If persistence fails, the interface must not tell the agent that the callback was saved successfully.

---

## 10. Scheduling, Grace, and Overdue Rules

Grace and overdue states are derived from the current time and current callback schedule. They do not need to be persisted as independent lifecycle statuses.

Derived schedule states apply to callbacks that remain open. A closed callback is not shown as overdue.

### 10.1 Exact-time callback

Let `T` be the exact scheduled timestamp.

- **Before due:** Current time is before `T`.
- **Due/grace period:** Current time is at or after `T` but before `T + 5 minutes`.
- **Overdue:** Current time is at or after `T + 5 minutes`.

The notification trigger is `T`.

### 10.2 Time-window callback

Let `S` be the window start and `E` be the window end.

- **Before due:** Current time is before `S`.
- **Active window/due now:** Current time is at or after `S` and at or before `E`.
- **Grace period:** Current time is after `E` but before `E + 5 minutes`.
- **Overdue:** Current time is at or after `E + 5 minutes`.

The notification trigger is `S`.

A time-window callback does not become overdue five minutes after its start. It becomes overdue five minutes after its window end.

### 10.3 Conflict detection

Schedule conflicts are warning-only. The agent must always be allowed to continue after seeing a conflict warning.

Conflict checks apply to the authenticated agent's existing open callbacks.

A conflict exists when:

- Two exact-time callbacks have the same timestamp.
- An exact-time callback falls at or within another callback's time window.
- Two time windows overlap.

For precise interval comparison, windows may be treated as inclusive at their start and end. Two windows conflict when:

- The first window starts at or before the second window ends, and
- The second window starts at or before the first window ends.

A conflict warning must not:

- Disable submission
- Require rescheduling
- Automatically move a callback
- Prevent editing
- Create a shared scheduling constraint

### 10.4 Schedule editing

Agents may edit the schedule of any callback at any time through a structured form.

Schedule editing must not use:

- Drag and drop
- Calendar event resizing
- Direct duration manipulation on a calendar

If an open callback is edited to a future schedule, its due and overdue state must be recalculated from the new schedule.

Attempt history is not a general audit log for every direct edit. It is specifically required to preserve unsuccessful call attempts and the previous schedule when an attempt causes rescheduling.

---

## 11. Calendar Rendering Rules

All callbacks must render as point or marker events, never as duration blocks.

This rule applies to:

- Dashboard seven-day hourly grid
- Calendar weekly view
- Calendar monthly view
- Any other calendar-derived surface

### 11.1 Exact callback marker

An exact-time callback:

- Has one marker at its exact timestamp
- Represents no duration

### 11.2 Time-window callback marker

A time-window callback:

- Has one marker at the window start
- Is labeled with the full time range
- Does not stretch from the window start to the window end
- Becomes overdue based on the window end, not the marker position

For example, a window from 2:00 PM to 3:30 PM appears as one marker at 2:00 PM with a label that communicates the complete 2:00–3:30 PM range.

### 11.3 Calendar interaction

Selecting a callback from a calendar must open or lead to its callback detail and structured edit form.

The calendar must not support:

- Dragging callbacks to reschedule
- Resizing callbacks
- Rendering a time window as a duration block
- Kanban-like columns or cards

### 11.4 Privacy in calendar labels

The full account number must never appear in calendar labels. If an account reference appears, it must be masked.

---

## 12. Notification Requirements

### 12.1 Notification technology

The product must use the browser Notification API to produce a native browser/operating-system notification, including native Windows notification behavior where supported.

The operating assumption is that the application remains open during the agent's shift.

The product does not require:

- A service worker
- Web push
- Background push delivery
- Mobile push notifications
- Notifications while the website is fully closed
- A background mobile application

### 12.2 Permission request

The application must request browser notification permission.

The Settings page must show applicable notification permission or status controls so the agent can understand whether native notifications are available.

Exact permission-prompt timing and presentation are implementation details, subject to browser requirements.

### 12.3 Trigger timing

For an exact-time callback, one notification is triggered at the exact scheduled timestamp.

For a time-window callback, one notification is triggered at the window start.

A notification must not be repeatedly sent during the grace period or while the callback remains overdue.

### 12.4 Rescheduled callbacks

A rescheduled callback establishes a new scheduled occurrence. The new occurrence is eligible for one notification at its new exact time or window start.

The prior occurrence must not generate repeated notifications after rescheduling.

"One notification only" therefore means one notification per scheduled occurrence, not one notification for the entire lifetime of a callback that may be rescheduled several times.

### 12.5 Notification content and PII

Native notification content must be generic.

Approved example:

> Callback due now

Native notifications must not contain:

- Customer name
- Phone number
- Account number
- Additional comments
- Attempt notes
- Any other customer-identifying information

### 12.6 Permission denied or unavailable

If native notification permission is denied, blocked, or unsupported, the expected fallback is an in-app due indication while the authenticated application is open.

The fallback may use a prominent in-app alert, due-state indicator, or equivalent authenticated interface treatment. Its exact visual presentation is deferred.

This fallback is not:

- External push
- Background delivery
- A service-worker notification
- A guarantee that the agent will be alerted when the application is closed

The product must communicate that native notifications are unavailable rather than implying that background notifications will still occur.

### 12.7 Closed or sleeping device behavior

If the browser or computer was closed or asleep at the notification trigger time:

- Do not send a late notification when the agent returns.
- Recalculate the callback's state from the current time.
- Show the callback as overdue if it has passed the applicable overdue threshold.
- If it has not yet passed that threshold, show its accurate current due, active-window, or grace state.
- Do not replay the missed notification.

### 12.8 Multiple simultaneous tabs

The product must avoid duplicate native notifications when the application is open in multiple tabs.

The exact cross-tab coordination mechanism is deferred. Regardless of implementation, the observable requirement is no more than one native notification for the same callback schedule occurrence.

---

## 13. Callback Outcome and Rescheduling Workflow

### 13.1 Standard workflow

The approved end-to-end workflow is:

1. The agent creates a callback with required customer, account, and scheduling details.
2. At the exact scheduled time or start of the scheduled window, the product sends one native browser/OS notification if permission is available and the app can send it at that time.
3. The applicable five-minute grace rule is applied.
4. The callback becomes overdue according to its exact-time or window-end threshold.
5. The agent selects **Mark completed** when the customer is reached.
6. If the customer is not reached, the agent records **Voicemail** or **No answer**.
7. For Voicemail or No answer, the agent chooses either:
   - Close the callback, or
   - Reschedule the callback
8. Rescheduling keeps the same callback and appends a compact attempt-history entry.
9. The agent may edit or permanently delete the callback at any time.
10. Workload and history reporting includes only records that currently exist.

### 13.2 Mark completed

**Mark completed** has one specific meaning:

- The customer was reached.

It must:

- Close the callback
- Record the final outcome as `reached`
- Record when the callback was closed
- Remove the callback from open, due, and overdue workload
- Preserve prior unsuccessful attempt history if one exists

Mark completed must not be used as a generic action for Voicemail or No answer.

### 13.3 Voicemail

When the outcome is Voicemail, the agent must choose:

- **Close:** The callback is closed with `voicemail` as its final outcome.
- **Reschedule:** An attempt is appended with `voicemail` as the attempt outcome, the callback remains open, and the callback receives a new exact or window schedule.

### 13.4 No answer

When the outcome is No answer, the agent must choose:

- **Close:** The callback is closed with `no_answer` as its final outcome.
- **Reschedule:** An attempt is appended with `no_answer` as the attempt outcome, the callback remains open, and the callback receives a new exact or window schedule.

### 13.5 Attempt history

The compact attempt history must support:

- Attempt timestamp
- Outcome
- Optional attempt note
- Whether the attempt caused rescheduling
- Previous scheduled timing when the attempt caused rescheduling

When a Voicemail or No answer outcome is recorded, the resulting attempt context must remain understandable. For rescheduled attempts, the history must preserve the schedule that applied to that attempt before the callback receives its new schedule.

For a prior exact schedule, history must preserve the prior exact timestamp.

For a prior time-window schedule, history must preserve:

- Prior window start
- Prior window end

Attempt history is append-only while its parent callback exists. It is not editable as an audit trail.

Permanently deleting the parent callback also removes its associated attempt history. Consequently, attempt history is not audit-quality.

### 13.6 Same callback during rescheduling

Rescheduling must update the existing callback rather than creating a separate callback or reusable customer record.

The callback retains:

- Its identity
- Customer and account details
- Additional comments
- Prior attempt history

The callback receives:

- A new scheduling mode and schedule
- A new future notification opportunity for the new scheduled occurrence
- A recalculated derived due/overdue state

### 13.7 Editing and deletion

An agent may edit or permanently delete any callback they own at any time, including an open, overdue, or closed callback.

Deletion is permanent from the product perspective.

After deletion:

- The callback must no longer appear in lists, calendars, searches, or details.
- Its attempt history must no longer be available.
- It must no longer contribute to workload or completed-today metrics.
- The product must not imply that deleted information remains represented in reporting.

Record retention and backup behavior outside the application's active data model is deferred.

---

## 14. Domain Model

### 14.1 Separation of lifecycle and outcome

Lifecycle state and call outcome must be modeled separately.

#### Lifecycle concepts

- `open`: The callback remains actionable and may be scheduled, due, in grace, or overdue.
- `closed`: The callback no longer requires action.

The interface may use accurate user-facing wording such as Scheduled/Open and Completed/Closed, but lifecycle state must not be overloaded with temporal or outcome concepts.

#### Derived temporal concepts

The following are derived from schedule, lifecycle, and current time rather than necessarily persisted:

- Before due
- Active window
- Due now
- Grace period
- Overdue

#### Outcome concepts

- `reached`
- `voicemail`
- `no_answer`

An open callback may have prior unsuccessful attempt outcomes without having a final resolution outcome.

A closed callback has a final outcome:

- `reached` after Mark completed
- `voicemail` after an unsuccessful attempt is closed
- `no_answer` after an unsuccessful attempt is closed

### 14.2 Self-contained callback model

Every callback stores its own:

- Phone number
- Account number
- Account-holder name
- Comments
- Current schedule
- Lifecycle state
- Final outcome, if closed

The product must not create a reusable customer or account entity.

Two callbacks containing the same name, phone number, or account number remain independent records.

The product does not perform:

- Customer deduplication
- Customer merging
- Account deduplication
- Customer lookup across records
- Account lookup across records
- Cross-callback customer history
- CRM synchronization

---

## 15. Conceptual Data Model

The following model is conceptual. Exact SQL types, indexes, constraints, and generated column choices belong to implementation, provided the product behavior and security requirements remain unchanged.

### 15.1 `callbacks`

| Field | Purpose |
|---|---|
| `id` | Unique callback identifier |
| `user_id` | Authenticated Supabase user who owns the callback |
| `phone_number` | Manually entered callback phone number |
| `account_number` | Manually entered full account number |
| `account_holder_name` | Manually entered account-holder name |
| `comments` | Optional additional comments |
| `schedule_mode` | `exact` or `window` |
| `scheduled_at` | UTC timestamp for exact scheduling; otherwise null |
| `window_start_at` | UTC window start; otherwise null |
| `window_end_at` | UTC window end; otherwise null |
| `lifecycle_state` | `open` or `closed` |
| `resolution_outcome` | Null while unresolved; otherwise `reached`, `voicemail`, or `no_answer` |
| `closed_at` | UTC timestamp at which the callback was closed |
| `created_at` | Creation timestamp |
| `updated_at` | Last callback update timestamp |

Schedule constraints must ensure:

- Exact mode has one `scheduled_at` value and no active window values.
- Window mode has `window_start_at` and `window_end_at`.
- Window end is later than window start.
- A callback cannot simultaneously have an active exact schedule and active window schedule.

Notification coordination metadata may be added if required to guarantee one notification per schedule occurrence, but the exact mechanism is deferred.

### 15.2 `callback_attempts`

| Field | Purpose |
|---|---|
| `id` | Unique attempt identifier |
| `callback_id` | Parent callback |
| `attempted_at` | UTC timestamp for the manually reported attempt |
| `outcome` | `voicemail` or `no_answer` for the unsuccessful-attempt workflow |
| `note` | Optional attempt-specific note |
| `caused_rescheduling` | Whether the callback was rescheduled after this attempt |
| `prior_schedule_mode` | Previous `exact` or `window` mode when required for context |
| `prior_scheduled_at` | Previous exact UTC timestamp, if applicable |
| `prior_window_start_at` | Previous UTC window start, if applicable |
| `prior_window_end_at` | Previous UTC window end, if applicable |
| `created_at` | Attempt-history creation timestamp |

Attempt rows must be append-only in normal application behavior. They are deleted only as a consequence of permanently deleting the parent callback.

### 15.3 Data that must not be modeled

The initial data model must not add:

- Customer table
- Account table
- Contact table
- Organization table
- Agency table
- Team table
- Supervisor relationship
- Shared-assignment table
- Telephony-call record
- Call-recording reference
- Compliance-verification record
- Performance-score record

---

## 16. Search, Filtering, and Callback Discovery

The Callbacks page must support useful discovery of records owned by the authenticated agent.

Recommended searchable data includes:

- Account-holder name
- Account number
- Phone number

When searching by account number:

- The authorized query may operate on the actual stored account-number field.
- Search results and list surfaces must continue to display only a masked account reference.
- The full account number may appear only in callback detail.

All search and filter operations must remain scoped by RLS to the authenticated agent's records.

Useful filters may include product-domain concepts already defined in this document, such as:

- Open or closed lifecycle
- Due/grace
- Overdue
- Schedule mode
- Date or date range
- Outcome for closed callbacks

The exact search interaction, matching behavior, filter layout, and empty-state presentation are design details. The product must not expand search into:

- A customer directory
- Cross-callback customer history
- CRM lookup
- Fuzzy identity resolution
- Deduplication
- Cross-agent search

---

## 17. Workload Reporting

### 17.1 Purpose

Charts, counters, and summaries exist only to help the individual agent understand their current workload.

Required information is:

- Scheduled today
- Upcoming
- Grace period or due now
- Overdue
- Completed today

The exact chart or visual representation is deferred with the visual design and design system.

### 17.2 Conceptual definitions

All time-based reporting uses the agent device's current local timezone.

- **Scheduled today:** Existing open callbacks whose exact timestamp or window start falls on the current local calendar day.
- **Upcoming:** Existing open callbacks scheduled after the current local day and not already overdue.
- **Due now/grace:** Existing open callbacks currently in the exact-time grace period, active window, or post-window grace period.
- **Overdue:** Existing open callbacks at or beyond their applicable overdue threshold.
- **Completed today:** Existing callbacks closed during the current local calendar day, regardless of whether the final outcome was reached, voicemail, or no answer.

These values do not need to be mutually exclusive. For example, an open callback due today may contribute to both Scheduled today and Due now.

### 17.3 Reporting limitations

All workload data is based on:

- Manually entered callbacks
- Manually reported outcomes
- Records that currently exist

If a callback is permanently deleted, it no longer contributes to current or historical workload summaries.

The product must clearly avoid representing these summaries as:

- Compliance evidence
- Audited history
- Telephony evidence
- Performance measurement
- Proof of completed calls
- Proof that a customer was reached
- Proof that an agent acted at a particular time

### 17.4 Prohibited reporting

Do not add:

- Productivity scores
- Agent rankings
- Performance comparisons
- Team metrics
- Outcome percentages
- Success rates
- Average handle time
- Call-volume targets
- Compliance scoring
- Supervisor reports
- Agency-wide reports

---

## 18. Authentication Requirements

### 18.1 User-facing credentials

An agent creates an account using:

- A company ID matching `^E\d{5}$`
- A six-digit PIN used as the password

A valid company ID consists of:

- An uppercase `E`
- Exactly five digits

A valid PIN consists of exactly six digits.

### 18.2 Enrollment behavior

There is no:

- Employee-ID verification
- Invitation requirement
- Supervisor approval
- Administrator approval
- Agency directory verification

The first registrant able to register an available company ID can claim it.

This enrollment risk is explicitly accepted by the product owner. It must not be described as secure identity verification.

### 18.3 Supabase Auth adaptation

Supabase Auth does not provide native username authentication for this employee-ID format.

Implementation therefore requires a safe mapping or adaptation that retains the user-facing experience of:

- Company ID
- Six-digit PIN

The exact mapping mechanism is deferred to implementation and security review.

The mapping must not:

- Store the PIN in plaintext in an application table
- Treat an application-table PIN comparison as authentication
- Bypass Supabase Auth
- Expose another agent's authentication identity
- Weaken callback ownership enforcement

### 18.4 PIN storage

The PIN must never be stored as plaintext in application tables.

Authentication credential storage and verification must be handled through Supabase Auth or an equally appropriate Supabase-supported authentication mechanism selected during implementation.

The PIN must not be written into callback records or attempt-history records.

### 18.5 Rate limiting and lockout

Strict authentication rate limiting and lockout behavior are mandatory because a six-digit PIN has a small keyspace.

Controls must cover repeated authentication attempts and abusive enrollment attempts as applicable.

The exact thresholds and lockout durations are deferred to implementation and security review, but omitting rate limiting or lockout is not acceptable.

### 18.6 Authentication limitations

The chosen authentication model has known limitations:

- Employee IDs are enumerable.
- The first registrant can claim and block another person's employee ID.
- A six-digit PIN is brute-forceable unless strict throttling and lockout are enforced.
- RLS can protect data belonging to the authenticated account, but it cannot determine whether the person who registered that account is the real employee.
- Frontend device detection cannot correct false identity enrollment.

The product and implementation documentation must not claim that this signup process verifies employee identity.

### 18.7 PIN recovery

The PIN recovery and reset workflow is deferred.

Implementation must not assume an unapproved recovery channel, such as personal email, company email, SMS, supervisor reset, or administrator reset.

---

## 19. Privacy and Customer Data

### 19.1 Real customer data

The application will store real customer information, including:

- Phone numbers
- Account numbers
- Account-holder names
- Additional callback comments
- Attempt notes

These values are not sample or anonymous data.

### 19.2 Account-number masking

The full account number may be displayed only inside the authenticated callback-detail surface.

The account number must be masked everywhere else, including:

- Dashboard action lists
- Dashboard calendar
- Calendar monthly view
- Calendar weekly view
- Callback list
- Search results
- Workload surfaces

The exact masking characters and number of visible trailing characters are deferred visual/implementation details. The approved behavioral requirement is that list and calendar surfaces must not reveal the full account number.

### 19.3 Other customer data

Phone numbers and account-holder names may be shown only within authenticated in-app surfaces where needed for callback work.

They must not appear in native notifications.

This document does not impose a masking rule for phone numbers or account-holder names beyond restricting them to authenticated in-app surfaces. Any broader masking proposal requires product approval.

### 19.4 Notification privacy

Native notifications must contain no customer PII.

Specifically, they must contain no:

- Account-holder name
- Phone number
- Account number
- Comments
- Attempt notes

### 19.5 No cross-record customer profile

Even when multiple callbacks contain matching customer details, the application must not combine them into a customer profile or expose history across separate callbacks.

Each callback remains self-contained.

---

## 20. Row Level Security and Access Control

### 20.1 Callback policies

Every callback row must have a `user_id` linked to the authenticated Supabase user.

The authenticated agent may:

- Select only rows where `user_id = auth.uid()`
- Insert only rows where `user_id = auth.uid()`
- Update only rows where `user_id = auth.uid()`
- Delete only rows where `user_id = auth.uid()`

Both `USING` and `WITH CHECK` behavior must be applied as appropriate so an agent cannot transfer ownership by changing `user_id`.

### 20.2 Attempt-history policies

Attempt-history access must be restricted through ownership of the parent callback.

An authenticated agent may access or append attempt history only when the parent callback belongs to `auth.uid()`.

The application must not rely on receiving a callback ID from the client as proof of ownership.

### 20.3 No elevated product role

The product must not expose an application role that bypasses callback ownership for:

- Supervisors
- Administrators
- Other agents
- Agency staff
- Team reporting

Operational Supabase service credentials, if used by deployment infrastructure, must never be exposed to the browser and do not create an approved product role.

### 20.4 Client-side protections are insufficient

The following are not sufficient security controls:

- Hiding navigation
- Zustand state
- Client-side filters
- Disabled buttons
- Route guards alone
- Device detection
- Obscure callback identifiers

Supabase authentication and mandatory RLS are the authoritative access controls for protected server data.

### 20.5 No organization boundary

RLS must use authenticated user ownership directly. It must not depend on an `organization_id`, team membership, or agency membership.

---

## 21. Device and Responsive Behavior

### 21.1 Phone access

The website is not supported on phones because the product owner does not want customer information accessed from phone devices.

The frontend must detect likely phone use and show an unsupported-device block or deterrent screen instead of the normal application.

### 21.2 Device detection is not a security boundary

Frontend device detection is bypassable.

User-agent checks and viewport checks can be changed or spoofed. Therefore:

- The phone block must be described as an unsupported-device deterrent.
- It must not be described as preventing all phone access.
- It must not be used as a substitute for authentication, RLS, or other data protections.
- The product must not claim that customer data is technically inaccessible from phones under all circumstances.

This limitation is an accepted product risk.

### 21.3 Narrow desktop windows

Agents may frequently resize desktop browser windows.

The authenticated application must remain responsive and usable in narrow desktop windows, including:

- Navigation
- New Callback dialog
- Structured scheduling forms
- Dashboard action list
- Calendar controls
- Callback list
- Callback detail/history
- Settings

A narrow viewport alone must not automatically be treated as proof that the device is a phone, because narrow desktop windows are supported.

### 21.4 Mobile product scope

The product is not a mobile product.

No requirement exists for:

- Mobile-first layouts
- Mobile application packaging
- Mobile push notifications
- Mobile background behavior
- Phone-specific workflows
- Native iOS or Android applications

---

## 22. Error and Edge States

### 22.1 Invalid company ID

If the company ID does not match `^E\d{5}$`, account creation must not proceed.

The interface must communicate the required format without implying that the ID has been verified against an employee directory.

### 22.2 Invalid PIN

If the PIN is not exactly six digits, account creation or applicable PIN change must not proceed.

The interface must not expose the PIN in persisted application data.

### 22.3 Company ID already claimed

If a company ID has already been registered, the new account must not claim it.

Because no employee verification or recovery decision has been approved, the application must not invent an override, supervisor approval, or identity-proofing workflow.

### 22.4 Repeated authentication failures

Repeated failed authentication attempts must be subject to strict rate limiting and lockout.

The product must not permit unlimited rapid PIN guesses.

### 22.5 Missing required callback fields

Creation must not proceed when any required callback field is absent:

- Phone number
- Account number
- Account-holder name
- Scheduling mode
- Required schedule value or values

Exact phone-number and account-number validation formats are deferred.

### 22.6 Invalid exact schedule

Exact scheduling must have one valid date and time that can be converted to UTC.

### 22.7 Invalid window schedule

Window scheduling must have:

- A valid start
- A valid end
- An end later than the start

Creation or update must not proceed with an inverted or zero-length window.

### 22.8 Schedule conflict

A schedule conflict produces a warning.

The agent must still be able to confirm and save the callback without changing the schedule.

### 22.9 Save failure

If callback or attempt persistence fails:

- Do not report success.
- Do not remove the callback from the current actionable state based only on an optimistic client update.
- Allow the agent to understand that the change was not persisted.

The exact error copy and retry presentation are design details.

### 22.10 Notification permission denied

If permission is denied:

- Native notifications are unavailable.
- The authenticated app provides the expected in-app fallback while open.
- The product must not claim that external or background notification delivery remains active.

### 22.11 Browser asleep or closed

If the notification trigger was missed because the browser or computer was asleep or closed:

- Do not send a late notification.
- Derive and display the accurate current due or overdue state after return.

### 22.12 Multiple tabs

Multiple tabs must not produce duplicate notifications for the same callback schedule occurrence.

The exact coordination design remains deferred.

### 22.13 Callback deleted

After permanent deletion:

- The record and its attempt history are unavailable.
- Calendar, list, search, and workload surfaces must no longer include it.
- Historical workload numbers must not pretend that it still exists.

### 22.14 Device timezone changes

UTC timestamps remain authoritative. Display and local-day workload grouping use the current device timezone.

The product assumes the agent and customer share a timezone and does not attempt to reconcile customer-specific timezone differences.

### 22.15 Narrow desktop viewport

A narrow desktop window must remain usable and must not be blocked merely because its width resembles a phone viewport.

---

## 23. Non-Goals

The following are explicit non-goals:

### 23.1 Workflow and collaboration

- Generic Kanban
- Board views
- Shared callback queues
- Callback reassignment
- Team collaboration
- Shared records
- Shared calendars
- Supervisor workflows
- Administrator workflows
- Team visibility
- Agency-wide visibility

### 23.2 Customer and CRM functionality

- Customer directory
- Reusable customer entities
- Reusable account entities
- Customer deduplication
- Account deduplication
- Customer lookup
- Cross-callback customer history
- CRM integration
- CRM replacement

### 23.3 Organization modeling

- Agency tenancy
- Organization records
- Tenant switching
- Organization-level access control
- Team membership
- Organization reporting

### 23.4 Telephony and verification

- Dialer integration
- Telephony integration
- Automated dialing
- Call recording
- Automated outcome detection
- Proof that a call occurred
- Proof that a customer was reached
- Automated call verification

### 23.5 Calendar interaction

- Drag-and-drop scheduling
- Calendar resizing
- Duration blocks for callback windows
- Team calendar
- Resource calendar

### 23.6 Notifications

- Repeated reminders
- Notification escalation
- Service-worker push
- Web push while the app is closed
- Background mobile notifications
- SMS reminders
- Email reminders
- Mobile push notifications

### 23.7 Devices

- Phone-supported product
- Native mobile application
- Mobile-first workflow
- Guaranteed prevention of phone access through frontend detection

### 23.8 Analytics

- Productivity scoring
- Performance rankings
- Team metrics
- Outcome percentages
- Compliance analytics
- Audit-quality reporting
- Trustworthy historical reporting after deletion
- Workforce monitoring

---

## 24. Acceptance Criteria

### 24.1 Account creation and sign-in

- An agent can enter a company ID matching `^E\d{5}$`.
- An agent can choose a PIN containing exactly six digits.
- An invalid company ID or PIN format is rejected.
- A company ID cannot be registered more than once.
- No employee verification or invitation is required.
- The PIN is never stored in plaintext in application tables.
- Authentication uses Supabase Auth through a safe employee-ID adaptation.
- Repeated failed PIN attempts are rate-limited and subject to lockout.
- The product does not claim that signup verifies employee identity.

### 24.2 Ownership and RLS

- Every callback is associated with `auth.uid()`.
- An agent can select only their own callbacks.
- An agent can insert callbacks only for themselves.
- An agent can update only their own callbacks.
- An agent can delete only their own callbacks.
- Attempt-history access is permitted only through ownership of the parent callback.
- Changing a callback's `user_id` cannot be used to transfer or expose ownership.
- RLS is enabled on every callback and attempt-history table.
- No `organization_id` is required or used.
- Client-side filtering and Zustand are not treated as authorization controls.

### 24.3 Callback creation

- New Callback is available from all four authenticated application pages.
- The callback form requires phone number, account number, account-holder name, and scheduling details.
- Additional comments are optional.
- The agent can select exact-time scheduling.
- The agent can select time-window scheduling.
- Exact mode stores one UTC timestamp.
- Window mode stores UTC start and end timestamps.
- A window end earlier than or equal to its start is rejected.
- The form uses the device timezone for entry and display.
- A successfully created callback appears in relevant dashboard, calendar, and list surfaces.

### 24.4 Conflicts

- Two exact callbacks at the same time produce a conflict warning.
- An exact callback inside a time window produces a conflict warning.
- Overlapping windows produce a conflict warning.
- The warning does not prevent saving.
- Conflicts are checked only against the authenticated agent's applicable open callbacks.

### 24.5 Due and overdue behavior

- An exact callback becomes due at its exact timestamp.
- An exact callback becomes overdue five minutes after its exact timestamp.
- A window callback becomes due at the window start.
- A window callback remains active through the window end.
- A window callback enters its grace period after the window end.
- A window callback becomes overdue five minutes after the window end.
- Grace and overdue are derived from schedule and current time.
- Closed callbacks are not shown as overdue.

### 24.6 Notifications

- The application requests browser notification permission.
- An exact callback produces no more than one native notification at its exact time.
- A window callback produces no more than one native notification at its window start.
- The notification contains generic text such as "Callback due now."
- The notification contains no customer name, phone number, account number, comments, or attempt notes.
- The notification does not repeat during grace or overdue states.
- A rescheduled occurrence may produce one notification at its new schedule.
- If the browser or computer was closed or asleep, no late notification is sent on return.
- If permission is denied or unavailable, the open authenticated application provides an in-app fallback.
- The fallback is not represented as external push or background delivery.
- Multiple open tabs do not create duplicate notifications for the same scheduled occurrence.

### 24.7 Calendar behavior

- The Dashboard contains a seven-day hourly time-grid calendar.
- The Calendar page supports monthly and weekly views.
- The Callbacks page provides the required list view.
- Exact callbacks appear as point markers at their exact timestamps.
- Window callbacks appear as one marker at the window start.
- A window marker communicates the full time range.
- Window callbacks never render as duration blocks.
- Callbacks cannot be dragged or resized.
- Selecting a callback provides access to structured detail and schedule editing.
- Full account numbers do not appear on calendars.

### 24.8 Outcome workflow

- Mark completed means the customer was reached.
- Mark completed closes the callback with the `reached` outcome.
- Voicemail is available as an unsuccessful outcome.
- No answer is available as an unsuccessful outcome.
- Voicemail and No answer each require a choice between close and reschedule.
- Closing an unsuccessful callback records the corresponding final outcome.
- Rescheduling keeps the callback open.
- Rescheduling updates the same callback rather than creating a new customer or callback record.
- Rescheduling appends attempt history with timestamp, outcome, optional note, and rescheduling indicator.
- A rescheduled attempt preserves the prior exact time or prior window range.
- Prior unsuccessful attempts remain visible after the callback is later completed.
- Attempt history is append-only while the callback exists.

### 24.9 Editing and deletion

- An agent can edit any callback they own at any time.
- Schedule edits use a structured form.
- An agent can permanently delete any callback they own at any time.
- Deleting a callback removes its attempt history.
- Deleted callbacks no longer appear in search, lists, calendars, or workload metrics.
- The product does not claim audit-quality history after deletion.

### 24.10 Search and privacy

- The agent can search or filter their own callbacks.
- Search can support account-holder name, phone number, and account number.
- Search remains restricted by RLS.
- The full account number is visible only in authenticated callback detail.
- Account numbers are masked in lists, search results, dashboards, and calendars.
- Phone numbers and account-holder names are shown only within authenticated in-app surfaces.
- Notifications contain no customer PII.
- The app does not create customer profiles or cross-callback customer history.

### 24.11 Dashboard and reporting

- The Dashboard prioritizes overdue callbacks first.
- Due/grace callbacks appear before other callbacks scheduled today.
- Today's remaining callbacks appear before later upcoming callbacks.
- The product shows scheduled today, upcoming, due/grace, overdue, and completed-today information.
- Workload information is scoped to the authenticated agent.
- Deleted records are excluded.
- Metrics are described as agent-reported workload information.
- No productivity scores, rankings, team comparisons, outcome percentages, or audit claims appear.

### 24.12 Device behavior

- Likely phone users receive an unsupported-device deterrent or block screen.
- The product does not claim this frontend check is a security boundary.
- The authenticated app remains usable in narrow desktop browser windows.
- A narrow viewport alone does not automatically block a desktop user.
- No phone-specific product or mobile background-notification behavior is required.

### 24.13 Page structure

- The authenticated product has no more than four primary pages: Dashboard, Calendar, Callbacks, Settings.
- Authentication screens do not count toward the four-page maximum.
- Callback detail does not introduce a fifth primary application page.
- A global New Callback dialog or modal is available from every authenticated page.
- No Kanban or board page is introduced.

---

## 25. Accepted Risks and Limitations

### 25.1 False identity enrollment

The absence of employee-ID verification is an accepted product-owner decision.

Consequences include:

- Employee IDs can be enumerated.
- The first registrant can claim or block an employee ID.
- The system cannot establish that the registrant is the actual employee represented by the ID.
- RLS protects the resulting authenticated account's records but cannot repair false enrollment.

This risk must be documented accurately and must not be hidden behind claims of secure identity verification.

### 25.2 Six-digit PIN strength

A six-digit PIN has a limited keyspace and is vulnerable to brute-force attempts without strict controls.

The product owner has approved the six-digit PIN experience, but strict rate limiting and lockout remain mandatory security requirements.

### 25.3 Frontend phone blocking

Frontend device detection can be bypassed by changing or spoofing user-agent or viewport information.

The unsupported-device screen is a deterrent and product-support boundary, not an enforceable security boundary.

### 25.4 Manual outcome reporting

Outcomes are entered manually by the agent.

The product cannot independently verify:

- That the call was placed
- That the customer answered
- That a voicemail was left
- That the recorded outcome is correct
- That the attempt happened at the entered time

### 25.5 Non-audit deletion behavior

Agents may permanently delete callbacks at any time.

Metrics and history reflect only records that still exist, so they cannot be treated as complete or audit-quality evidence.

### 25.6 Notification availability

The notification model assumes the application is open during the shift.

Without a service worker, web push, or background mobile system:

- Notifications are not guaranteed while the browser is closed.
- Missed notifications are not replayed.
- Browser permission may be denied.
- Browser and operating-system behavior may affect delivery.

The in-app fallback does not change these limitations.

### 25.7 Shared timezone assumption

The product assumes that the agent and customer share a timezone.

It does not prevent scheduling errors caused by customers being in a different timezone.

---

## 26. Open and Deferred Decisions

The following details are intentionally unresolved. They must not be silently invented during implementation.

| Deferred decision | Fixed constraints |
|---|---|
| Exact visual design and design system | Must use the approved stack; must not introduce Kanban; must remain usable in resized desktop windows |
| Final workload chart representation | Must communicate scheduled today, upcoming, due/grace, overdue, and completed today; workload only |
| PIN recovery and reset flow | Must not assume email, SMS, supervisor, administrator, or invitation-based recovery without approval |
| Record retention and backup policy | In-app deletion is permanent and deleted records no longer affect metrics; no audit-quality claim |
| Exact phone-number validation format | Phone number remains required |
| Exact account-number validation format | Account number remains required and full value is shown only in callback detail |
| Exact account-number masking presentation | Masking is mandatory outside callback detail |
| Notification coordination across multiple tabs | Must prevent duplicate notifications for the same schedule occurrence |
| Supabase employee-ID authentication mapping | Must retain employee-ID/PIN UX, use Supabase Auth safely, and never store plaintext PINs in application tables |
| Exact authentication rate-limit and lockout thresholds | Strict throttling and lockout are mandatory |
| Exact search interaction and matching behavior | Search remains useful, private, RLS-scoped, and does not become a customer directory |
| Exact filter layout | Filters remain limited to existing callback-domain concepts |
| Exact in-app notification fallback presentation | Must work only as an authenticated in-app fallback and must not imply external push |
| Exact Dashboard group labels and tie-breaking | Required priority remains overdue, due/grace, today, then upcoming |
| Exact notification-permission prompt presentation | Browser permission must be requested and permission status must be understandable |

These deferred items may be resolved during implementation only within the fixed constraints above. Any resolution that changes product scope, privacy behavior, ownership, authentication risk, notification guarantees, or workflow requires product-owner approval.

---

## 27. Implementation Handoff Invariants

The following invariants must remain true throughout design and implementation:

1. A callback belongs only to the authenticated user who created it.
2. Supabase plus RLS is the source of truth for protected data.
3. No agent can access another agent's callbacks or attempt history.
4. No shared queue, reassignment, supervisor, administrator, or team visibility is introduced.
5. No organization or tenant model is introduced.
6. Every callback is self-contained.
7. No reusable customer/account entity or cross-callback customer history is introduced.
8. Callback creation requires phone number, account number, account-holder name, and a valid schedule.
9. Exact schedules use one UTC timestamp.
10. Window schedules use UTC start and end timestamps.
11. Schedule entry and display use the agent device timezone.
12. Conflicts warn but never block.
13. All calendar callbacks are point markers.
14. A window is represented by one marker at its start with the full range in its label.
15. Window overdue timing is based on window end plus five minutes.
16. Schedule changes use structured forms, not drag and drop or resizing.
17. New Callback is available globally from all authenticated pages.
18. There are no more than four primary authenticated application pages.
19. Mark completed means the customer was reached.
20. Voicemail and No answer allow close or reschedule.
21. Rescheduling preserves compact attempt history on the same callback.
22. Agents may edit or permanently delete their callbacks at any time.
23. Deleted records no longer contribute to workload or history reporting.
24. Notifications are generic, contain no PII, and do not repeat for the same schedule occurrence.
25. No late notification is sent after a closed or sleeping browser returns.
26. Notification denial falls back to an in-app experience, not external push.
27. Full account numbers appear only in authenticated callback detail.
28. Account numbers are masked in lists, dashboards, searches, and calendars.
29. Employee IDs are not verified, and the product must not claim otherwise.
30. Six-digit PINs require strict rate limiting and lockout.
31. PINs are never stored in plaintext in application tables.
32. Frontend phone detection is a deterrent, not a security boundary.
33. Narrow desktop browser windows remain supported.
34. Workload summaries are agent-reported organizational aids, not performance or compliance evidence.
35. The product must not resemble or introduce a Kanban board.
