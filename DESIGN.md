# Scheduler Design System

## September 5 shell and scheduling update

The supplied sidebar image is the shape reference for the sculpted silhouette of an upright left navigation rail with curved shoulders and ends; the rail itself renders on theme `sidebar` surfaces with a hairline `sidebar-border` edge so it adapts to light and dark. Use Tabler Home and History icons above a horizontal divider, then Settings; reserve teal for the selected destination. Preserve visible labels, keyboard focus, and narrow-desktop access.

Callback date fields expand a shadcn Calendar inside the modal and pair it with a minute-precision time input. The weekly calendar uses real hour rows: labels are centered in their rows and callback cards stay fully inside their day/hour cells. Cards display exact times and stack chronologically; busy rows grow across all seven equal-width day columns. A 6:55 PM callback belongs to the 6 PM row, and a 23:59 callback stays in the final row without spilling past midnight.

History uses a compact table and factual counts, without performance percentages. Settings is a modal; account deletion uses an explicit confirmation state with Cancel focused first.

## 1. Purpose

This document is the visual and interaction contract for Scheduler, a desktop-focused callback scheduling application. It translates the product requirements in `PRODUCT.md` into reusable design rules.

The system must help an agent answer three questions with minimal interpretation:

1. What needs attention now?
2. What should I do next?
3. Did my action succeed?

The interface is operational, compact, and quiet. It must not resemble a CRM, team dashboard, analytics suite, or decorative productivity app.

## 2. Design Direction

Scheduler has light and dark themes with equal functional coverage. Dark is the signature expression: a midnight command center built from near-black, subtly cool surfaces and crisp off-white type. Darkness is the substrate, not a decorative effect.

The visual language is:

- Precise rather than expressive
- Compact with deliberate areas of relief
- Flat by default
- Structured by alignment, spacing, hairline borders, and surface contrast
- Free of gradients, glow, glass effects, illustrations, and ornamental texture
- Focused on product data as the primary visual texture

Vercel, Cursor, Raycast, Framer, and Linear are directional references, not templates. Scheduler should borrow their restraint and precision without copying their layouts or branding.

### Product-specific principles

- **Next action first:** overdue and due callbacks receive the strongest hierarchy.
- **Fast capture:** `New Callback` remains a persistent, unmistakable action on every authenticated page.
- **Private by default:** customer data is revealed only where the task requires it.
- **Accurate feedback:** warnings, failures, and completed actions are visually and verbally distinct.
- **No false affordances:** calendar markers are selectable, but never look draggable or resizable.
- **One accent per view:** the teal primary color identifies action, focus, or selection—not decoration.

## 3. Foundations

### 3.1 Color

The shadcn semantic tokens in `app/globals.css` are authoritative. Components consume semantic variables rather than raw color values.

| Role | Token | Use |
| --- | --- | --- |
| Canvas | `background` | Application background |
| Primary text | `foreground` | Headings and essential content |
| Raised surface | `card` | Cards, panels, grouped controls |
| Floating surface | `popover` | Menus, tooltips, dialogs, sheets |
| Primary action | `primary` | Main CTA, active control, selected marker |
| Secondary action | `secondary` | Lower-emphasis actions |
| Quiet surface | `muted` | Hover, selected-neutral, skeleton, subdued grouping |
| Secondary text | `muted-foreground` | Metadata, helper text, placeholders |
| Destructive | `destructive` | Permanent deletion and blocking errors only |
| Structure | `border` | Hairline boundaries and separators |
| Input boundary | `input` | Form control borders and filled control surfaces |
| Focus | `ring` | Keyboard focus indication |
| Data series | `chart-1`–`chart-5` | Workload visualization only |

Rules:

- Never use chart tokens for validation, status, or component chrome.
- Never use `destructive` for overdue state alone. Overdue is urgent work, not an error or destructive action.
- Never communicate status by color alone. Pair color with a label, icon, shape, or position.
- Large surfaces stay neutral. Saturated teal is reserved for focused actions and small signals.
- Full customer account numbers appear only in authenticated callback detail. Elsewhere use `•••• 1234`, showing at most the final four characters.
- Native notification content contains no customer PII.

The current preset does not define dedicated warning and success tokens. Until those roles are intentionally added, non-blocking conflict warnings use neutral `muted`/`border` surfaces with an explicit warning icon and copy; success uses the primary token plus explicit confirmation copy. Do not substitute arbitrary amber or green values in individual components.

