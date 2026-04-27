# Teacher Toolshed — Architecture Plan

A comprehensive plan for building a teacher-facing SaaS product with Next.js, Supabase, Stripe, and Netlify.

---

## 1. Product Overview

**What it is:** A suite of focused classroom tools for middle/high school language teachers.

**Customer:** An overworked ELA teacher who wants things that save time and create meaningful learning moments. Price-sensitive. Privacy-conscious (or their district is).

**Business model:** Freemium. Free tier for core functionality, Pro tier ($5/month or $48/year) for unlimited projects, student sharing, and advanced features. All tools included at every tier — Pro removes usage caps, not tool access.

### Tools at Launch

| Tool | Teacher-facing | Student-facing | Data stored |
|------|:-:|:-:|---|
| **Hexagonal thinking** | Setup page | Canvas (via shared link) | Activity config, student canvas state |
| **Seating chart maker** | Full app | None | Layouts, rosters |
| **Talk tracker** | Full app | None | Session recordings, participation data |

### Possible Future Tools

- Exit ticket generator/marker
- Discussion rubric builder
- Vocabulary review games
- Others as needs emerge

---

## 2. Tech Stack

| Layer | Tool | Why |
|---|---|---|
| **Framework** | Next.js (App Router) | Routing, API routes, server components, React ecosystem |
| **Auth** | Supabase Auth | Google sign-in, session management, free tier generous |
| **Database** | Supabase Postgres | Relational data, Row Level Security, real-time subscriptions |
| **Payments** | Stripe | Checkout, customer portal, webhooks, subscription management |
| **Hosting** | Netlify | Already set up, supports Next.js natively |
| **Styling** | Tailwind CSS | Utility-first, fast iteration, consistent design system |
| **File storage** | Supabase Storage | For exported PDFs, images (if needed later) |
| **Email** | Resend | Transactional emails (welcome, receipts, share links). Free tier: 3,000 emails/month |
| **Analytics** | Plausible or PostHog | Privacy-friendly usage tracking. Plausible is simpler (page views, referrals). PostHog is deeper (feature usage, funnels). Both have free tiers |
| **Feedback** | Built-in (Supabase table) | Simple feedback widget stored in your own database. No third-party dependency |

---

## 3. Project Structure

```
teachertoolshed/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (nav, footer, auth provider)
│   ├── page.tsx                  # Landing page (marketing)
│   ├── pricing/
│   │   └── page.tsx              # Pricing page
│   ├── login/
│   │   └── page.tsx              # Auth page
│   ├── dashboard/
│   │   ├── layout.tsx            # Authenticated layout (sidebar)
│   │   ├── page.tsx              # Dashboard home (my tools, recent projects)
│   │   └── settings/
│   │       └── page.tsx          # Account settings, billing
│   ├── tools/
│   │   ├── hex/
│   │   │   ├── page.tsx          # Hex tool — teacher setup list
│   │   │   ├── [activityId]/
│   │   │   │   └── page.tsx      # Edit a specific activity
│   │   │   └── canvas/
│   │   │       └── [token]/
│   │   │           └── page.tsx  # Student canvas (public, no auth)
│   │   ├── seating/
│   │   │   ├── page.tsx          # Seating chart list
│   │   │   └── [chartId]/
│   │   │       └── page.tsx      # Edit a specific chart
│   │   └── tracker/
│   │       ├── page.tsx          # Talk tracker session list
│   │       └── [sessionId]/
│   │           └── page.tsx      # Live tracking session
│   └── api/
│       ├── stripe/
│       │   └── webhook/
│       │       └── route.ts      # Stripe webhook handler
│       └── auth/
│           └── callback/
│               └── route.ts      # Supabase auth callback
├── components/
│   ├── ui/                       # Shared UI components (buttons, cards, modals)
│   ├── layout/                   # Nav, sidebar, footer
│   └── tools/                    # Tool-specific components
│       ├── hex/
│       ├── seating/
│       └── tracker/
├── lib/
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client
│   │   ├── server.ts             # Server Supabase client
│   │   └── middleware.ts         # Auth middleware
│   ├── stripe.ts                 # Stripe helpers
│   └── utils.ts                  # Shared utilities
├── hooks/
│   ├── useSubscription.ts        # Check if user has Pro
│   └── useRoster.ts              # Shared roster across tools
├── public/                       # Static assets
├── tailwind.config.ts
├── next.config.js
├── netlify.toml                  # Netlify build config
└── package.json
```

