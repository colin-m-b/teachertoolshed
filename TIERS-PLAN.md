# Teacher Toolshed — Free tier / Pro tier plan

**Status: PROPOSAL, nothing built (2026-09-12).** This document supersedes
decision 4 in `PLAN.md` ("Monetization: everything is free, no fake paywalls")
*only once Phase T1 below lands on `main`*. Until then, decision 4 stands and the
site stays free.

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

So the split is:

| | Lives where | Who can see it |
|---|---|---|
| Rosters, names, scores, notes, seating, writing | Teacher's browser (IndexedDB), exactly as today | Teacher only |
| Optional cloud copy of the above (Pro) | **Teacher's own Google Drive / OneDrive**, written from the browser with the teacher's own OAuth token | Teacher, and their school's existing Google/Microsoft agreement |
| Who paid, for what, until when | Merchant-of-record (Lemon Squeezy or Paddle) + a licence key in the teacher's browser | Us, the MoR |

Nothing in the third row references a student. Nothing in the first two rows
ever touches a server we run. The FERPA paragraph on the privacy page stays
true word for word; the GDPR position is that we process one data subject
(the teacher, as a customer) and zero children.

**Rejected alternative — accounts + our own database (Supabase, as in
`ARCHITECTURE.md`).** The moment rosters sit in our Postgres, we hold
education records: FERPA "school official" language, state student-privacy
laws (NY 2-d, IL SOPPA, CA SOPIPA), GDPR Art. 28 processor contracts with every
EU school, a DPO question, breach-notification duties, and a data-residency
question for EU customers. That is a compliance programme, not a side project,
and it is the thing this site's whole pitch says it does not do. End-to-end
encrypted sync is better but still "we store encrypted student data", and
teachers lose everything if they forget the passphrase. Not now; possibly
never.

---

## 1. Decisions

### D1. What is free and what is Pro

**Free stays genuinely useful. Pro is convenience, not rescue.** A teacher
must be able to run a whole year on free without hitting a wall mid-lesson.
Gates only ever appear at *setup* moments, never in front of a class.

| | Free | Pro |
|---|---|---|
| All six tools + Brain Breaks + Class Lists | ✔ | ✔ |
| Classes (rosters) | up to **3** | unlimited |
| Saved rubrics (Presentation Tracker, Talk Tracker) | 2 | unlimited, shared library across tools |
| Saved seating charts / talk sessions / hex activities | 5 per tool | unlimited |
| JSON export / import backup | ✔ | ✔ |
| **Cloud backup + sync to your own Drive/OneDrive** | — | ✔ |
| PureWrite: PDF export | ✔ | ✔ |
| PureWrite: Word (.docx) export, batch zip of a whole class | — | ✔ |
| Stack Splitter | full | full (it is the most "wow" tool; gating it kills word of mouth) |
| Print / PDF everywhere | ✔ | ✔ |
| Support | none (as now) | email, 2 working days |
| School / department licence | — | ✔ (seat-based) |

Things deliberately **not** gated: anything a student sees (hex canvas,
PureWrite writing surface, Brain Breaks), anything that happens live in a
lesson (Talk Tracker tapping, Presentation Tracker timer), export of the
teacher's own data (holding backups hostage is the one thing that would
justify the "they'll enshittify it" fear).

The numbers (3 classes, 5 saved items) are a starting guess. Most secondary
teachers have 4–6 classes, so 3 is the point where a real teacher feels it
without a trial-lesson teacher feeling it. Tune after launch, never downward
for existing users.

### D2. Enforcement is client-side and honest about it

Limits are checked in the browser by a new `js/toolshed-licence.js`. A
determined teacher can open DevTools and flip a flag. That is fine: the
customer is a teacher paying $3 a month, not a pirate, and every indie
desktop app for the last thirty years has worked this way. Do not build a
server-side wall to stop a hypothetical; it would need accounts, which
breaks §0.

### D3. Licence keys, not accounts (Phase T1)

Buying produces a **licence key** (MoR-issued). The teacher pastes it into
`teacher-tools/rosters.html` (the shared page every tool already links to).
The browser calls the MoR's public licence-validation endpoint with *only the
key* — no email, no roster, no student data — and stores the result locally.

- Re-validate silently every 30 days; **90-day offline grace** so a teacher
  with a locked-down school network never loses Pro mid-term.
- One key activates up to **3 devices** (home laptop, school laptop, phone)
  via the MoR's activation count.
