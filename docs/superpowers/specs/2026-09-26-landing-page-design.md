# Landing page overhaul

**Date:** 2026-09-26
**Status:** Approved in brainstorming; awaiting spec review
**Builds on:**
[2026-09-26-design-foundation-shell-home-design.md](2026-09-26-design-foundation-shell-home-design.md).
It uses that spec's tokens, primitives, `BrandMark`, journey strings and Home
design. It is carved out of that spec's "spec 2" (page migration) because
it's the page where a redesign pays off most, and it's independent of the
job pipeline (spec 3).

## Goal

Make `/` attractive, professional and smart, and make it look like the
product it introduces. Today it is a generic SaaS layout: a centred hero, six
emoji feature cards, and "1-2-3" steps. It never shows the product, it
misses both brand elements (the seal and Mincho), its copy has drifted from
what the app does, and its sign-in buttons appear about a second late.

## Decisions made in brainstorming

| Question | Decision |
|---|---|
| Audience | Job seekers first; a quiet "About this project" strip for people evaluating the work |
| Hero layout | Split: headline and buttons on the left, live product preview on the right |
| Product visual | Purpose-built live preview built from the app's primitives and strings (not screenshots, not the real Home components) |
| Journey section | Three alternating rows (Prepare, Apply, Settle in), each with a small live preview |
| About strip | "Built by chaoticpanda01 as a portfolio project", the stack, and a GitHub link |
| Demo AI limit | Soft: the landing page says "Free to try"; the shared daily allowance is explained inside the app, as it already is |
| Auth buttons | Decided on the server, so the right ones are there on first paint |
| Phone | Designed for 375px first |

## 1. Page structure and copy

The copy below is definitive in English. Indonesian and Japanese
translations carry the same meaning and are written in the plan. Every
product claim was checked against the code:

- The UI follows the chosen language.
- Resume analysis and interviews follow the chosen language.
- **Job translation and the visa roadmap guidance are written in
  Indonesian.** The copy says exactly that.

### Header

- **Left**: `BrandMark` linking to `/`. Below `sm` it is `compact`, so the
  wordmark is visually hidden but still names the link.
- **Right**:
  - the existing `LanguageSwitcher`
  - **Signed out**: a "Sign in" text link to `SIGN_IN_ROUTE`, and a
    `Button` "Start free" to `SIGN_UP_ROUTE`
  - **Signed in**: a `Button` "Go to your dashboard" to `/dashboard`, and
    Clerk's `UserButton`

### Hero (split; stacks below `lg`)

- **Eyebrow**: For Indonesian professionals
- **h1** (`font-display`): Your move to Japan, one step at a time.
- **Lead**: Build your 履歴書, practise interviews in Japanese, and find the
  right visa, with the whole app in English, Bahasa Indonesia or 日本語.
- **Buttons**:
  - Signed out: **Start free** (primary, `SIGN_UP_ROUTE`) and **See how it
    works** (secondary, `#how`, with an `ArrowDown` icon).
  - Signed in: **Go to your dashboard** (primary, `/dashboard`) and **See
    how it works**.
- **Right**: `HomePreview`, a miniature of Home.

### Journey (`<section id="how">`, white band)

- **h2** (`font-display`): From your resume to your visa
- **Lead**: Three stages, the same ones you'll follow in the app.
- Three rows. Text is left and the preview right, except the Apply row,
  which is mirrored. On `md` and up the columns are equal; below `md` each
  row stacks, text first.
- Each row has a stage marker (a numbered seal ring and a seal-coloured
  stage label), an **h3** title, a lead, and a list of tools. Each list item
  has a lucide icon in indigo (`aria-hidden`).

| Stage | h3 | Lead | Tools (icon) | Preview |
|---|---|---|---|---|
| 1 Prepare | Documents Japanese employers expect | See your resume the way a Japanese recruiter reads it, then turn it into the forms they ask for. | Resume analysis with a Japan-market score (`FileSearch`) · 履歴書 in JIS format, as a portrait or landscape PDF (`FileText`) · 職務経歴書 written from your work history (`Files`) | `ScorePreview` |
| 2 Apply | Postings you can actually read | Paste a Japanese job ad and read it in Bahasa Indonesia, scored for how open it is to foreign hires. | Translation with a foreigner-friendliness score (`Languages`) · A match score against your resume (`Target`) · Mock interviews with written feedback, in Japanese too (`Mic`) | `JobPreview` |
| 3 Settle in | The visa, and the workplace | Find the visa that fits your background, and learn how a Japanese workplace runs. | Visa options with a step-by-step roadmap and checklist (`Stamp`) · Culture guides and a workplace glossary (`BookOpen`) | `VisaPreview` |

The stage labels reuse `nav.groupPrepare`, `nav.groupApply` and
`nav.groupSettleIn`, so the page and the app name the stages identically.

