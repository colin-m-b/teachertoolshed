# Teacher Toolshed — Free tier / Pro tier plan

**Status: PROPOSAL, nothing built (revised 2026-09-12).** This document supersedes
decision 4 in `PLAN.md` ("Monetization: everything is free, no fake paywalls")
*only once Phase T1 below lands on `main`*. Until then, decision 4 stands and the
site stays free. Work in progress lives on the `freemium_plan` branch.

It follows the house convention: decisions first, then the phases, each with an
acceptance checklist that must pass before it is marked BUILT.

---

## 0. The one idea everything else hangs off

> **The server knows the teacher. It never knows the students.**

The site's strongest asset is the sentence on `privacy.html`: *"there is no
server to receive it."* That sentence is what lets a teacher use the tools
without asking their district for a vendor review, a DPA, or a NY Ed Law 2-d
agreement, and it is what makes EU use a non-event. A paid tier must not spend
that asset.

| | Lives where | Who can see it |
|---|---|---|
| Rosters, names, scores, notes, seating, writing | Teacher's browser (IndexedDB), exactly as today | Teacher only |
| Optional cloud copy of the above (Pro) | **Teacher's own Google Drive / OneDrive**, written from the browser with the teacher's own OAuth token | Teacher, and their school's existing Google/Microsoft agreement |
| Who paid, for what, until when | Merchant of record (Lemon Squeezy or Paddle) + a licence key in the teacher's browser | Us, the MoR |

Nothing in the third row references a student. Nothing in the first two rows
ever touches a server we run. The FERPA paragraph on the privacy page stays
true word for word; the GDPR position is that we process one data subject
(the teacher, as a customer) and zero children.

**Rejected alternative — accounts + our own database (Supabase, as in
`ARCHITECTURE.md`).** The moment rosters sit in our Postgres, we hold
education records: FERPA "school official" language, state student-privacy
laws (NY 2-d, IL SOPPA, CA SOPIPA), GDPR Art. 28 processor contracts with every
EU school, a DPO question, breach-notification duties, and data residency for
EU customers. That is a compliance programme, not a side project. End-to-end
encrypted sync is better but still "we store encrypted student data", and
teachers lose everything if they forget the passphrase. Not now; possibly
never.

---

## 1. Decisions

### D1. What Pro is

**Free is "run any lesson, with any tool, today, on this device."**
**Pro is "your records, kept for the year, on every device."**

That line follows from a fact about the site: local browser storage is
reliable for a lesson and unreliable for a year. Safari evicts site storage
after about a week idle; school laptops are reimaged over the summer;
teachers move between a home machine, a school machine and a phone; a
district policy push can clear site data without warning. So any feature that
depends on records surviving the term (history, per-student views, reports)
is only an honest promise when paired with sync. History and sync are one Pro
feature, not two.

The gates sit where the teacher already feels the value: the moment *after*
the lesson when they want the record. Three rules hold everywhere:

1. **Nothing a student sees is gated.** Hex canvas, PureWrite writing surface
   and its exports, Brain Breaks. A student's browser has no licence, so a
   gate there is unenforceable as well as wrong.
2. **Nothing that fires during a lesson is gated.** Timers, tapping, scoring,
   randomising, printing. Free must never gate in front of a class.
3. **Export of the teacher's own data is never gated.** A backup held hostage
   is the one thing that would earn the site a bad name.

### D1a. Tool by tool