---

## 4. Database Schema

### Core Tables

```sql
-- Teachers (extends Supabase auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text not null,
  school_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Stripe subscription tracking
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free',           -- 'free' | 'pro'
  billing_cycle text,                          -- 'monthly' | 'annual' | null (for free)
  status text not null default 'active',       -- 'active' | 'canceled' | 'past_due'
  current_period_end timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shared class rosters (cross-tool feature)
create table public.rosters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,                          -- e.g. "Period 3 English 10"
  students jsonb not null default '[]',        -- [{name: "Ava", id: "s1"}, ...]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- User feedback (built-in, no third-party dependency)
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  page text,                                   -- Which page/tool they were on
  type text not null default 'general',        -- 'bug' | 'feature' | 'general'
  message text not null,
  status text not null default 'new',          -- 'new' | 'read' | 'resolved'
  created_at timestamptz default now()
);
```

### Hex Tool Tables

```sql
create table public.hex_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  roster_id uuid references public.rosters(id) on delete set null,
  name text not null,
  concepts jsonb not null,                     -- [{word, catId}]
  categories jsonb default '[]',               -- [{id, name, color}]
  share_token text unique,                     -- For student access URL
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Student canvases (ephemeral by design)
create table public.hex_canvases (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.hex_activities(id) on delete cascade,
  student_label text,                          -- Teacher-assigned label, NOT student-entered
  canvas_state jsonb,                          -- Hex positions, connections, labels
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '90 days')
);
```

### Seating Chart Tables

```sql
create table public.seating_charts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  roster_id uuid references public.rosters(id) on delete set null,
  name text not null,
  layout_type text not null,                   -- 'rows' | 'clusters' | 'ushape' | 'custom'
  layout_state jsonb not null,                 -- Seat positions, assignments
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

### Talk Tracker Tables

```sql
create table public.tracker_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  roster_id uuid references public.rosters(id) on delete set null,
  name text not null,                          -- e.g. "Macbeth Act 3 Seminar"
  session_type text not null,                  -- 'socratic' | 'debate' | 'presentation'
  session_data jsonb,                          -- Participation events, scores, notes
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '365 days')
);
```

---

## 5. Auth Flow

```
Teacher clicks "Sign in with Google"
  → Supabase Auth handles OAuth
  → Callback creates/updates profiles row
  → Session cookie set
  → Redirect to /dashboard

Student opens hex canvas link
  → No auth required
  → Link contains share_token
  → Server looks up activity by token
  → Student interacts anonymously
```

### Key Principle

Students never create accounts, never enter personal information. The teacher is the only authenticated user. Student-facing pages (hex canvas) are public routes that require only a share token.

---

## 6. Subscription & Paywall Flow

### Pricing

| Plan | Monthly | Annual | Effective monthly |
|------|---------|--------|-------------------|
| **Free** | $0 | — | $0 |
| **Pro (monthly)** | $5/mo | — | $5 |
| **Pro (annual)** | — | $48/yr | $4 (save 20%) |

Annual pricing matters for teachers — many budget once at the start of the school year. $48 stays under the $50 psychological threshold for out-of-pocket spending.

### Stripe Configuration

Two prices on one product:
- Product: "Teacher Toolshed Pro"
- Price 1: `pro_monthly` — $5/month, recurring
- Price 2: `pro_annual` — $48/year, recurring

Stripe Customer Portal handles upgrades, downgrades, cancellation, and payment method changes. You link to it; Stripe hosts it.

### Paywall Behavior

```
Free user hits a Pro feature (e.g. 6th saved project)
  → UI shows locked state with "Upgrade to Pro" CTA
  → Click opens pricing modal (monthly vs. annual toggle)
  → Selection redirects to Stripe Checkout (hosted by Stripe)
  → Teacher pays → Stripe sends webhook → subscription row updated
  → Teacher redirected back to app with Pro access