### 3.2 Theme behavior

Light and dark themes preserve the same hierarchy and semantics; they do not merely invert colors.

**Dark theme**

- `background` is the lowest visual plane.
- `card` and `popover` create depth through small lightness changes.
- Borders use the existing low-opacity white token.
- Primary text uses the existing off-white `foreground`, never hard-coded pure white.
- Drop shadows are not used.

**Light theme**

- Boundaries rely primarily on `border` and surface changes.
- Resting cards remain shadowless.
- A single soft, low-opacity shadow is permitted only on floating overlays when a border and backdrop are insufficient to distinguish the layer.

Theme changes must not alter component dimensions, layout, content, or meaning.

### 3.3 Spacing

The base unit is `4px`. Standard spacing begins at `8px`; `4px` is reserved for optical correction and tight internal relationships.

| Token | Value | Typical use |
| --- | ---: | --- |
| `space-1` | 4px | Icon correction, compact metadata |
| `space-2` | 8px | Default element gap |
| `space-3` | 12px | Compact control padding |
| `space-4` | 16px | Form groups, row padding |
| `space-5` | 20px | Medium internal separation |
| `space-6` | 24px | Default card and panel padding |
| `space-7` | 28px | Dense layout adjustment |
| `space-8` | 32px | Content block separation |
| `space-9` | 36px | Large control grouping |
| `space-10+` | 40–128px | Continue in 4px increments |

Canonical layout values:

- Element gap: `8px`
- Form-field gap: `16px`
- Card padding: `24px`
- Distinct content-block gap: `32px`
- Page section gap: `96px` only where sections are truly independent

The `96px` section gap is not a dashboard default. Dense operational surfaces use `24–32px`; `96px` is reserved for authentication, unsupported-device, and similarly sparse compositions.

### 3.4 Shape

Use the existing radius tokens generated from `--radius: 0.875rem` in `app/globals.css`.

- Controls use the radius already defined by their shadcn variant.
- Cards and panels use `radius-lg` unless nested geometry requires a smaller radius.
- Floating overlays may use `radius-xl`.
- Pills are reserved for compact statuses, segmented controls, and generated pill-style buttons—not general containers.
- Nested corners must visually tighten. An inner surface cannot appear rounder than its containing surface.
- Do not mix square and highly rounded components within one control group.

### 3.5 Borders and elevation

Geometry performs the work usually delegated to shadows.

- Default border: `1px solid border`
- Strong boundary: one additional surface step, not a thicker border
- Separators: one hairline, used only when spacing cannot establish grouping
- Resting cards: no shadow
- Dark overlays: no shadow; use `popover`, border, and backdrop separation
- Light overlays: at most one subtle shadow layer
- No stacked shadows, inset highlights, glow, or blur-based elevation

Elevation order:

1. Canvas: `background`
2. Resting grouped surface: `card`
3. Interactive or floating surface: `popover`
4. Blocking overlay: `popover` above a restrained backdrop

### 3.6 Typography

The current font setup is authoritative:

- **UI and body:** Figtree via `--font-sans`
- **Display/heading option:** Lora via `--font-heading`
- **Monospaced data:** Geist Mono via `--font-mono`

Scheduler is a precision tool, so Figtree is the default for all application headings and body copy. Lora is reserved for sparse, non-operational moments such as authentication or unsupported-device messaging; it must not appear in calendars, forms, tables, cards, or navigation. Geist Mono is limited to identifiers or data where character distinction matters, not general numeric UI.

| Role | Size / line height | Weight | Tracking |
| --- | --- | --- | --- |
| Micro label | 10 / 16px | 500–600 | `0.02em` only for short uppercase labels |
| Caption / metadata | 12 / 16px | 400–500 | Normal |
| Compact UI | 12 / 16px | 500 | Normal |
| Body / input | 16 / 24px | 400 | Normal |
| Section heading | 20 / 28px | 600 | `-0.01em` |
| Page heading | 24 / 32px | 600 | `-0.02em` |
| Display | 32 / 40px | 600 | `-0.025em` |

Above `32px`, the scale continues in `8px` increments: `40, 48, 56, 64…`. Application screens should rarely exceed `32px`; larger sizes are reserved for sparse authentication or system-state screens.