### Facts (four columns on `lg`, 2×2 on `sm`, one column below)

| Title | Text |
|---|---|
| Three languages | Every screen in English, Bahasa Indonesia or 日本語, and your resume feedback too. |
| JIS-format 履歴書 | Real PDFs, portrait or landscape, ready to send. |
| Interviews in Japanese | Practise the real thing, with feedback on each answer. |
| Free to try | Sign up and start with your resume. No payment details needed. |

Titles are `h3` under a visually hidden `h2` ("Why it's different"), so the
heading outline stays complete.

### About this project (white band, one line on `md` and up, stacked below)

- **Label** (`h2`, small uppercase, muted): About this project
- **Text**: Built by **chaoticpanda01** as a portfolio project. Next.js ·
  FastAPI · PostgreSQL · Gemini · Clerk
- **Link**: "View the code on GitHub" with an `ExternalLink` icon (`aria-hidden`)
  - Goes to `https://github.com/chaoticpanda01/ai-job-support` (the
    repository is public).
  - Uses `target="_blank"` and `rel="noopener noreferrer"`.
  - An `sr-only` suffix says it opens in a new tab.
- The name, stack and URL are data, not translated. "Built by" and the
  label are translated.

### Final prompt (signed-out only)

- **h2** (`font-display`): Start with your resume
- **Lead**: Upload it and see how a Japanese recruiter would read it.
- **Button**: Start free, to `SIGN_UP_ROUTE`

### Footer

`BrandMark` (compact on phones) and "© {year} · Built for Indonesian
professionals".

## 2. The previews (`components/landing/previews.tsx`)

There are four components: `HomePreview`, `ScorePreview`, `JobPreview` and
`VisaPreview`.

- **Built from the shared primitives**: `Card`, `Badge`, `Progress` and
  `BrandMark`. Their tokens, radii and type match the app automatically.