- No password, no login page, no reset flow, no session cookies, nothing for
  a GDPR cookie banner to be about.

Accounts (Google sign-in etc.) are **not** in this plan. If school licences
later need per-seat management, revisit — as a separate phase with its own
privacy write-up.

### D4. Merchant of record, because the operator is outside the US

You are a US citizen living abroad selling to teachers in the US, EU, UK and
elsewhere. Without a merchant of record you personally owe: EU VAT via OSS in
your country of residence, UK VAT once over threshold, and US state sales tax
in the states that tax SaaS (nexus rules vary by state; economic-nexus
thresholds are around $100k/200 transactions but some states count lower).
That is the wrong use of a teacher's evenings.

A **merchant of record** (MoR) is legally the seller: it collects and remits
VAT/GST/sales tax worldwide, handles refunds and chargebacks, and issues
tax-compliant invoices. You receive a payout.

| | Lemon Squeezy | Paddle | Stripe (not MoR) |
|---|---|---|---|
| Tax handled for you | ✔ | ✔ | ✗ (Stripe Tax calculates, you still file) |
| Built-in licence keys + public validate/activate API callable from a static page | ✔ | ✗ (needs a function + Keygen or similar) | ✗ |
| Fee | ~5% + 50¢ | ~5% + 50¢ | 2.9% + 30¢ + your accountant |
| Fits a no-server static site | best | needs one Netlify Function | needs several |

**Recommendation: Lemon Squeezy** (owned by Stripe since 2024). One caveat to
verify before committing: that your country of residence is on its supported
payout list, and that payouts to a non-US bank in your residence country work.
If not, Paddle plus a ~40-line Netlify Function that mints/validates keys.

**Personal-tax note (not advice; ask an accountant who does US-expat
returns):** as a US citizen you file a US return on worldwide income
regardless of where you live. Self-employment income abroad usually means
Schedule C + SE tax unless a totalization agreement applies; the Foreign
Earned Income Exclusion may or may not cover it; FBAR/FATCA thresholds on
foreign accounts are low. Your country of residence taxes you too, probably
first. Decide *before launch* whether the seller on the MoR account is you as
an individual or a local sole-proprietorship/company — changing it later
means a new MoR store. Budget one paid hour with an expat accountant; it is
cheaper than one mistake.

### D5. Pricing

The customer pays out of their own pocket, resents subscriptions, and is
extremely price sensitive. Benchmarks: Classroomscreen Pro ≈ €4/mo, Wheel of
Names Premium ≈ $5/mo, Quizlet Plus ≈ $3/mo annual, Canva for Education free.
Teachers do pay $3–5/month for something they use weekly.

| Plan | Price | Notes |
|---|---|---|
| Free | $0 | forever, no card, no signup |
| **Pro, annual** | **$29 / year** (≈ $2.42/mo) | the headline; the only one on the button |
| Pro, monthly | $4 / month | exists so nobody bounces on "annual only"; costs more so nobody picks it |
| **Founding teacher** (first 200 or first 6 months) | $49 **once, lifetime** | funds year one, rewards early word-of-mouth, converts the people who hate subscriptions |
| Department (up to 10 teachers) | $149 / year | one key, 30 activations |
| School (unlimited) | $399 / year | invoice, PO, W-9 / VAT number on request — schools buy this way |

Rules that go with it:

- **Price in USD, let the MoR localise** (it shows € / £ and adds tax at
  checkout, which also solves "is the price incl. VAT?" for EU teachers).
- Enable the MoR's purchasing-power-parity discounts if available (teachers in
  lower-income countries are a real audience and cost nothing to serve).
- Never raise the price on existing subscribers; grandfather.
- A **30-day no-questions refund**, stated on the pricing page. Teachers trust
  that more than a trial, and it is the MoR's problem to process.
- No free trial of Pro at launch. The free tier *is* the trial. (Revisit if
  conversion is poor: a 30-day Pro trial key is one setting in the MoR.)

### D6. The site is still a static site

No framework, no build step, no npm — `CLAUDE.md` still holds. The additions
are: one JS module, one pricing page, one help page per tool, a `_headers`
file, and (Phase T3) an OAuth client ID in a config constant. Netlify
Functions are permitted only for the webhook in Phase T4 (school licences)
and only if the MoR forces it.

---

## 2. Privacy and law, tier by tier

### Free tier — unchanged

