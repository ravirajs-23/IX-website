# Site audit — remaining pages vs. the live site

Scope: every page other than the homepage (already covered by the separate
homepage-parity plan) and About Us (hero/timeline/leadership/scorecard fixed
this session). Method: compared our built page against its live counterpart
via DOM/text inspection (`get_page_text`, DOM reads) at incubxperts.com — no
code changes made, audit only.

**Headline finding: the real site's information architecture doesn't map
1:1 onto our 7 static pages for 3 of them** (services, blog, careers). Those
need a scoping decision before "match the content" is even the right frame —
see each section below.

---

## 1. `services.html` — structural mismatch, not just content drift

The real site has **no single "Services" page**. Each service is its own
dedicated page (`/services/ai-adoption-and-strategy`,
`/services/agentic-solutions`, `/services/cloud-ai-infrastructure`, and
presumably 7 more, one per card) with its own:
- hero (name + one-line tagline + "LET'S STRATEGIZE" CTA)
- "Why [X] Matters" intro copy
- "OUR SERVICES" — 6-7 sub-service cards specific to that offering
- "OUR PROCESS" — 5 numbered steps specific to that offering
- "FEATURED CASE STORIES" — 3 real case-story cards
- "EXPLORE MORE OF WHAT WE DO" — 3 related-service cards
- closing CTA ("Ready to move from AI ambition to execution?" / "BOOK A
  CONSULTATION")

Our `services.html` instead crams everything into one page: a grid of all
10 service names up top, then a single hardcoded deep-dive into just
**AI Adoption & Strategy** ("Our Services"/"Our Process" sub-sections), then
a "Stack" section, then one closing CTA. The deep-dive content for that one
service is reasonably close to the real page's copy, but:
- it's the only one of ~10 services that gets this treatment
- it's missing "FEATURED CASE STORIES" and "EXPLORE MORE OF WHAT WE DO"
  entirely
- the CTA button text differs ("BOOK A CONSULTATION" vs. whatever ours says
   — check against live copy)

**Decision needed:** do we (a) build out 10 individual service pages
matching the real site's architecture, or (b) keep one consolidated page as
a deliberate simplification (and if so, which service's deep-dive
represents all 10, or do we drop the deep-dive sub-sections entirely)?
This is a scope/architecture call, not a content fix.

---

## 2. `blog.html` — also two separate real pages, not one

The real site has **`/blogs`** (Blog) and **`/outlooks`** (Outlook) as two
completely separate pages, each with its own hero, breadcrumb, post grid,
and closing "Contact Us" CTA band. Ours conflates both into one page as two
stacked sections ("Latest Articles" + "Our Perspectives on Technology,
Strategy & Business").

Content is also stale/incomplete on both sides:
- **Blog** (`/blogs`): real page has category filter pills (All / AI /
  Technology & Innovation / Agile & Business Strategy / UX & Design /
  Growth & Culture — missing entirely on ours) and 6 posts visible +
  "VIEW MORE" pagination:
  - AI-Native vs. AI-Added: The Difference That Actually Matters *(missing on ours)*
  - Two Halves of Every Strong GCC ✓ (present)
  - The People Side of a High-Performing GCC ✓ (present)
  - Transforming Document Processing with MS Syntex & Power Automate ✓ (present)
  - India's GCCs Are Outgrowing Their Own Definition *(missing on ours)*
  - Why Timing Now Decides How a GCC Is Built *(missing on ours)*
- **Outlook** (`/outlooks`): real page has 6 posts + "VIEW MORE":
  - The Re-Humanization of Work in the Age of AI ✓ (present)
  - The Rise of AI-Native Software *(missing on ours)*
  - The Rise of Agentic AI in Software Development ✓ (present)
  - Keeping an Eye on AI *(missing on ours)*
  - The IT Landscape in India *(missing on ours)*
  - Strategic Inflection Points: Software Services in the AI Era ✓ (present)
- Both real pages end with a "Contact Us / Speak to one of our experts /
  SPEAK WITH US" CTA band — missing on ours.

**Decision needed:** split into `blog.html` + `outlook.html` to match the
real architecture (nav/footer already link "Blog" and "Outlook" as separate
items, so this is probably the right call), then backfill the missing
posts and the category filter/CTA band.

---

## 3. `careers.html` — largely stale/invented content

This one **is** a 1:1 page on the real site (`/careers`), so this is a
straightforward content-parity gap, but a big one — most of the section
content doesn't match at all:

| Ours | Real site |
|---|---|
| H1 "A Culture of Growth, a Future of Possibility" (used as the only heading) | H1 **"Careers at IncubXperts"**, with "A culture of growth, a future of possibilities" as a *subtitle underneath* — we're missing the actual H1 |
| "Life at IncubXperts" — 6 cards: AI Hackathons & Bootcamps, The AI Lab, IX Takatak, Value Awards, Equal Opportunity Employer, Global Exposure | "CHART YOUR PATH AT INCUBXPERTS" — 6 **different** cards: Leadership Nexus, Tech Circle, Training & Development, Raw Diamonds, Performance Reviews, Tech Talks — none of our card titles match |
| *(missing entirely)* | "BENEFITS OF BEING AN IX'ian" — 9 perks: Competitive Pay Structure, Corporate Health Insurance, Opt-In Parental Health Cover, Maternity & Paternity Leave, Certification Reimbursement Policy, Remote Work Policy, Flexibility at Work, Internet Expense Reimbursement, Supportive Leave Policy |
| "Current Openings" — 4 jobs listed inline (AI/ML Engineer, Full-Stack Software Engineer, QA Automation Engineer, Business Analyst — AI Strategy) | Real page shows **no inline job list** — just "CAREER OPENINGS" copy + a "VIEW JOB OPENINGS" button (leads elsewhere, likely an ATS) |
| "Submit Your Application" — inline application form | *(not on the real page at all)* |
| *(missing entirely)* | "BEYOND WORK AT INCUBXPERTS" — "A people-centred environment promoting growth and a healthy dose of fun" + "EXPLORE OUR CULTURE" button |

**Note:** the inline job list + application form might be a deliberate,
reasonable simplification (real site defers to an external ATS we may not
want to depend on) — but "Life at IncubXperts" and its 6 cards look like
stale/invented content that should just be replaced with the real
"CHART YOUR PATH" + "BENEFITS OF BEING AN IX'ian" sections.

---

## 4. `team.html` — orphaned page, not on the real site at all

`https://www.incubxperts.com/team` returns a **404**. There is no separate
Team/Leadership page on the real site — leadership content lives entirely
inside the About Us page's "Leadership" section (already fixed this
session). Our `team.html`:
- duplicates the same 4 people (Anish Betawadkar, Dr. Preetam Tiwari, Rahul
  Bagal, Amit Dhandal) already correctly shown on `about.html`
- is **not linked from anywhere** in our own header/footer nav — confirmed
  via grep, nothing points to it
- still carries a `<link rel="canonical">` / `og:url` pointing at
  `https://www.incubxperts.com/team.html`, a URL that doesn't exist on the
  real site — actively wrong for SEO if this page is ever indexed

**Recommendation:** delete `team.html` (nothing links to it, and it has no
real counterpart to match), rather than try to "fix" a page that shouldn't
exist.

---

## 5. `contact.html` — 1:1 page, several concrete content mismatches

Real site (`/contact-us`) content:
- H1: **"Contact Us"** (ours: "Speak to Our Experts" — wrong headline)
- "CONTACT DETAILS": `EMAIL ID: contact@incubxperts.com`,
  `JOB ENQUIRY: careers@incubxperts.com` — **no phone numbers shown at all**
- "OUR OFFICES": Pune (HQ) and Delaware addresses, each with a
  "GET DIRECTIONS" link
- "GOT A QUESTION?" / "We will simply address your queries. No spam or
  extra outreach."
- Form fields: **Name\*, Organization\*, Work Email\*, Phone Number,
  Message\*** → **SUBMIT**. No "I'm interested in" service dropdown.

Ours has:
- Wrong H1 ("Speak to Our Experts" instead of "Contact Us")
- Invented "Business Enquiry" (`engage@incubxperts.com`) / "Job Enquiry"
  (`careers@incubxperts.com`) split, **each with a phone number** — the
  real site shows one email for general contact (`contact@incubxperts.com`,
  not `engage@`) and one for jobs, and no phone numbers anywhere
- Missing "GET DIRECTIONS" links on the office cards
- Missing the "GOT A QUESTION?" intro copy above the form
- Form field labels differ (Company vs. Organization, Email vs. Work
  Email) and we have an extra "I'm interested in" service dropdown not on
  the real form
- Button says "Send Message" vs. real "SUBMIT"

This is the cleanest one to fix — no architecture question, just wrong
copy/fields.

---

## Cross-cutting note: page-hero breadcrumb

All 5 pages above still use the old plain-text `.breadcrumb` (no home
icon/separator, no per-page background photo) — the shared `.page-hero`
base styling (overlay, logo watermark, left-alignment, stepped h1 sizing)
was already fixed for all of them this session since it's a shared
component, but each page's own background image + icon breadcrumb markup
still needs the same treatment `about.html` got. Deferred per your last
answer (audit first, no fixes yet).

---

## Suggested order if/when we move to fixing these

1. **`contact.html`** — pure content fix, no architecture decision, highest
   ratio of impact to effort.
2. **`team.html`** — delete it (one-line decision, removes an orphaned page
   with a misleading canonical URL).
3. **`careers.html`** — content fix once you confirm whether to keep the
   inline job list/application form or match the real site's external
   ATS-link pattern.
4. **`blog.html`** — split into `blog.html` + `outlook.html`, backfill
   missing posts, add category pills + closing CTA.
5. **`services.html`** — the big one; needs the 1-page-vs-10-pages decision
   before any content work starts.