- **Real app strings where they exist.** In `HomePreview`, the next-step
  card uses `t("journey","shokumuTitle")` and `t("journey","shokumuWhy")`,
  the stage labels use `nav.group*`, and the step labels use
  `t("journey", <stepId>)`. Sample data (the name "Budi", "Backend Engineer
  · Tokyo", the visa name, the checklist items and the score labels) lives
  in the `landing` strings, so it translates too.
- **Decorative, but described.** Each preview's root is
  `<div role="img" aria-label={t("landing","preview…Label")}>` with a
  one-sentence translated description, for example "Preview of the Home
  page: the next step is to create your 職務経歴書". Every descendant is
  `aria-hidden`. Nothing inside is a link, button, input or otherwise
  focusable.
- **HomePreview**:
  - A miniature sidebar: seal, Home active with the seal stripe, the three
    group labels and their items.
  - A main area: the greeting (Mincho, "Welcome back, Budi"), a `Progress`
    at 4 of 8, the next-step card, and the three stage columns with the
    same done, next and to-do markers as Home.
  - Fixed sample state: Prepare has 4 of 5 done (profile, resume, analysis
    and 履歴書), with 職務経歴書 as the next step. That is the 4 of 8 shown in
    the progress bar. Apply and Settle in have nothing done.
- **ScorePreview**: "Japan-market score" with **72** in indigo, then
  "Strengths" and "To improve" labels, each over placeholder bars.
- **JobPreview**:
  - "Backend Engineer · Tokyo" and "Translated from Japanese".
  - `Badge` info "Visa sponsorship" and `Badge` neutral "N2".
  - "Foreigner-friendliness" **85**, with a `Progress`.
- **VisaPreview**: "Engineer / Specialist in Humanities", "Roadmap · step 2
  of 5", and three checklist rows: one done (indigo check) and two open.
- **Shadow**: the hero preview gets the one allowed shadow (it floats), and
  the journey previews get a lighter one. Both follow the foundation spec's
  "shadows only on floating things" rule, since these previews are
  presented as floating product shots.

## 3. Architecture

- **`app/page.tsx`** becomes a server component (no `"use client"`):

  ```tsx
  import { auth } from "@clerk/nextjs/server";
  export const metadata: Metadata = {
    title: { absolute: "Japan Job Support: your move to Japan, one step at a time" },
    description:
      "Build your 履歴書, practise interviews in Japanese and find the right visa. A free career guide for Indonesian professionals moving to Japan.",
  };
  export default async function Page() {
    const { userId } = await auth();
  // Metadata is English only: it's static and read by search engines and
  // link previews, which don't carry the visitor's language cookie.
    return <LandingPage signedIn={userId !== null} />;
  }
  ```

  The middleware already runs on `/` (`clerkMiddleware`, matcher covers all
  routes), which `auth()` needs. The root layout already reads a cookie, so
  the route is already dynamic.

- **`components/landing/landing-page.tsx`** (`"use client"`, because it
  reads `useLang`):
  - Holds the header, hero, journey, facts, about, final prompt and footer
    as small functions in the one file, as `app/dashboard/page.tsx` does.
  - Takes `signedIn: boolean`.
  - **No `<SignedIn>`/`<SignedOut>`.** They render nothing until Clerk's
    script loads, which caused today's empty-hero gap.
- **`UserButton`** still renders only once Clerk has loaded. Only the avatar
  waits, and that's acceptable.
- **The language** is already server-rendered from the cookie
  (`getSavedLanguage`), so there's no flash of English.
- **Smooth scrolling** to `#how` uses the `motion-safe:scroll-smooth` class
  on `<html>`, set in `app/layout.tsx`, so it only happens when the OS
  allows motion. Anchor jumps anywhere in the app get the same treatment.
- **Strings**:
  - The `landing` section in `lib/i18n.ts` is rewritten.
  - The `features` section is deleted.
  - Both are used only by the landing page (checked with grep).
  - All strings are in en, id and ja.
- **Removed**: the six emoji and the "1-2-3" steps.

## 4. Accessibility

- **Headings**: one `h1` (the headline), then `h2` for each section and `h3`
  for each stage and fact.
- **Landmarks**: `header`, `main#main-content` (the skip link target, as
  today) and `footer`.
- **Previews**: `role="img"` with a translated name, and nothing focusable
  inside.
- **Icons**: every decorative icon is `aria-hidden`.
- **Colour**: text uses only AA-passing tokens. Seal red is used only for
  marks: the brand mark, the stage labels and rings, and the eyebrow.
- **The external link** says it opens a new tab.
- **Focus**: the rings come from the primitives and the global
  `:focus-visible`.

## Testing

Tests go in `tests/app/landing.test.tsx`, using vitest and Testing Library.
`@clerk/nextjs/server`'s `auth` and `@clerk/nextjs`'s `UserButton` are
mocked. The async server page is rendered by awaiting `Page()`.

- **Signed out**:
  - "Sign in" goes to `/sign-in`.
  - "Start free" goes to `/sign-up`: in the header, the hero and the final
    prompt.
  - The final prompt is present.
  - There is no "Go to your dashboard".
- **Signed in**:
  - "Go to your dashboard" goes to `/dashboard`.
  - There is no "Start free" and no final prompt.
- **Structure**:
  - Exactly one `h1`, containing the headline.
  - The section `h2`s: journey, facts (visually hidden), about, and the
    final prompt when signed out.
  - Three stage `h3`s.
- **Previews**:
  - Four `img` roles with the translated names.
  - Each contains no focusable element (`a`, `button`, `input`, `[tabindex]`).
- **GitHub link**:
  - href `https://github.com/chaoticpanda01/ai-job-support`.
  - `target="_blank"`, and `rel` contains `noopener`.
  - Its accessible name includes the "opens in a new tab" text.
- **Jump link**: "See how it works" has href `#how`, and an element with
  `id="how"` exists.
- **Languages**: the headline and one preview name render in `ja` and in
  `id`.
- **No emoji**: the rendered text contains no `\p{Extended_Pictographic}`
  character.
- **Metadata**: `metadata.title` and `metadata.description` are set.
- **Existing i18n tests**: they cover completeness and placeholders for the
  rewritten section.
- **Mutation check**: flip `signedIn` handling, drop the final prompt's
  guard, and remove `aria-hidden` inside a preview. Each must fail a test.
- **Gates**: `npm test`, `npm run lint`, `npm run type-check` and
  `npm run format:check` all pass.

## Verification in the browser

The user signs in themselves, and the password is never typed. Never run
`npm run build` while the dev server is running.

1. **Signed out, no gap**: `curl -s http://localhost:3000/` with no cookies.
   The server's HTML already contains "Start free" and "Sign in". This
   proves first-paint buttons without asking the user to sign out.
2. **Signed in, desktop**: the header shows "Go to your dashboard" and the
   avatar, the hero preview renders, the journey rows alternate, and the
   facts, about strip and footer are all present.
3. **Phone (375px)**:
   - No horizontal scroll.
   - The header fits: the compact mark, the language switch and the buttons.
   - The hero, journey rows, facts and about strip stack as specified.
4. **Languages**: switch to 日本語 and Indonesian. Nothing overflows, and the
   previews translate.
5. **Keyboard**: the tab order is skip link → header → hero buttons →
   GitHub link → final prompt, and nothing inside the previews takes
   focus.
6. **Reduced motion**: with reduced motion emulated, "See how it works"
   jumps without smooth scrolling.

## Out of scope

- Other pages' migration (the rest of spec 2).
- The job pipeline (spec 3).
- Testimonials or usage numbers (there are none to cite honestly).
- A blog, pricing or FAQ.
- Changing the chat widget, which the root layout renders on every page.
- Any backend change.