Rules:

- Tight tracking applies to headings, not all white text.
- Do not use 10px or 12px for essential instructions, inputs, or primary actions.
- Use tabular numerals for times, dates, counters, and account suffixes.
- Use sentence case. Avoid decorative all-caps outside micro labels.
- Truncate dense single-line labels deliberately; never truncate error messages or the only copy of a schedule.
- Body and helper prose should remain within `65ch`.

### 3.7 Iconography

Use Tabler Icons, matching `components.json`.

- Default stroke: the library default, applied consistently.
- Text companion icon: `16px` for compact UI, `20px` for standard UI.
- Icon-only button: icon `16px`, target at least `32×32px`.
- Every icon-only control has an accessible name and a tooltip.
- Do not use emoji as interface iconography.
- Icons reinforce labels; they do not replace unfamiliar action names.

## 4. Layout System

### 4.1 Application shell

The authenticated shell contains no more than four primary destinations:

- Dashboard
- Calendar
- Callbacks
- Settings

`New Callback` is visually persistent and separate from route navigation. Navigation must remain usable in narrow desktop windows and may collapse to an icon rail or compact header without removing destinations.

The shell must not introduce team, supervisor, admin, customer-directory, board, or Kanban navigation.

### 4.2 Content layout

- Use a strict grid and full available desktop canvas.
- Keep page gutters at `24–32px` on standard desktops and no less than `16px` in narrow desktop windows.
- Prefer fluid columns with explicit minimums over fixed-width pages.
- Action lists and calendars may stack at narrower desktop widths rather than compressing below legible dimensions.
- Horizontal scrolling is acceptable inside the weekly calendar grid when preserving time accuracy; it is not acceptable for primary navigation, dialogs, or forms.
- Phone blocking must use device evidence beyond viewport width. A narrow viewport alone never proves phone use.

### 4.3 Density

“Compact to relief” means density follows task frequency:

- Navigation, filters, calendar controls, and repeated list rows are compact.
- Callback creation and outcome decisions receive more vertical separation.
- Destructive confirmation and unsupported-device screens are sparse.
- Empty states provide one clear next action without oversized illustration or marketing copy.

## 5. Hierarchy and Status

Visual priority follows the product’s action order:

1. Overdue
2. Due now, active window, or grace period
3. Other callbacks scheduled today
4. Upcoming callbacks
5. Closed or historical information

Status presentation uses a short label plus one restrained visual signal. Do not fill entire large cards with status colors.

- **Overdue:** highest-contrast label and marker; urgency icon or leading edge; never destructive styling by default.
- **Due now / active:** primary teal marker with explicit label.
- **Grace:** explicit `Grace period` label; do not imply the callback is already overdue.
- **Upcoming:** neutral foreground and border.
- **Closed:** reduced emphasis, but maintain readable contrast.
- **Conflict:** neutral warning surface, warning icon, explanatory copy, and an enabled save action.
- **Error:** destructive token, inline source-level message, and recovery action where possible.

## 6. Core Components

Generated shadcn components are starting points. The rules in this document govern their final variants, states, and composition.

### 6.1 Button

Required variants:

- Primary: one principal action in a local surface
- Secondary: valid alternative with lower emphasis
- Outline: utility action on a flat surface
- Ghost: navigation and low-emphasis contextual action
- Destructive: permanent deletion only
- Link: inline navigation or tertiary disclosure

Required states: default, hover, pressed, focus-visible, disabled, and loading.

- Interaction feedback completes within `200ms`.
- Loading preserves the button width and communicates progress without removing its accessible name.
- Disabled controls do not use tooltips as a substitute for nearby explanation when the reason matters.
- A surface should not contain competing primary buttons.

### 6.2 Button group

Use for mutually related commands or segmented choices such as week/month view.

- Grouped edges share one outer shape.
- Selection remains visible without relying on hover.
- Arrow-key behavior follows the underlying accessible primitive where applicable.
- Do not use a button group for unrelated actions.

### 6.3 Inputs and input groups

Every field supports default, hover, focus-visible, filled, disabled, error, and loading/read-only states where applicable.

- Persistent label above the control
- Optional designation only on optional fields
- Helper or error text directly below the source control
- Validation on blur or submit, not on every keystroke unless a constraint is immediately actionable
- User input is preserved after failure
- Paste is always allowed
- Account and phone fields use formats that remain readable and editable

