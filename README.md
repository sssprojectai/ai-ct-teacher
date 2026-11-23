# AI-CT TEACHER

**Artificial Intelligence – Critical Thinking for Future English Teachers**

- **Author:** PhD researcher Sarvinoz Solexonovna
- **Institution:** Samarkand State Institute of Foreign Languages (SamDChTI)
- **Repository:** https://github.com/sssprojectai/ai-ct-teacher
- **Site (GitHub Pages):** https://sssprojectai.github.io/ai-ct-teacher/

This is the author's research prototype. It is not an official product of, or endorsed by, any institution.

## Two separate parts

| | GitHub Pages FRONTEND | Secure BACKEND |
|---|---|---|
| What | The website: `index.html`, `app/`, `assets/` | One Cloudflare Worker that talks to Gemini |
| Package | `ai-ct-teacher-github-pages.zip` | `ai-ct-teacher-backend.zip` |
| Needs Node.js to run? | No | Only to deploy it (`npx wrangler`) |
| Holds secrets? | **Never** | The Gemini key, as a Worker secret only |

There is **one** backend address, set in one place: `const API_BASE='https://ai-ct-teacher-ai.ai-ct-teacher-api.workers.dev';` in `app/js/app.js`. The website also works without it (demo mode).

## What the platform is

An electronic methodological prototype that develops future English teachers' critical thinking by treating AI as an **object of critical analysis**: the student thinks first, reads an AI suggestion, checks every statement against published research, and makes an accountable decision. The interface is in **English**; short Uzbek notes appear only as smaller support text.

### The AI-CT 4C cycle (Think → Ask AI → Check → Decide)

1. **Contextualize (Think)** – read a real classroom situation from Uzbekistan, choose the main problem, write a first opinion.
2. **Consult (Ask AI)** – read a prepared AI suggestion (six statements; some supported by research, some not).
3. **Critique (Check)** – agree, partly agree or disagree; explain why; if a source is needed, open the Source Library entry for every statement.
4. **Construct (Decide)** – write the final solution and compare it with the first opinion.

At the end, Gemini (through the Worker, `mode: "evaluate"`) gives feedback from 1 to 5 on five critical-thinking skills after Facione (1990), with a short conclusion. If the AI is not available, a clearly labelled automatic estimate is shown.

### What is in the app

- **Tasks:** 100 real classroom situations in one list (search, “Today’s task”), each worked through the 4C cycle in about 5 minutes.
- **Source Library:** 67 published works (method/theory, author, year, full reference, main idea); every AI statement in every task links to them.
- **AI Chat:** a free, general conversation with Gemini about English, grammar, teaching or studies. Not scored.
- **Team Competition** (5, 10 or 20 questions per team; 1–4 teams; 40-second timer).
- **My progress:** profile (a name stored on the device), XP, streak, badges, history of records, JSON/CSV export.
- Projector mode and full screen for interactive whiteboards, light and dark themes, sound with a visible switch.

## Frontend deployment (GitHub Pages)

1. Unzip `ai-ct-teacher-github-pages.zip`. Its files go **directly into the repository root** (`index.html` at the top, next to `app/` and `assets/`).
2. Copy them into your local clone of `sssprojectai/ai-ct-teacher`, replacing old files. Do not touch `.git` or the Search Console verification file.
3. GitHub Desktop: **Commit to main**, then **Push origin**.
4. github.com > repository > **Settings > Pages**: Source **Deploy from a branch**, branch **main**, folder **/ (root)**.
5. Open https://sssprojectai.github.io/ai-ct-teacher/ and press Ctrl+F5. The menu footer shows the build id (for example `build 2026-10-02-e3`).

## Backend deployment (Cloudflare)

See `backend/README.md`. In short (Command Prompt, folder `backend/cloudflare-worker`): `npx wrangler deploy`, then `npx wrangler secret put GEMINI_API_KEY`. The Gemini key exists **only** on the server: students never see, enter or store a key, and it is never in the frontend, `localStorage` or GitHub. If Gemini is unavailable the app shows "AI service is temporarily unavailable", stays usable, and Consult offers the clearly labelled demonstration answer.

**Verification status:** the Worker is tested against a mocked Google API. A real Gemini request has not been executed by the author of this package (NOT TESTED — REQUIRES LIVE GEMINI KEY). Run `node tests/live-gemini-check.mjs` with your key in an environment variable to check it.

## Demo mode

While the server is not reachable, Consult shows a pre-written answer labelled "DEMONSTRATION" and AI Chat says it needs the AI service.

## Local testing

```
python3 -m http.server 8000          # serve the frontend, open http://localhost:8000/
node tests/worker.test.mjs           # backend tests (mocked Google)
node tests/dev-server.mjs            # local API with a MOCKED Gemini, for offline demonstrations
node tests/live-gemini-check.mjs     # REAL Gemini with YOUR key from an environment variable
```

Browser tests (Playwright) are in the complete-source package under `tests-browser/`.

## Updating the project

Edit the sources in the complete-source package (`source/build/*.js`, `head.html`; the Uzbek support text is in `data-uz.js`), run `python3 source/build_site.py`, run the tests, then copy the `site/` files (without `backend/` and `tests/`) to the repository as above. Set `API_BASE` again after a rebuild.

## Data and privacy

Progress, XP, badges and written answers are stored only in this browser (`localStorage`). Nothing is uploaded except the text you send to the AI (Consult messages and AI Chat messages), which goes through the secure server to Gemini. Do not type personal data about real students into the AI.

## Limits

Scores cannot judge the quality of an idea. For research, trained human raters should score the records with the same rubric; scientific validity comes from the study design, sample and analysis, not from the software alone.