| Tool | Free | Pro |
|---|---|---|
| **Class Lists** | 2 classes, paste-in, JSON export/import | Unlimited classes; CSV import (Google Classroom, school exports); **Drive/OneDrive sync**; student IDs across tools |
| **Talk Tracker** | Setup, live tapping, talking points, target, summary, Print, current session | CSV export; session history; **term participation report per student**; unlimited saved rubrics |
| **Presentation Tracker** | Session, timer, rubric scoring, per-student overrides, Print, one saved rubric | CSV export; session history; per-student view across sessions; unlimited rubrics + shared rubric library with Talk Tracker |
| **Seating Chart Maker** | All layouts, randomize, swap, Print, one saved chart per class | Unlimited saved charts with history; Download PDF; **constraints** (keep apart, front row, then generate) |
| **Hexagonal Activity** | Create, share link, students build and export their canvas | Saved activity library (reuse, duplicate); printable hexagon sheets (PDF); teacher template gallery |
| **PureWrite** | Everything students touch, **including PDF and Word export** | Setup-page task library (prompts, passages, targets reused across classes); class-branded export header; integrity cover page (focus losses, paste attempts, already counted) |
| **Stack Splitter** | The whole thing: coversheets, split, zip, save to folder | Configurable filename scheme; save into a Drive-synced folder; batch across several classes |
| **Brain Breaks** | Everything | — |

**Do not cap hexagons**, ever. The canvas is the student surface, the activity
is encoded in the share link, and a thinking activity with a hexagon limit is a
worse activity.

**Class cap.** 2 on Free. It is a nudge, not the pitch: a teacher can delete
and re-paste a class for free forever, and that is fine, because pasting a list
gets them into the lesson and never gets them the CSV afterwards. Tune after
launch; never downward for existing users.

**Build before launch, because they are Pro by nature and cheap:** seating
constraints and the Talk Tracker term report.

### D2. Enforcement is client-side and honest about it

Limits are checked in the browser by a new `js/toolshed-licence.js`. A
determined teacher can open DevTools and flip a flag. That is fine: the
customer is a teacher paying $3 a month, not a pirate, and every indie desktop
app for thirty years has worked this way. Do not build a server-side wall to
stop a hypothetical; it would need accounts, which breaks §0.

### D3. Licence keys, not accounts

A licence is a proof of purchase; an account is an identity. This site sells
to individuals using one or two devices, which is the licence-key case.

Buying produces a **licence key** (MoR-issued). The teacher pastes it into
`teacher-tools/rosters.html`. The browser calls the MoR's public
licence-validation endpoint with *only the key* — no email, no roster, no
student data — and stores the result locally.

- Re-validate silently every 30 days; **90-day offline grace** so a teacher
  on a locked-down school network never loses Pro mid-term.
- One key activates up to **3 devices** via the MoR's activation count.
- No password, no login page, no reset flow, no session cookies.

**If accounts are ever needed** (school licences with per-seat admin), the
architecture that keeps §0 intact is identity-only: a hosted auth provider
(Supabase Auth / Clerk) for Google or Microsoft sign-in, one table of
`{user, email, plan, expiry, mor_customer_id}`, one Netlify Function for the
MoR webhook, rosters still in IndexedDB. Costs: a session cookie (the
"no cookies" line goes), a GDPR controller relationship with each teacher, a
delete-account flow. An account can hold a licence key internally, so keys
sold before that day keep working. Not in this plan.

### D4. Merchant of record

Selling from outside the US to teachers in the US, EU and UK means EU VAT
(OSS), UK VAT over threshold, and US state sales tax where SaaS is taxed. A
**merchant of record** is legally the seller and remits all of it; you get a
payout.

| | Lemon Squeezy | Paddle | Stripe (not MoR) |
|---|---|---|---|
| Tax handled for you | ✔ | ✔ | ✗ |
| Licence keys + public validate/activate API callable from a static page | ✔ | ✗ (needs a function + key service) | ✗ |
| Fee | ~5% + 50¢ | ~5% + 50¢ | 2.9% + 30¢ + accountant |
| Fits a no-server static site | best | needs one function | needs several |

**Recommendation: Lemon Squeezy.** Payouts go to a US bank account, which the
owner has. That does not change the tax picture: income is taxed where you
live and work, and a US citizen files a US return on worldwide income
regardless. Decide before launch whether the seller on the MoR account is you
as an individual or a local entity; changing it later means a new store.
Budget one paid hour with an expat accountant.

### D5. Pricing