Input groups are reserved for semantically attached prefixes, suffixes, or controls. They must retain a single coherent focus boundary.

### 6.4 Checkbox

Use checkboxes for independent binary choices. Use radio or segmented controls for exclusive choices such as Exact time versus Time window.

The label is clickable, remains visible, and does not depend on placeholder text.

### 6.5 Input OTP

Use for the six-digit PIN.

- Accept numeric input and paste.
- Expose one understandable field to assistive technology even when visually segmented.
- Show format errors inline.
- Never reveal or persist the PIN in ordinary application state or logs.

### 6.6 Separator

Use only when whitespace and alignment cannot communicate grouping. Separators are `1px` hairlines with the semantic border token; they are never decorative.

### 6.7 Dialog and alert dialog

A centered dialog is the default `New Callback` surface. It must fit and remain operable in narrow desktop windows, with a scrollable body and persistent action area when necessary.

Use an alert dialog for permanent deletion. It states that the callback and attempt history will be removed, names the destructive action explicitly, and gives focus to the safe action first.

Conflict warnings do not use an alert dialog because they are advisory and must not block saving.

### 6.8 Sheet

Use a sheet for callback detail or structured editing only when keeping the underlying list/calendar context visible is useful. Do not use a sheet for simple confirmation or as a default replacement for every dialog.

### 6.9 Spinner and loading

Use structural skeletons for page, list, and card loading. Use a spinner only inside a control or for a small indeterminate operation.

Loading states must not expose stale action success or cause major layout shifts.

### 6.10 Tooltip

Tooltips explain icon-only actions and unfamiliar controls. They never contain essential instructions, validation, or customer PII.

### 6.11 Toast and inline feedback

- Toasts confirm non-blocking completed operations.
- Errors appear inline near the failed action and may additionally use a toast for global failures.
- A save failure never closes the current work surface or reports success.
- Toast copy contains no unnecessary customer PII.

## 7. Scheduling Calendar

Scheduler contains two different calendar concepts:

1. **shadcn Calendar:** a date-selection primitive used inside forms.
2. **Scheduling Calendar:** a custom product component with weekly and monthly views, designed from the callback rendering requirements when implementation begins.

They must not share an API merely because both use dates.

### 7.1 Weekly view

- Seven-day hourly grid
- Tabular time labels centered inside their hour rows; busy rows grow to fit their cards
- Exact callbacks render inside their scheduled hour cell, labeled with the exact timestamp
- Time-window callbacks render inside the window-start hour cell, labeled with the full range
- Markers never imply duration through height
- Multiple callbacks in a cell stack chronologically without overlap or hidden cards
- Current time may use one restrained rule or marker

### 7.2 Monthly view

- Each day communicates callback count and the most urgent contained state.
- Individual callback disclosure must remain scannable and privacy-safe.
- Overflow uses an explicit count such as `+3 more`, not clipped content.

### 7.3 Calendar interaction

- Selecting a marker opens callback detail and structured editing.
- No drag handles, resize cursors, duration blocks, drag-to-create, or direct manipulation.
- Keyboard users can reach markers in chronological order.
- Marker labels never show full account numbers.
- Time-window overdue status derives from window end even though its marker sits at window start.

Detailed calendar geometry, collision policy, and narrow-width behavior will be specified with user input when the custom calendar is implemented.

## 8. Forms and Workflows

### 8.1 New Callback

The form order follows the agent’s mental model:

1. Customer/contact details
2. Scheduling mode
3. Exact time or time-window fields
4. Optional comments
5. Review warnings and save

Exact time and Time window are mutually exclusive and use a segmented or radio control. Only fields for the active mode are shown.

A schedule conflict is advisory:

- Explain what overlaps.
- Keep `Save callback` enabled.
- Never auto-move the schedule.

After success, close the dialog, confirm the save, and update relevant workload, list, and calendar surfaces.

### 8.2 Outcome and rescheduling

`Mark completed` means the customer was reached and must not be visually grouped as a generic close action.

`Voicemail` and `No answer` each lead to a clear decision:

- Close callback
- Reschedule callback

Rescheduling keeps the same callback and exposes a structured schedule form. The design must make this continuity clear and must not imply a new customer or duplicate callback.

### 8.3 Permanent deletion