Pro features visible but locked (not hidden)
  → Free users always see what they're missing
```

### What's Free vs. Pro

| Feature | Free | Pro |
|---------|:----:|:---:|
| All tools (current and future) | ✓ | ✓ |
| Save up to 5 projects (total across tools) | ✓ | ✓ |
| PDF export | ✓ | ✓ |
| Unlimited projects | — | ✓ |
| Student sharing (hex canvas links) | — | ✓ |
| Shared class rosters | — | ✓ |
| Session history (Talk Tracker) | — | ✓ |
| Priority support | — | ✓ |

### Implementation

A single `useSubscription()` hook checks the user's plan:

```typescript
// Simplified concept
function useSubscription() {
  // Reads from subscriptions table via Supabase
  // Returns { plan: 'free' | 'pro', isActive: boolean, billingCycle: 'monthly' | 'annual' }
}

// Usage in any tool
const { plan } = useSubscription();
if (plan === 'free' && projectCount >= 5) {
  showUpgradePrompt();
}
```

---

## 7. Privacy & Compliance Architecture

### Design Principles

1. **Teachers are the only users with accounts.** Students never sign up.
2. **Students never self-identify.** Any student labels come from the teacher's roster.
3. **Minimal data collection.** Only store what's needed to provide the service.
4. **Ephemeral student data.** Canvas states auto-expire after 90 days. Tracker sessions after 1 year.
5. **Teacher controls their data.** Delete any project, roster, or session at any time.

### COPPA Compliance

- **Seating chart & Talk Tracker:** Teacher-only tools. No student interaction. COPPA does not apply.
- **Hex canvas:** Students access via link but never enter personal info. No account, no name field, no login. COPPA risk is minimal if no personal information is collected from the student.
- **If student labels are pre-set by teachers:** The teacher enters names, not the student. The student sees their pre-labeled link. This is teacher-directed disclosure, not student self-identification.

### FERPA Compliance

- **You are a "school official" under FERPA** when a teacher uses your tool to manage student data.
- **Permitted use only:** Data used solely to provide the educational service. No analytics, no marketing, no ML training.
- **Export and delete:** Teachers can export their data and delete it at any time.
- **Data Processing Agreement:** Have a template ready. Some districts will require one before a teacher can use your tool.
- **Talk Tracker is the highest exposure:** Participation notes tied to student names = education records. Mitigated by auto-expiry and teacher control.

### Privacy Policy Requirements

Your privacy policy should clearly state:
- What data you collect (teacher email, student names entered by teacher, tool usage data)
- What you do NOT collect (no data directly from students)
- How data is used (only to provide the service)
- Data retention periods (90 days for student canvases, 1 year for tracker sessions)
- How teachers can delete their data
- That you do not sell, share, or use data for advertising
- Contact information for privacy questions

---

## 8. Shared Roster System

The cross-tool roster is a key differentiator for the bundle/Pro tier.

```
Teacher creates a roster: "Period 3 — English 10"
  → Adds students: Ava, Ben, Carlos, Diana, ...
  → This roster is available in ALL tools:
     • Hex tool: pre-label student canvases
     • Seating chart: populate seats
     • Talk tracker: populate participant list
  → Update a roster once, it reflects everywhere