Benchmarks: Classroomscreen Pro ≈ €4/mo, Wheel of Names Premium ≈ $5/mo,
Quizlet Plus ≈ $3/mo annual. Teachers pay $3–5/month for something used weekly.

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | forever, no card, no signup |
| **Pro, annual** | **$29 / year** | the headline; the only one on the button |
| Pro, monthly | $4 / month | exists so nobody bounces on "annual only" |
| **Founding year** (first 6 months of sales) | $19 first year, renews at $29 | early-adopter energy without a permanent liability |
| Department (up to 10 teachers) | $149 / year | one key, 30 activations |
| School (unlimited) | $399 / year | invoice, PO, W-9 / VAT number on request |

**No lifetime licence.** It caps revenue from the most enthusiastic users,
creates a support obligation with no income behind it, and anchors $29/year as
expensive. The founding-year discount replaces it.

Rules: price in USD and let the MoR localise; enable purchasing-power-parity
discounts if offered; never raise prices on existing subscribers; 30-day
no-questions refund on the pricing page; no free trial (Free is the trial).

### D6. The site is still a static site

No framework, no build step, no npm. Additions: two JS modules, a pricing page,
a help page per tool, a `_headers` file, and (Phase T3) an OAuth client ID in a
config constant. Netlify Functions only for a school-licence webhook if the
MoR forces it.

### D7. Analytics, cookies and the footer line

**Analytics.** The privacy promise is about *student data* never leaving the
browser; page-view counting does not touch it. What changes is the sentence
"no analytics". Two honest options:

- **Plausible** (EU company, cookieless, no personal data, no consent banner
  under current guidance): script on the page, counts URL, referrer, country,
  browser class. It does not send URL fragments, so hex share links stay
  private. Privacy page then says: "we count page views with Plausible; it
  stores no personal data and sets no cookies; nothing you type is included."
- **Netlify server-side analytics** ($9/mo): counts from request logs, no
  script on the page, and "no tracking scripts" stays literally true.

Pick one before T1. Never Google Analytics.

**Cookies.** Nothing requires announcing the absence of cookies, but it is
good marketing. One footer line, not a dismissable banner: *"No cookies. No
accounts. Nothing you type leaves your browser."* It is only true once Google
Fonts is self-hosted (T0), and it goes the day an account or session cookie
arrives.

**No public changelog.** A "last updated" date on the landing page does the
same job.

---

## 2. Privacy and law

### Free tier — two fixes needed regardless

1. **Google Fonts is loaded from Google on every page.** LG München I
   (3 O 17493/20, Jan 2022) held this transmits the visitor's IP to Google
   without consent and breaches GDPR. Self-host the three families
   (`css/fonts/`, WOFF2, OFL-licensed) and drop the `<link>` tags.
2. **Seating Chart Maker fetches jsPDF from cdnjs** at
   `seating-chart-maker.html:836`, though `vendor/jspdf.umd.min.js` is already
   in the repo. Use the vendored copy.

After both, `privacy.html` can say *"Pages make no outside requests at all."*

### Pro tier — what the teacher gives us

| Data | Held by | Basis |
|---|---|---|
| Name, email, card, billing country | MoR (controller for the sale) | contract; MoR publishes its own policy and DPA |
| Licence key, plan, activation count | MoR, and the key in the teacher's browser | contract |
| Support emails | Your mailbox (pick a provider with an EU DPA) | legitimate interest; tell teachers not to paste student names into support mail |

We hold no customer database ourselves. "Delete my data" is a request to the
MoR plus deleting an email thread; say so on the privacy page.

### Pro tier — Drive/OneDrive sync (T3)

- Token obtained client-side via Google Identity Services / MSAL; it never
  passes through a server we run.
- Scope `drive.appdata` or `drive.file` (both "non-sensitive"); Google
  verification still needs a verified domain, a privacy policy URL and a demo
  video of the consent flow. **Start the application in T1; it takes weeks.**
- The file written is exactly the JSON that Export already produces. Sync =
  export on change, import on open, `updatedAt` wins (the rule `importAll`
  already implements).
- School-managed Google accounts fall under the school's existing Workspace
  for Education agreement. Some districts block third-party OAuth; the help
  page says so and points at JSON export.

### Documents to add (static pages, editorial system)

