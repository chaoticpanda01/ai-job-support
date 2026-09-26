# Settings page overhaul

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:**
[2026-09-26-design-foundation-shell-home-design.md](2026-09-26-design-foundation-shell-home-design.md)
(tokens, primitives, `PageHeader`). It is carved out of that spec's "spec
2" (page migration), and brings the form controls spec 2 planned.

## Goal

Make `/dashboard/settings` coherent and quick to use, and give it the same
look as Home. Today the page has these problems:

- **Layout**: a 2,570px-tall single column of 21 fields in a ~400px strip.
- **Saving**:
  - Two independent forms, each with a "Save changes" button far from the
    other. Saving one silently leaves the other's edits unsaved.
  - A photo that saves immediately, while every other field needs Save.
  - `visa_status`, which decides whether the visa fields are required, lives
    in the other form, so the requirement only updates after a save.
- **Fields**:
  - "REQUIRED" tags on almost every field.
  - "Commute time" and "Dependents" as bare checkboxes.
  - Roles and industries as "comma-separated" text.
  - A "Preferred language" setting that changes nothing visible. The
    backend only passes it to the two visa prompts as context, and the UI
    language comes from the switcher's cookie.
- **Style**: none of the new design (plain title, small labels, no cards).

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Save model | One form, one save bar ("N unsaved changes · Discard · Save changes") |
| "Preferred language" | Replaced by the real app language switcher in an Account section; the profile field leaves Settings (its stored value stays, for the visa prompts' context) |
| Layout | Sticky section menu + cards on one scrolling page; section chips on phones |

## 1. Page structure

`PageHeader` shows the title "Settings" (Mincho) and the lead "Your profile,
your 履歴書 details and your account."

Below it, on `lg` and up, a two-column grid: a 150px sticky section menu
beside the cards. Below `lg`, the menu becomes a sticky, sideways-scrolling
row of section chips above the cards. The page reads top to bottom:

1. **Completeness banner** (existing logic, restyled):
   - When fields are missing, a warning-toned panel reads "Your 履歴書 needs
     {n} more details:" followed by one link per missing field. Each link
     scrolls to and focuses that field, as today.
   - When complete, a success-toned "Your 履歴書 has everything it needs".
2. **Cards**, each a `Card` with an `id` for the menu. Fields are two across
   on `md` and up, one column below. The table's "Full" means the field
   spans both columns.

| Card (`id`) | Description line | Fields |
|---|---|---|
| Profile (`profile`) | Printed at the top of your 履歴書. | Full name · Name in katakana (furigana) · Date of birth · Gender · Nationality *(optional)* · Phone number · Mailing address *(full)* · Email *(read-only)* · Photo *(optional)* |
| Visa & residence (`visa`) | Category and expiry are needed on your 履歴書 once you hold a visa. | Current visa status *(full; segmented, reusing today's labels: No visa / not yet applied · Application pending · Currently held)* · Visa category · Residence card expiry |
| 履歴書 extras (`extras`) | All optional. Hobbies and skills fill the 特技・趣味 box (left empty if blank). Commute time and dependents print only on the landscape 履歴書, and only when switched on. | Hobbies · Special skills · "Show commute time (通勤時間)" switch + text · "Show dependents (扶養家族)" switch + text · Requests to the employer *(full)* |
| Career (`career`) | Optional. Used to tailor your documents and job matches. | Japanese level (JLPT) · Years of work experience · Target roles *(full; chips)* · Target industries *(full; chips)* |
| Account (`account`) | none | App language (EN · ID · JP) |

3. **Delete account**:
   - A separate card below Account, with a `destructive-soft` border.
   - Its title is "Delete account", followed by the existing description.
     The button is "Delete my account…".
   - The confirm flow is unchanged: type the phrase, confirm, delete, sign
     out, redirect.
   - It is not part of the form.

**Field details:**

- **No "Required" tags.** In Profile and Visa & residence, where most
  fields are needed by the 履歴書, only the others (Nationality, Photo) say
  "Optional". Cards whose fields are all optional (履歴書 extras, Career)
  say so once, in their description, instead of tagging every field. The
  banner is what tracks completeness.
- **Visa fields required only when a visa is held**: Visa category and
  Residence card expiry. This follows the **current, unsaved** visa status,
  so the banner updates as soon as the status changes.
- **Email**:
  - Read-only, from `me.user.email`.
  - Hint: "From your sign-in. Change it in your account menu."
  - It is not sent on save.
- **Photo**: the existing `PhotoUploader`, unchanged, which uploads
  immediately. Hint: "Saves as soon as you upload it."
- **Commute time / Dependents**:
  - A `Switch` labelled "Show commute time (通勤時間)" / "Show dependents
    (扶養家族)".
  - On reveals a text input. Hints: "For example 約45分" / "For example
    配偶者1名".
  - Switching off clears the value, as the checkbox does today.
  - Off shows the hint "Off: no 通勤時間 box on your landscape 履歴書." (or
    "扶養家族 box").
- **Requests to the employer**:
  - It keeps its default, 貴社の規定に従います。.
  - Hint: "The standard phrase: 'I will follow your company's rules.'
    Change it only for a specific request."
- **Roles and industries**: `TagInput` chips, stored as the existing
  `target_role` and `target_industry` string arrays.
- **App language**: the existing `LanguageSwitcher`. Hint: "Changes the app
  straight away; not part of Save."

## 2. Behaviour

### Saving

- **One form state** is loaded from `useMe()`, for every field except email,
  photo and app language.
- The **saved values** are the snapshot the form loaded, refreshed after
  each successful save.
- **Changed fields** are those whose form value differs from the saved
  value. Arrays are compared by content, in order.
- **Unsaved count** is the number of changed fields.
- **Save bar**:
  - Rendered only when the count is at least 1. It is fixed to the bottom
    of the viewport and spans the main column.
  - It shows "{n} unsaved change" / "{n} unsaved changes", a "Discard"
    button, and a primary "Save changes" `Button`.
  - While saving, Save has `loading`.
- **Save**:
  - Runs validation, then sends **only the changed fields** with the
    existing `useUpdateProfile().mutateAsync(changes)`.
  - **On success**: a toast "Saved"; the saved snapshot becomes the
    refreshed profile, so the count returns to 0 and the bar leaves.
  - **On failure**: the bar stays with the error message (existing
    `apiErrorMessage`), and all edits are kept.
- **Validation**: years of experience must be 0 to 80, as today. A failure
  is shown on the field, and Save does not send. Missing 履歴書 fields never
  block Save.
- **Discard** resets every field to the saved snapshot.
- **The chat button** shifts up while the save bar shows, so it never
  covers Save. The save bar sets `--save-bar-offset` on
  `document.documentElement` to its height while mounted, and the chat
  widget's container uses `bottom: calc(1.5rem + var(--save-bar-offset, 0px))`.

### Leaving with unsaved changes

- **Tab close or reload**: a `beforeunload` handler asks the browser for its
  own prompt, while the count is above 0.
- **In-app links**:
  - A capture-phase click listener on `document`, active only while the
    count is above 0.
  - It acts only on a primary-button, unmodified click on an `<a href>` to
    the same origin, without `target` or `download`. It does not act on a
    link inside the page's own section menu, which only scrolls.
  - It calls `preventDefault()` (Next's `Link` then skips navigating) and
    opens the existing confirm dialog:
    - Title: "Discard unsaved changes?"
    - Confirm: "Discard"
    - Cancel: "Keep editing"
  - On Discard it navigates with `router.push(href)`.

### Section menu

- Links to `#profile`, `#visa`, `#extras`, `#career` and `#account`.
- The card most in view is highlighted (an `IntersectionObserver`) and
  marked `aria-current="true"`.
- Clicking scrolls (smooth only under `motion-safe`, via the existing
  `html` class). Cards have `scroll-mt` so the sticky header and chips don't
  cover their titles.

## 3. Components and files

### New form primitives (`components/ui/`)

| Component | API and behaviour |
|---|---|
| `field.tsx` | `Field({ label, hint?, error?, optional?, children, className? })`. It renders the label (with an "Optional" tag when `optional`), the control, the hint and the error. It passes `id`, `aria-describedby` (hint + error) and `aria-invalid` to its single child via `cloneElement`, and generates the `id` with `useId` unless the child has one. |
| `input.tsx` | `Input`: a styled native `input`. Takes `changed?: boolean`, which adds the indigo outline for an unsaved field. |
| `select.tsx` | `Select`: a styled native `select`, with `changed?`. |
| `textarea.tsx` | `Textarea`: a styled native `textarea`, with `changed?`. |
| `switch.tsx` | `Switch({ checked, onCheckedChange, label, id? })`: a `button` with `role="switch"` and `aria-checked`, and a visible `label` element tied to it. Space and Enter toggle it. |
| `segmented-control.tsx` | `SegmentedControl({ legend, value, options: {value,label}[], onChange, name })`: a `fieldset` + `legend` of native radio inputs, visually hidden and styled as segments. Arrow keys work natively. |
| `tag-input.tsx` | `TagInput({ label?, value: string[], onChange, placeholder, removeLabel })`. Enter or comma adds the trimmed text as a chip (duplicates and empty text are ignored); Backspace in an empty input removes the last chip; each chip has a ✕ button labelled `removeLabel.replace("{tag}", tag)`. |

### Settings (`components/settings/`)

| File | Does |
|---|---|
| `settings-form.tsx` | Owns the form state, the saved snapshot, save, discard and validation. Renders the banner, the cards, the save bar and the leave guards. |
| `section-nav.tsx` | The sticky menu (lg+) and the chip row (below lg), with scroll-spy. |
| `completeness-banner.tsx` | The restyled banner. |
| `profile-card.tsx`, `visa-card.tsx`, `extras-card.tsx`, `career-card.tsx`, `account-card.tsx` | One card each. Each receives `form`, `saved` and `onChange`. |
| `delete-account-card.tsx` | The existing `DangerZone` logic, restyled; not part of the form. |
| `save-bar.tsx` | The bar and the `--save-bar-offset` variable. |
| `use-leave-guard.ts` | The `beforeunload` handler and the capture-phase link interception. |

### Pure modules (`lib/`)

- **`lib/settings-form.ts`**:
  - `type SettingsForm`: every form field.
  - `formFromProfile(me: MeResponse): SettingsForm`, where
    `personal_requests` defaults to 貴社の規定に従います。 as today.
  - `changedFields(saved: SettingsForm, form: SettingsForm): Partial<SettingsForm>`
  - `validateSettings(form): Partial<Record<keyof SettingsForm, string>>`,
    using the same zod rule as today for `years_experience`.
- **`lib/rirekisho-completeness.ts`**:
  - `BASE_REQUIRED_KEYS`, `VISA_HELD_REQUIRED_KEYS`,
    `applicableRequiredKeys`, `totalRequiredCount`, `isDateOfBirthMissing`,
    `isFieldMissing`, `computeMissingRirekishoFields` and
    `REQUIRED_FIELD_LABEL_KEYS`.
  - **Moved unchanged** from the page, including their comments. The
    backend mirror note stays.
  - `tests/invariants.test.ts` reads this file instead of the page.

**`app/dashboard/settings/page.tsx`** becomes the `PageHeader`, a loading
skeleton while `useMe` loads, and `<SettingsForm />`.

**`components/chat-widget.tsx`**: the container's `bottom-6` becomes
`bottom-[calc(1.5rem+var(--save-bar-offset,0px))]`.

### Strings (`lib/i18n.ts`, `settings` section; en, id, ja)

**New strings:**

- The lead: "Your profile, your 履歴書 details and your account."
- Section titles: "Visa & residence", "履歴書 extras", "Career",
  "Account".
- The five card descriptions from §1.
- Labels and field text:
  - the "Optional" tag
  - "Email" and its hint
  - the photo hint
  - "Show commute time (通勤時間)" and "Show dependents (扶養家族)", with
    their example and off hints
  - the "Requests to the employer" label and its hint
  - "App language" and its hint
  - "Add a role…" and "Add an industry…"
  - the remove-tag label "Remove {tag}"
  - the section menu's label "Settings sections"
- The banner texts: "Your 履歴書 needs {n} more details:" and "Your 履歴書
  has everything it needs".
- The save bar: "{n} unsaved change", "{n} unsaved changes", "Discard",
  "Saved".
- The leave dialog: title, "Discard", "Keep editing".

**Reused**: the existing field labels, the gender options, the visa status
options, and the delete strings.

**Removed**, once nothing reads them:

- `required`, `recommended`, `preferredLang`, `rirekishoInfo`,
  `rirekishoInfoHint`, `jobPreferences` and `jobPreferencesHint`
- the old "comma-separated" hints `targetRolesHint` and
  `targetIndustriesHint`
- the old banner strings, once replaced

Every placeholder (`{n}`, `{tag}`) appears in all three languages. The
existing i18n test enforces this.

## 4. Accessibility

- **Headings and landmarks**: one `h1` (PageHeader), and an `h2` per card.
  The section menu is `<nav aria-label="Settings sections">`, with
  `aria-current` on the section in view.
- **Fields**:
  - Every field has a visible `label`. Hints and errors are tied by
    `aria-describedby`, and errors set `aria-invalid`.
  - Changed-field marking is not colour alone: the save bar's count names
    how many fields changed.
- **The save bar** is a `region` labelled by its count text, with
  `aria-live="polite"` on the count.
- **Focus**:
  - The banner's missing-field links focus the field, as today.
  - Discarding from the leave dialog navigates.
  - Cancelling the leave dialog returns focus to the clicked link (the
    confirm dialog already restores focus).
- **Controls**: the switch and segmented control are keyboard-operable, as
  specified in §3. Each tag's ✕ has an accessible name.

## Testing

Tests use vitest and Testing Library, as elsewhere.

**Updated test files:**

- **`tests/app/settings.test.tsx` is rewritten** for one form. Every current
  behaviour is kept:
  - completeness count, and the missing list, including the visa-held
    condition and the age range
  - jump-to-field links focusing the field
  - years-of-experience validation
  - a save failure showing the error, with no "Saved" left standing
  - `mutateAsync` rejections not escaping as unhandled
  - the delete flow: phrase gating, failure handling, sign-out failure
    still redirecting
- **`tests/invariants.test.ts`** reads `lib/rirekisho-completeness.ts`.

**New test files:**

- **`tests/lib/settings-form.test.ts`**:
  - `formFromProfile`, including the default request
  - `changedFields`: none after load, a single edit, arrays by content,
    reverting an edit removes it
  - `validateSettings`
- **`tests/components/form-controls.test.tsx`**:
  - `Field` wiring (id, describedby, invalid)
  - `Switch` role and keyboard
  - `SegmentedControl` as a radio group
  - `TagInput`: add with Enter and comma, ignore duplicates and blanks,
    Backspace, a named ✕
- **`tests/app/settings.test.tsx`, new cases**:
  - The bar is hidden with no edits and shows the count after edits.
  - Save sends only the changed fields.
  - After a successful save, the bar leaves and the "Saved" toast shows.
  - Discard restores the values.
  - Choosing "Currently held" makes the visa fields required in the banner
    before saving.
  - `beforeunload` is registered only while dirty.
  - An in-app link click while dirty opens the dialog: Keep editing stays,
    and Discard navigates.
  - The section menu marks the current section.
  - Email is read-only and not sent.
  - App language is not counted as a change.

**Gates**: `npm test`, `npm run lint`, `npm run type-check` and
`npm run format:check` pass.

## Verification in the browser

The user signs in themselves, and the password is never typed. Never run
`npm run build` while the dev server is up.

1. **Desktop**: the menu highlights as you scroll, and paired fields sit two
   across. Editing shows the bar with the right count. Save sends one
   request with only the changed fields (network panel), and the bar leaves
   with the toast.
2. **Leave guard**: with edits, a sidebar link opens the dialog. "Keep
   editing" stays, and "Discard" navigates.
3. **Visa**: switching to "Currently held" updates the banner at once.
4. **Phone (375px)**:
   - the chip row is sticky and scrolls sideways
   - there is one column and no horizontal scroll
   - the chat button sits above the save bar
5. **Languages**: 日本語 and Indonesian fit, with no overflow in the chips or
   the bar.
6. **Keyboard**: the menu, switches, segments and tag input are all
   operable, and the focus rings are visible.

## Out of scope

- Backend changes, including making `preferred_language` drive AI output.
- Localising Clerk's own screens.
- Any change to onboarding, which still sets `preferred_language` at
  signup.
- The other pages' migration (the rest of spec 2).