No data leaves the browser. Two things need fixing anyway, because they are
already a GDPR wobble on a site that sells itself on privacy:

1. **Google Fonts is loaded from Google on every page.** A Munich regional
   court (LG München I, 3 O 17493/20, Jan 2022) held that loading Google
   Fonts from Google's servers transmits the visitor's IP to Google in the US
   without consent and is a GDPR violation. Self-host the three families
   (`css/fonts/`, WOFF2, ~150 KB total, OFL-licensed) and drop the
   `<link>` tags. Faster, works offline, and the privacy page loses a
   paragraph it currently has to explain.
2. **Seating Chart Maker fetches jsPDF from cdnjs** at
   `seating-chart-maker.html:836`, even though `vendor/jspdf.umd.min.js` is
   already in the repo and PureWrite uses it. Point it at the vendored copy.
   Same privacy-page paragraph disappears.

After both, `privacy.html` can say: *"Pages make no outside requests at all."*
That is the sentence to put on the pricing page.

### Pro tier — what the teacher gives us

| Data | Held by | Lawful basis / notes |
|---|---|---|
| Name, email, card, billing country | Merchant of record (controller for the sale) | contract; the MoR publishes its own privacy policy and DPA |
| Licence key, plan, activation count, device fingerprint the MoR uses to count activations | MoR, and the key itself in the teacher's browser | contract |
| Support emails | Your mailbox (Fastmail / Proton / whatever — pick one with an EU DPA) | legitimate interest; tell teachers **not to paste student names into support mail** |

We hold **no** database of customers ourselves. If someone asks "delete my
data", it is a request to the MoR plus deleting an email thread. Write that
down in the privacy page so the answer is one sentence.

### Pro tier — Drive/OneDrive sync (Phase T3)

- The browser gets a token via Google Identity Services (or MSAL for
  Microsoft) **client-side**; the token never passes through a server we run.
- Scope: `drive.appdata` (a hidden per-app folder) or `drive.file` (a visible
  "Teacher Toolshed" folder). Both are "non-sensitive" scopes, so Google's
  OAuth verification is the light-touch one, but it still needs a verified
  domain, a published privacy policy URL, and a demo video of the consent
  flow. Start that application early; it takes weeks.
- The file that gets written is exactly the JSON that "Export backup" already
  produces. Sync = "export to Drive on change, import from Drive on open,
  newest `updatedAt` wins" — the merge rule `importAll` already implements.
- School-managed Google accounts are covered by the school's existing Google
  Workspace for Education agreement, which is the point. The privacy page
  says: *"Your backup is stored in your own Google Drive under your school's
  existing Google agreement. We never see it, and we never could."*
- Some districts block third-party OAuth apps on school accounts. Then the
  teacher uses a personal account or stays on JSON export. Say so in the
  help page rather than letting them find out.

### Documents to add (all static pages, editorial system)

- `pricing.html` — the tiers table above, the refund line, the privacy line.
- `terms.html` — short. Licence is per teacher, non-transferable; school
  licence per site; no warranty; governing law = your residence country;
  MoR's terms cover the sale.
- `privacy.html` — updated per above; add "Pro" section; add a real contact
  address (GDPR requires one; the current "no contact form yet" line has to
  go).
- **Imprint / legal notice** if you live in Germany, Austria or Switzerland
  (Impressum is mandatory and fined); an "About / contact" page everywhere
  else.
- `for-your-it-department.html` (or a PDF) — one page a teacher can forward:
  what is stored where, that no student data is transmitted, FERPA reasoning,
  GDPR reasoning, the OAuth scopes used, sub-processors (MoR only). This is a
  sales page disguised as compliance; many "can I use this?" questions are
  answered by forwarding it.

### Student-facing pages stay data-free

Hex canvas, PureWrite writing surface, Brain Breaks: no licence check, no
sync, no analytics, no fonts fetched from anywhere, nothing that would ever
make them "a service directed at children" under COPPA or Art. 8 GDPR. Keep
the URL-fragment share mechanism exactly as it is.

---

## 3. Teaching teachers to use it (videos and beyond)

Yes to YouTube — teachers search YouTube before they search Google — but with
three rules:

1. **Never embed YouTube directly.** An embedded player sets Google cookies on
   your page, which drags a cookie banner onto a site that otherwise needs
   none. Use a **click-to-load facade**: a static poster image with a play
   button; clicking it swaps in `https://www.youtube-nocookie.com/embed/…`.
   Say under it "Plays from YouTube; nothing loads until you click."