- `pricing.html`, `terms.html` (licence per teacher, non-transferable; school
  licence per site; governing law = residence country; MoR's terms cover the
  sale), updated `privacy.html` with a real contact address (GDPR requires
  one), an imprint if resident in DE/AT/CH, and a one-page
  `for-your-it-department.html`: what is stored where, FERPA and GDPR
  reasoning, OAuth scopes, sub-processors (MoR only).

### Student-facing pages stay data-free

Hex canvas, PureWrite writing surface, Brain Breaks: no licence check, no
sync, no analytics, no fonts fetched from anywhere. Keep the URL-fragment
share mechanism exactly as it is.

---

## 3. Teaching teachers to use it

**First, before any video: "Load a sample class".** A fictional roster of ~24
names (plausibly international, obviously not real, a couple of shared first
names so disambiguation shows) as a constant in `js/toolshed-sample.js`; a
button on Class Lists that calls the existing `saveRoster` with a fixed id so
loading twice replaces rather than duplicates; a "Sample" tag in the list; a
one-line notice in tools when the active roster is the sample. Optionally seed
a demo rubric and seating layout the same way. About an afternoon. Every video
and screenshot then uses it, and no real student name can ever appear.

**YouTube, with three rules.** Never embed the player directly (it sets Google
cookies and drags a banner onto a site that needs none): use a click-to-load
poster that swaps in a `youtube-nocookie.com` embed. Never show a real roster.
Keep it short: one video per tool, 2–4 minutes, the first real task, plus a
60-second overview. OBS, 1080p, captions corrected, help-page URL in every
description.

**Help pages** (`help/<tool>.html`): 150-word "what it is for", the steps, the
video, a "things that go wrong" list. Linked from each tool's header.

---

## 4. Scalability

A tool page is 10–60 KB; `vendor/` is ~3 MB but only Stack Splitter loads the
heavy parts (~2.3 MB). Netlify free gives 100 GB/month: worst case, every visit
a cold-cache Stack Splitter visit, ≈ **43,000 visits/month** before the cap.
Netlify Pro ($19/mo) lifts it to 1 TB; Cloudflare Pages has no cap and deploys
the same folder, so moving is a DNS change. Do not move pre-emptively.