```

### Why This Matters

Without shared rosters, the teacher types the same 30 names into three different tools. That's the kind of friction that kills adoption. With shared rosters, they enter names once and every tool just works.

---

## 9. URL Structure

| URL | What it does | Auth required |
|---|---|---|
| `/` | Landing page | No |
| `/pricing` | Pricing page | No |
| `/login` | Sign in with Google | No |
| `/dashboard` | Teacher's home (recent projects) | Yes |
| `/dashboard/settings` | Account, billing, rosters | Yes |
| `/tools/hex` | Hex activity list | Yes |
| `/tools/hex/[activityId]` | Edit hex activity | Yes |
| `/tools/hex/canvas/[token]` | Student canvas | **No** (public) |
| `/tools/seating` | Seating chart list | Yes |
| `/tools/seating/[chartId]` | Edit seating chart | Yes |
| `/tools/tracker` | Talk tracker session list | Yes |
| `/tools/tracker/[sessionId]` | Live tracking session | Yes |

---

## 10. Build Order

Work in this order. Each phase produces something usable.

### Phase 1: Scaffold (3–5 hours)
- Initialize Next.js project with App Router
- Set up Tailwind CSS with the dark/lime design system from the landing page
- Create root layout with nav and footer
- Migrate landing page content into `app/page.tsx`
- Configure `netlify.toml` for Next.js
- Deploy to Netlify — live at teachertoolshed.com

### Phase 2: Auth (3–5 hours)
- Set up Supabase project (database + auth)
- Configure Google OAuth in Supabase
- Build login page
- Create auth middleware (protect `/dashboard` and `/tools/*` routes)
- Create `profiles` table with auto-creation on first sign-in
- Build basic dashboard page (empty state for now)

### Phase 3: Database & Rosters (3–5 hours)
- Create all database tables (see schema above)
- Set up Row Level Security policies (users can only access their own data)
- Build roster management UI in dashboard settings
- CRUD operations: create, edit, delete rosters and students

### Phase 4: First Tool — Hex Thinking (15–25 hours)
- Migrate teacher setup page into `/tools/hex/[activityId]`
- Migrate student canvas into `/tools/hex/canvas/[token]`
- Replace URL-encoded activity data with database storage
- Generate share tokens for student links
- Connect roster integration (pre-label student canvases)
- Save/load canvas state to database
- Add project limit enforcement (5 free, unlimited Pro)

### Phase 5: Stripe Integration (5–8 hours)
- Create Stripe product: "Teacher Toolshed Pro"
- Create two prices: `pro_monthly` ($5/mo) and `pro_annual` ($48/yr)
- Build pricing page with monthly/annual toggle
- Build checkout flow (select plan → Stripe Checkout → webhook → update subscription)
- Build billing management (link to Stripe Customer Portal)
- Wire up `useSubscription()` hook
- Set up welcome email via Resend on first sign-in
- Set up upgrade confirmation email on successful payment
- Test the full upgrade/downgrade cycle

### Phase 6: Second Tool — Seating Chart (10–15 hours)
- Migrate seating chart prototype into `/tools/seating/[chartId]`
- Connect to database for save/load
- Integrate shared rosters
- Add layout templates and randomization
- PDF export

### Phase 7: Third Tool — Talk Tracker (10–15 hours)
- Migrate Talk Tracker prototype into `/tools/tracker/[sessionId]`
- Connect to database for session storage
- Integrate shared rosters
- Build session history / review page
- Auto-expiry for session data

### Phase 8: Polish & Launch (8–12 hours)
- Privacy policy page
- Terms of service page
- Add Plausible analytics (one script tag)
- Build feedback widget (floating button + modal + database writes)
- Error handling and loading states
- Mobile responsiveness pass
- SEO basics (meta tags, Open Graph)
- Verify Resend domain for transactional emails
- Final testing across tools
- Announce

### Total Estimated Time: 60–100 hours

At a few hours per week, that's roughly **5–7 months** to full launch. Phase 1 + 2 get you a live site with auth in the first couple of weeks. Phase 4 gets the first real tool online.

---

## 11. Design System

Based on the dark/lime landing page mockup. Carry this across all pages.

```css
/* Core palette */
--void:      #0d0d0f;    /* Background */
--void2:     #141417;    /* Card background */
--void3:     #1c1c21;    /* Hover / elevated surface */
--void4:     #242429;    /* Borders, subtle surfaces */
--edge:      rgba(255,255,255,0.08);  /* Dividers */
--edge2:     rgba(255,255,255,0.14);  /* Input borders */
--white:     #ffffff;    /* Primary text */
--off:       rgba(255,255,255,0.45);  /* Secondary text */
--dim:       rgba(255,255,255,0.22);  /* Tertiary text, labels */
--lime:      #b8f56a;    /* Primary accent */
--lime-dark: #2a3d0a;    /* Text on lime backgrounds */