2. **Never show a real roster.** Record with a demo class (see below). Real
   names in a screencast is the one way this project could actually leak
   student data.
3. **Short.** One video per tool, 2–4 minutes, the *first* real task ("Grade
   a group presentation in Presentation Tracker"), not a feature tour. One
   60-second "what is Teacher Toolshed" for the landing page.

**Better than videos, and do it first:** a **"Load a sample class"** button on
Class Lists that seeds a fictional roster ("Period 3 — sample", 24 names,
obviously fake). Every tool becomes explorable in one click; every video is
recorded against it; every screenshot in the help pages uses it.

**Help pages** (`help/<tool>.html`, editorial system, one per tool): a
150-word "what it is for", the steps, the video facade, a "things that go
wrong" list (Safari clears storage, school network blocks Drive, printer
margins). Link from each tool's `.tool-header`.

Practicalities: record with OBS (free) at 1080p, system font size bumped; use
the site's own colours for thumbnails so the channel looks like the site;
turn on auto-captions and correct them (accessibility, and many teachers
watch muted in a staff room); put the help page URL in every description.

---

## 4. Scalability: Netlify free is fine for a long time, with two changes

Current numbers: a tool page is 10–60 KB; `vendor/` is ~3 MB but only Stack
Splitter loads the heavy pieces (pdf.js + worker ≈ 1.8 MB, pdf-lib 0.5 MB).
Netlify free: 100 GB bandwidth/month, 300 build minutes (irrelevant, no
build), 125k function invocations.

Worst case, every visit is a Stack Splitter visit with a cold cache: 100 GB /
2.3 MB ≈ **43,000 visits a month** before the free tier is exceeded. Realistic
mixed traffic with caching is well above that. Netlify Pro at $19/month lifts
it to 1 TB if it ever matters; that is a good problem.

Do these now, both trivial:

1. **Add `_headers`** so `vendor/*`, `css/*`, `js/*` and fonts get
   `Cache-Control: public, max-age=31536000, immutable` (version the filename
   when a vendor lib changes, e.g. `pdf.min.v4.mjs`). Repeat visits stop
   counting against bandwidth almost entirely. Also add
   `X-Content-Type-Options: nosniff`, `Referrer-Policy:
   strict-origin-when-cross-origin`, and a CSP once fonts are self-hosted
   (`default-src 'self'` plus the MoR and OAuth origins in Phase T1/T3).
2. **Self-host fonts** (above) — removes a third-party dependency and a
   render-blocking request at the same time.

Escape hatch if traffic does explode: Cloudflare Pages has no bandwidth cap on
its free plan and deploys the same folder. Because there is no build step,
moving is a DNS change. Don't move pre-emptively.

Things that do **not** need to scale, because they never exist: a database, a
session store, an API. The licence check hits the MoR, and the MoR's job is
to scale.

---

## 5. Improvements worth doing alongside (pick, don't do all)

- **PWA manifest + service worker for every tool**, not just PureWrite. Tools
  that work offline are a selling point for schools with bad Wi-Fi and a
  requirement for the offline-grace licence check. Careful with cache
  invalidation; PureWrite's `sw.js` is the pattern.
- **Roster import from Google Classroom CSV / PowerSchool / ManageBac
  export** — `rosters-import.js` already parses pasted lists; add the three
  most common CSV shapes. Removes the biggest onboarding step.
- **Email list** (Buttondown or Kit, both fine for GDPR with double opt-in) on
  the landing page: "new tool every term". It is the only marketing channel
  that survives algorithm changes. Teachers on it are the founding-licence
  buyers.
- **Changelog page.** Cheap, and it is what convinces a teacher a one-person
  project is alive.
- **Feedback route.** A `mailto:` is enough. Netlify Forms would also be fine
  (form contents go to Netlify, so the form must say "no student names").
- **Landing page per tool with a real H1** (`/stack-splitter/` etc.) for
  search. Currently the six are anchors on one page; teachers search for
  "split scanned pdf by student" not "teacher toolshed".
- **Accessibility pass** on Talk Tracker and Presentation Tracker (keyboard
  tapping, focus order) — a school licence buyer's IT department will ask
  about WCAG, and the projector work on Brain Breaks already set the bar.