Do now: `_headers` with `Cache-Control: public, max-age=31536000, immutable`
on `vendor/*`, `css/*`, `js/*`, fonts (version filenames when a lib changes),
plus `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, and a CSP once fonts are self-hosted.

Nothing else needs to scale, because it never exists: no database, no session
store, no API. The licence check hits the MoR, whose job is to scale.

---

## 5. Also worth doing (pick, don't do all)

- `navigator.storage.persist()` on Class Lists (Chrome/Firefox stop evicting
  the site; Safari ignores it, say so on the privacy page).
- Backup nudge after a session ends, once a week, never on page load.
- PWA manifest + service worker for every tool, on PureWrite's `sw.js` pattern.
- Email list (Buttondown or Kit, double opt-in) on the landing page.
- A landing page per tool with a real H1 for search.
- Accessibility pass on Talk Tracker and Presentation Tracker.
- Student Privacy Pledge signatory once the privacy page is final.

---

## 6. Phases and what each takes

Estimates are for one person who knows the codebase, in focused days.

### T0. Ground work — BUILT 2026-09-12

- Self-host fonts; remove Google Fonts `<link>`s from all pages.
- Seating Chart Maker uses `vendor/jspdf.umd.min.js`.
- `_headers` (cache + security headers).
- `navigator.storage.persist()` on Class Lists.
- "Load a sample class".
- Historical banner over Phase 1 in `PLAN.md` (the cream/gold CSS it
  describes no longer exists).
- Update `privacy.html` ("no outside requests"), `README.md`, footer line.

**Accepted:** headless Chromium loaded all 11 pages with zero requests to any
origin but the site's own, no console errors, the three families reported as
loaded; the same pages loaded clean with the `_headers` CSP applied; the sample
class seeds 24 students, shows a "Sample" tag, and reloading it replaces
rather than duplicates; Seating Chart Maker builds its PDF from the vendored
jsPDF. Not yet verified: behaviour on a real Netlify deploy (the `_headers`
file only takes effect there) and Safari.

### T1. Licence module, gates, pricing — ~5 days + MoR setup

- `js/toolshed-licence.js`: `status()` → `{tier, plan, validUntil, checkedAt,
  activations}`; `activate(key)`; `deactivate()`; `assertCan(feature,
  currentCount)` → `{ok, limit, upgradeUrl}`. Activation stored in IndexedDB
  (`meta` store, bump `DB_VERSION`), not localStorage, so export/import
  round-trips it. 30-day re-check, 90-day grace, network failure keeps last
  known state.
- Gates per D1a, each a `.notice` with one line of copy and one
  `.btn--primary` "See Pro". No modals, no nagging on tool open.
- Activation UI on `rosters.html`: paste key → "Pro until …" / "Free".
- `pricing.html`, `terms.html`, contact address on `privacy.html`, imprint if
  required, "for your IT department" page.
- MoR store: products for the plans in D5, licence keys on, activation counts
  (3 / 30 / 1000), refund text, tax collection on, PPP if offered, founding
  discount code with an end date.
- Analytics choice from D7 implemented, or explicitly declined.
- Start the Google OAuth verification application now (needed by T3).
- `PLAN.md` decision 4 rewritten to point here; `README.md` first line
  changes from "free classroom tools" to honest phrasing.

**Accept when:** a test-mode purchase yields a key that activates in a fresh
browser; a simulated 91 days offline reverts to Free with no data loss; a
Free teacher is stopped politely at the 3rd class and at each gate in D1a;
`grep ToolshedLicence` matches nothing in `hexthinking.html` canvas code,
`purewrite.html`, `brain-breaks.html` or `stack-splitter.*`; pricing, terms
and privacy are reachable from the footer.

### T2. The Pro features that do not exist yet — ~6 days

- Session history + per-student view in Talk Tracker and Presentation
  Tracker (query over what the store already holds).
- Talk Tracker term participation report (print + CSV).
- Seating constraints (keep apart, fixed seat, then generate).
- Shared rubric library across the two trackers.
- Hex activity library; PureWrite task library; integrity cover page.
- Saved-chart history in Seating.

**Accept when:** each feature works on the sample class, is gated per D1a,
and survives export → clear site data → import.

### T3. Sync to the teacher's own Drive / OneDrive — ~5 days + verification wait

- `js/toolshed-sync.js` behind the store's async seam: export on change
  (debounced), import on open, `updatedAt` wins, "Last synced …" on Class
  Lists, off by default.
- Google client (verification from T1), Microsoft app registration.
- Help page section on blocked school accounts.

**Accept when:** two browsers converge within a minute; revoking the token at
Google leaves local data intact; DevTools proves no request to any origin but
Google's/Microsoft's carries the payload.

### T4. Teaching material — ~4 days + recording time

- Help page per tool with video facade; seven videos; email list signup.

**Accept when:** a teacher who has never seen the site can complete each
tool's first task from the help page alone with the sample class; no real
student name appears anywhere.

### T5. School and department licences — only if asked for

- Invoice/PO through the MoR; W-9 and VAT-number handling documented. If
  per-seat admin is needed, that is the first server-side code on this site
  and gets its own privacy write-up first (see D3).

### Order and total

T0 → T1 → T2 → T3 → T4, roughly **22 focused days** of build plus waits on
MoR onboarding and Google verification. T2 and T3 can be swapped: launch with
history gated behind "coming with sync" is dishonest, so if T3 slips, launch
Pro on exports, libraries, constraints and the report, and add sync when it
is ready.

---

## 7. Open questions for the owner

1. Country of residence, and whether you sell as an individual or a local
   entity (imprint, MoR account holder, tax conversation).
2. Confirm Lemon Squeezy onboarding works from where you live.
3. Plausible, Netlify analytics, or none.
4. Which two tools get videos first? (Suggestion: Stack Splitter, because it
   is the one people cannot believe works, and Class Lists, because everything
   starts there.)