/* Typography */
--font-serif: 'Lora', Georgia, serif;      /* Headings */
--font-sans:  'Inter', system-ui, sans-serif;  /* Body */
```

---

## 12. Netlify Configuration

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

This tells Netlify to build the Next.js project and serve it properly, including API routes and server-side rendering.

---

## 13. Email System

### Service: Resend

Resend is the simplest transactional email service for Next.js. Free tier gives you 3,000 emails/month (more than enough for years at your scale). You send emails from your own domain (e.g. `hello@teachertoolshed.com`).

### Setup

1. Create a Resend account at resend.com
2. Verify your domain (add DNS records in Namecheap)
3. Install the SDK: `npm install resend`
4. Create email templates as React components (Resend supports this natively)

### Emails to Send

| Trigger | Email | Priority |
|---|---|---|
| First sign-in | Welcome email — what's available, how to get started | Launch |
| Upgrade to Pro | Thank you + what's unlocked | Launch |
| Subscription receipt | Monthly/annual receipt (Stripe also sends these — decide if you want your own) | Nice to have |
| Approaching project limit | "You've used 4 of 5 free projects" — gentle nudge | Post-launch |
| New tool launched | Announcement to existing users | Post-launch |
| Share link created (hex tool) | Optional: email the share link to yourself for easy access | Post-launch |

### Implementation

```typescript
// lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWelcomeEmail(to: string, name: string) {
  await resend.emails.send({
    from: 'Teacher Toolshed <hello@teachertoolshed.com>',
    to,
    subject: 'Welcome to Teacher Toolshed',
    react: WelcomeEmail({ name }),  // React component as template
  });
}
```

---

## 14. Analytics

### Recommendation: Start with Plausible, add PostHog later if needed

**Plausible** ($9/mo or self-hosted free) gives you privacy-friendly page analytics — which pages are visited, where traffic comes from, and what countries. It's one script tag and zero configuration. No cookies, no GDPR banner needed.

**PostHog** (free tier: 1M events/month) gives you deeper product analytics — which features are used, conversion funnels, user paths. More powerful but more complex to set up.

**Start with Plausible at launch.** Add PostHog only if you find yourself asking "which features do people actually use?" and Plausible can't answer it.

### What to Track

At minimum, you want to know:
- How many people visit the landing page vs. sign up (conversion rate)
- Which tools are used most
- How many free users hit the project limit (upgrade opportunity)
- Where traffic comes from (to know if marketing is working)

Plausible handles all of this out of the box. No custom event code needed.

---

## 15. Feedback System

### Approach: Built-in widget, stored in Supabase

No third-party tool needed. A small floating feedback button in the app opens a simple form. Submissions go straight to the `feedback` table in your database.

### UI

```
[?] button (bottom-right corner, all authenticated pages)
  → Click opens a small modal:
     - Type: Bug / Feature request / General feedback (radio buttons)
     - Message: textarea
     - Submit
  → Saves to feedback table with user_id and current page
  → "Thanks! We read every message." confirmation
```

### Teacher-side

You read feedback directly in Supabase dashboard (table view with filters), or build a simple `/dashboard/admin/feedback` page later if volume warrants it. At your scale, the Supabase dashboard is fine for a long time.

### Why not a third-party tool?

Tools like Canny or UserVoice are great at scale but overkill here. You'd be paying $50+/month for something a database table and a modal handle perfectly. If you outgrow this, migrating to a dedicated tool later is easy — the data is just rows.

---

## 16. What to Build First

Start with **Phase 1** (scaffold). The goal of your next working session should be:

1. Run `npx create-next-app@latest teachertoolshed`
2. Install Tailwind, configure the design system colors
3. Move the landing page HTML into `app/page.tsx`
4. Push to GitHub, connect to Netlify
5. See it live at teachertoolshed.com

That gives you momentum — a real site, at your real domain, that you can iterate on.