- **Student Privacy Pledge** signatory and a **1EdTech / Common Sense Privacy**
  listing once the privacy page is final. Free, and they are what a US
  district's checklist actually names.

---

## 6. Phases

Numbering starts at T1 so they cannot collide with `PLAN.md` phases.

### T0. Ground work (no visible change; do first)

- Self-host fonts; remove Google Fonts `<link>`s from all pages.
- Seating Chart Maker uses `vendor/jspdf.umd.min.js`.
- Add `_headers` (cache + security headers).
- "Load a sample class" on Class Lists.
- Update `privacy.html` ("no outside requests") and `README.md`.

**Accept when:** DevTools Network tab on every page shows zero third-party
requests; Lighthouse best-practices ≥ 95; sample class seeds and every tool
can use it.

### T1. Licence module and the Free/Pro split

- `js/toolshed-licence.js`: `ToolshedLicence.status()` → `{tier, plan,
  validUntil, checkedAt, activations}`; `activate(key)`; `deactivate()`;
  `assertCan(feature, currentCount)` returning `{ok, limit, upgradeUrl}`.
  Stores activation in the existing IndexedDB (`meta` store, bump
  `DB_VERSION`), *not* localStorage, so export/import round-trips it.
- Validation call: `POST` to the MoR's licence endpoint with the key only.
  30-day re-check, 90-day grace, network failure = keep last known state.
- Gates in the five places named in D1, each using the shared `.notice`
  component with one line of copy and one `.btn--primary` "See Pro". No
  modals, no countdowns, no nagging on tool open.
- Activation UI on `rosters.html`: paste key → "Pro until …" / "Free".
- `pricing.html`, `terms.html`, contact address on `privacy.html`, imprint if
  required.
- MoR store configured: products for the five plans in D5, licence keys on,
  3 activations per key (30 for department, 1000 for school), refund policy
  text, tax collection on, PPP if offered.
- `PLAN.md` decision 4 rewritten to point here; `README.md` first line
  changes from "free classroom tools" to "classroom tools, free to use, Pro
  for the extras" or similar honest phrasing.

**Accept when:** a test-mode purchase yields a key that activates in a fresh
browser; going offline for a simulated 91 days reverts to Free without data
loss; a Free teacher can create 3 classes and is stopped, politely, at the
4th; Stack Splitter, Brain Breaks and every student page have no licence code
path at all (grep for `ToolshedLicence` proves it); privacy page, terms and
pricing page are all reachable from the site footer.

### T2. Teaching material

- Sample-class-based help page per tool with video facade.
- Seven YouTube videos (six tools + overview), captions corrected.
- "For your IT department" page.
- Email list signup on landing page.

**Accept when:** a teacher who has never seen the site can, from the help
page alone, complete each tool's first task with the sample class; every
video description links its help page; no real student name appears anywhere.

### T3. Pro sync to the teacher's own Drive / OneDrive

- Google OAuth client (verification started in T1, since it takes weeks);
  Microsoft app registration.
- `js/toolshed-sync.js` behind the same async seam the store already
  advertises: export on change (debounced), import on open, `updatedAt`
  wins, a visible "Last synced …" on Class Lists, and a "Sync is off" state
  that is the default.
- Help page section on blocked school accounts.

**Accept when:** two browsers on one teacher's account converge within a
minute; revoking the token at Google leaves local data intact; the privacy
page's "we never see it" sentence is true by construction (no request to any
origin but Google's/Microsoft's carries the payload — verify in DevTools).

### T4. School and department licences (only if asked for)

- Invoice/PO flow through the MoR; W-9 and VAT-number handling documented.
- If per-seat management is needed, that is the first server-side code on
  this site and gets its own privacy write-up before it is written.

**Accept when:** one school has bought one and it did not require a phone call.

---

## 7. Open questions for the owner (answer before T1)

1. Country of residence, and whether you sell as an individual or a local
   entity. Determines MoR eligibility, imprint requirement, and the tax
   conversation.
2. Is Lemon Squeezy available for payouts where you live? If not, Paddle +
   one function.
3. The free limits (3 classes / 5 items / 2 rubrics): comfortable, or should
   free be more generous at launch and tightened for *new* users later?
4. Founding-teacher lifetime licence: yes or no? It is the fastest cash and
   the loudest advocates, at the cost of some annual revenue in year three.
5. Which two tools get videos first? (Suggestion: Stack Splitter, because it
   is the one people cannot believe works, and Class Lists, because everything
   starts there.)