Deletion always uses destructive styling and confirmation. Copy must state that the callback and its attempt history will be permanently removed and will disappear from workload reporting.

## 9. Lists, Search, and Workload

- Search is persistent on the Callbacks page when records are present.
- Filters use product language: Open, Closed, Due, Grace, Overdue, Exact, Window, date range, and final outcome.
- Search results mask account numbers even when matching the full stored value.
- Repeated row actions collapse into a contextual menu; the primary row click opens detail.
- Numeric columns and times use tabular figures.
- Historical or closed rows are quieter than actionable rows.

Workload visualization exists only to explain the individual agent’s current workload. It must not imply performance, compliance, rankings, targets, or audited history.

Prefer direct counters and a restrained single-series visualization over decorative charts. If a chart is used, it includes plain-language labels and an accessible textual equivalent.

## 10. Motion and Feedback

Motion is functional and minimal.

- No ambient, looping, parallax, or decorative animation.
- Interaction feedback: `100–150ms`
- Overlay entrance/exit: no more than `200ms`
- Animate only opacity and transform.
- Respect `prefers-reduced-motion`.
- Never animate calendar markers between time positions; schedule changes appear as state updates, not simulated movement.
- Do not use motion as the only confirmation of success or error.

## 11. Accessibility

Target WCAG 2.2 AA.

- All controls are keyboard operable.
- Focus-visible treatment uses the semantic ring token and is never removed.
- Normal text meets `4.5:1`; large text and meaningful UI boundaries meet applicable contrast requirements.
- Text remains usable at 200% zoom.
- Pointer targets are at least `32×32px` in this desktop product; primary and destructive actions should reach `36–40px` height.
- Status, urgency, and selection never depend on color alone.
- Form errors identify the field and describe correction.
- Dialogs trap focus, restore focus to their trigger, and support Escape except where an accessible primitive intentionally requires an explicit decision.
- Dates and times expose complete accessible names rather than visual abbreviations alone.
- Live regions announce saved, failed, due, and validation outcomes without repeating customer PII unnecessarily.

## 12. Required View States

Every page and major data surface defines:

- **Loading:** structural skeleton matching the final layout
- **Empty:** concise explanation and one relevant action
- **Success/populated:** normal operational state
- **Error:** what failed, whether data is safe, and a recovery action
- **Permission-limited:** notification status and accurate fallback guidance where relevant

In addition, dense surfaces must handle:

- Long names and comments
- Many callbacks at the same timestamp
- Zero search results
- Stale or deleted detail targets
- Timezone changes
- Narrow desktop windows
- Very large text/zoom

## 13. Content Style

Copy is concise, factual, and action-oriented.

- Use `New Callback`, `Save callback`, `Mark completed`, `Voicemail`, `No answer`, `Close callback`, and `Reschedule` consistently.
- Do not claim employee identity verification.
- Do not claim guaranteed background notifications.
- Do not call manually reported outcomes proof, audit evidence, compliance data, or performance measurement.
- Error copy states what happened and the next available action.
- Destructive copy names the object and consequence.

## 14. Component Acceptance Checklist

A component is design-complete only when:

- It uses semantic tokens and works in both themes.
- Its spacing follows the 4px grid.
- Its typography uses the defined roles.
- Default, hover, pressed, focus-visible, disabled, loading, and applicable validation states exist.
- Keyboard and screen-reader behavior comes from an accessible primitive rather than custom reimplementation.
- Icon-only controls have an accessible name and tooltip.
- It remains usable in a narrow desktop window and at 200% zoom.
- It handles long and empty content without breaking hierarchy.
- It does not expose full account numbers outside callback detail.
- It introduces no decorative shadow, gradient, glow, or animation.

## 15. Governance

- `PRODUCT.md` governs product behavior and privacy. This document governs visual and interaction consistency.
- The semantic variables in `app/globals.css` are the color source of truth.
- Component implementations live in the shared UI layer; page-local copies of shared primitives are not permitted.
- Generated shadcn code may be adapted to this contract. Generated defaults are not automatically design-approved.
- New tokens require a named semantic role and both light and dark values.
- New component variants require a recurring product use case; one-off decoration is not sufficient.
- The custom scheduling calendar receives a dedicated specification at implementation time and must preserve all calendar rules in this document and `PRODUCT.md`.
