# Data Integrity & Honest UI (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nora never reports a wrong number or a screen state that didn't happen, and never overwrites good saved data.

**Architecture:** Small, local changes in existing modules (datasets.js, persist.js, store.js, ingest/pipeline.js, history.js, index.html). No new services, no schema changes. Server logic is unit-tested with `node --test`; UI behaviour is checked with Playwright against a local server.

**Tech Stack:** Node 20 ESM, Express 5, better-sqlite3, pg, vanilla JS front end, Playwright (pre-installed).

**Spec:** `docs/superpowers/specs/2026-10-26-data-integrity-mvp-design.md`

## Global Constraints
- MVP, single user (Fawaz). No auth hardening, no Drive changes, no multi-tenant work.
- No secrets or personal files in git; repo stays private.
- Arabic user-facing copy, Saudi dialect, as written in the spec.
- Keep FSC/Tujar brand palette and fonts; do not adopt the ui-ux-pro-max palette.
- Never schedule anything; nothing runs automatically beyond existing behaviour.

## Review Focus
1. A column literally named «م» or «#» next to real measures — must never be summed (Task 1 test `id column is never a measure`).
2. Postgres reachable but one `sqlite:*` key is malformed (not an array) — restore must refuse and enter protected mode, not half-apply (Task 2 test `malformed snapshot → protected`).
3. Two PDFs received in the same tick — both in the index (Task 3 test `parallel receive keeps both`).
4. Assistant text that only *mentions* the screen in a question («تبغى أعرضها على الشاشة؟») — must not trigger the false-claim warning (Task 4 test `question is not a claim`).
5. Quick action pressed while the engine is still connecting — busy state must persist until the view or an error/timeout (Task 6 UI check `busy survives connect`).

---

### Task 1: Strict column matching

**Files:**
- Modify: `datasets.js` (`colIdx` ~110-124, `applyFilters` ~126-128, `runQuery` ~157-163)
- Test: `test/integrity.test.mjs` (create)

**Interfaces:**
- Produces: `export function colIdx(ds, name, { measure = false } = {}) -> number` (−1 if none). `applyFilters` and `runQuery` throw `Error('العمود «x» غير موجود. المتاح: a، b')` for unknown filter/group/series/measure columns.

- [ ] **Step 1: Write failing tests** in `test/integrity.test.mjs` using `node:test`:
  - `measure «قيمة العقود» is not matched to «م»`: ds columns `['م','المدينة','المبلغ المعتمد']` with profile role `id` for «م» → `runQuery(ds,{group_by:'المدينة',measure:'قيمة العقود'})` throws /غير موجود/.
  - `«المبلغ» matches «المبلغ المعتمد»`: `colIdx(ds,'المبلغ',{measure:true}) === 2`.
  - `id column is never a measure`: `colIdx(ds,'م',{measure:true}) === -1`.
  - `unknown filter throws`: `runQuery(ds,{group_by:'المدينة',filters:[{column:'الحي',value:'x'}]})` throws /غير موجود/.
  - `hamza/ال normalisation still works`: `colIdx(ds,'مدينة') === 1`.
- [ ] **Step 2:** `node --test test/integrity.test.mjs` → FAIL (colIdx not exported / matches «م»).
- [ ] **Step 3:** Implement in `datasets.js`: order exact → normalized → stripped-«ال» → word-set; substring only if the column's normalized length ≥ 3 and `min(len)/max(len) ≥ 0.6`; when `measure:true` skip columns whose `profile.columns[i].role === 'id'`. Use one message helper `notFound(ds,name)`.
- [ ] **Step 4:** `node --test test/integrity.test.mjs` → PASS; `node test/ingest.test.mjs` → 41/41.
- [ ] **Step 5:** Commit `fix(datasets): strict column matching, no id columns as measures`.

### Task 2: Safe restore + protected mode

**Files:**
- Modify: `persist.js`, `store.js` (fallback branch ~25-28), `server.js` (`/api/ping` ~349, boot chain ~620-627), `events.js` (hello payload)
- Test: `test/integrity.test.mjs`

**Interfaces:**
- Produces: `export const persistState = { protected: false, reason: '' }` (persist.js); `export async function restore({ get = kvGet, attempts = 3, wait = ms => new Promise(r => setTimeout(r, ms)) } = {})`; `snapshot()` returns without writing when `persistState.protected`. store.js exports `pgFallback` (string reason or '').
- `/api/ping` and SSE `hello` include `persist: persistState`.

- [ ] **Step 1: Failing tests:**
  - `malformed snapshot → protected`: `get` returns `{}` for `sqlite:tickets` → after `restore({get, wait:()=>0})`, `persistState.protected === true` and local `projects` rows unchanged.
  - `get throws 3 times → protected, 3 attempts`.
  - `valid snapshots apply atomically`: all arrays → rows replaced, `protected === false`.
  - `snapshot is a no-op while protected`: spy `kvSet` not called. (Run with `backend` forced to postgres via an injectable `set` param on `snapshot({ set = kvSet })`.)
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: fetch all TABLES first with retry (1s, 3s), validate `Array.isArray`, then apply everything inside one `db.transaction`. On failure set `persistState`. In store.js fallback set `pgFallback = e.message`; in server boot, if `pgFallback` and `process.env.DATABASE_URL` → `persistState.protected = true`. Add `process.on('SIGTERM', async () => { await snapshot().catch(()=>{}); process.exit(0); })`.
- [ ] **Step 4:** Tests PASS; ingest suite 41/41.
- [ ] **Step 5:** UI: in `index.html` show `#persistBar` (role="alert", red) «وضع محمي: الحفظ الدائم متوقف — <reason>» when `hello`/ping says protected. Commit `fix(persist): atomic restore with retries, protected mode, SIGTERM flush`.

### Task 3: Serialize ingest index writes

**Files:**
- Modify: `ingest/pipeline.js` (all `getIndex()…saveIndex()` pairs: ~32-55, ~65, ~94, ~102-103, ~184-189)
- Test: `test/integrity.test.mjs`

**Interfaces:**
- Produces: internal `withIndex(fn: (ix) => any|Promise) -> Promise<result>` that reads, runs `fn`, saves, all queued behind a module-level promise chain.

- [ ] **Step 1: Failing test** `parallel receive keeps both`: local storage with a 200 ms delayed `putFile`; `await Promise.all([receive(pdfA), receive(pdfB)])` → `Object.keys((await getIndex()).documents).length === 2`.
- [ ] **Step 2:** Run → FAIL (1 document).
- [ ] **Step 3:** Implement `withIndex`; replace every read-modify-write with it. Slow Drive I/O stays outside the critical section (only the index mutation is inside).
- [ ] **Step 4:** PASS; ingest suite 41/41.
- [ ] **Step 5:** Commit `fix(ingest): serialize index updates`.

### Task 4: No tool tags, no false screen claims

**Files:**
- Modify: `history.js:79`, `index.html` (assistant text handling ~595-600 and ~739; turn-end handler)
- Test: `test/integrity.test.mjs` (history), `test/ui.check.mjs` (create)

**Interfaces:**
- Produces: `export const stripToolTags = s => string` in history.js (removes `⟨نفّذت …⟩` and `[استخدمت …]`). Client mirror `stripTags` in index.html with the same two regexes. `claimsScreen(text) -> boolean`: true for statements matching /قدامك|على الشاشة|معروضة|عرضت/ that are not questions (no «؟» in the same sentence).

- [ ] **Step 1: Failing tests:** `historyBlock()` output contains no `استخدمت` and no `⟨`; `stripToolTags('[استخدمت show_overview] تفضل') === 'تفضل'`; `question is not a claim`: `claimsScreen('تبغى أعرضها على الشاشة؟') === false`, `claimsScreen('اللوحة قدامك') === true`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. In index.html: strip tags before showing/storing assistant text; at turn end, if `claimsScreen(text)` and no tool in `turnTools` matches /^(show_|render_|data_chart|build_dashboard|pdf_dashboard|open_dashboard)/ → log `⚠️ قال إنها معروضة لكن ما انعرض شي` and, once per turn, `agent.sendText('[تنبيه النظام] قلت إن الشي معروض لكن ما استدعيت أداة عرض. استدعِ الأداة الحين بدون كلام زيادة.', {silent:true})`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(assistant): drop tool tags from archive and replies; catch false screen claims`.

### Task 5: Disappearing view — root cause first

**Files:** determined by investigation (`index.html` view/`renderView`/`ui.home` paths are the suspects).

- [ ] **Step 1:** Use superpowers:systematic-debugging. Reproduce locally with Playwright: call `window.__nora.screenTools` overview path (or the `show_overview` client tool), then open/close the log drawer and wait 20 s; record every call to `renderView`/`ui.home`/`VIEW = null` with a stack (temporary instrumentation, removed after).
- [ ] **Step 2:** Write the failing UI check `view persists after drawer close` in `test/ui.check.mjs`.
- [ ] **Step 3:** Fix the root cause found (one change). If no local repro, add the instrumentation behind `?debug=1`, record that, and stop with a documented hypothesis — no speculative fix.
- [ ] **Step 4:** UI check PASS.
- [ ] **Step 5:** Commit `fix(ui): <root cause>`.

### Task 6: Busy state for quick actions

**Files:**
- Modify: `index.html` (`.qa-btn` handler, CSS)
- Test: `test/ui.check.mjs`

**Interfaces:** `qaBusy(btn, on: boolean)`; skeleton element `#qaSkel` in the main area.

- [ ] **Step 1: Failing UI checks:** after clicking «اعرض المشاريع» the button has `aria-busy="true"` and is disabled within 100 ms; `#qaSkel` visible with «جاري تجهيز المشاريع…»; `busy survives connect`: still busy while `agent.connected` is false; cleared when `#view` becomes visible; after 30 s with no view, message «ما وصل رد — حاول مرة ثانية» with a retry button.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with existing tokens; spinner respects `prefers-reduced-motion`; announce via existing `sr()` (aria-live polite).
- [ ] **Step 4:** PASS (use a 2 s timeout override `window.__qaTimeout` in the check).
- [ ] **Step 5:** Commit `feat(ui): busy and timeout feedback for quick actions`.

### Task 7: Persona consistency

**Files:**
- Modify: `index.html` (engine switch, status text, placeholder, aria-labels, `data-say` prompts)
- Test: `test/ui.check.mjs`

**Interfaces:** `const PERSONA = { gemini: { name: 'نورة', fem: true }, eleven: { name: 'فواز', fem: false } }`; `applyPersona(engine)` sets every string.

- [ ] **Step 1: Failing UI checks** (engine set via the existing switch): eleven → status contains «جاهز» not «جاهزة», input placeholder «اسأل فواز…», input aria-label contains «فواز», mic aria-label contains «فواز», engine button text «المساعد: فواز», quick-action `data-say` «اعرض لي المشاريع»; gemini → the feminine equivalents with «نورة».
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `applyPersona`, called on load and on engine change.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `fix(ui): one persona source for names and gender`.

### Task 8: Test runner, docs, verification, deploy

**Files:** `package.json` (`"test": "node --test test/"`; rename `test/ingest.test.mjs` runner exit to work under `--test`), `docs/ingest/TEST_RESULTS.md` (section 8), `README.md` (one line on `npm test`).

- [ ] **Step 1:** `npm test` → all suites PASS; `node test/ui.check.mjs` → all checks PASS with before/after screenshots in the scratchpad.
- [ ] **Step 2:** superpowers:requesting-code-review on the branch diff; apply Critical/Important via superpowers:receiving-code-review.
- [ ] **Step 3:** superpowers:verification-before-completion: rerun tests, read output.
- [ ] **Step 4:** superpowers:finishing-a-development-branch: merge to main locally, upload changed files to GitHub (one directory per commit, existing method), confirm Render deploy is live, verify on production: quick action busy state → real view, header persona consistent, `/api/ping` shows `persist.protected === false`.
- [ ] **Step 5:** Document results in TEST_RESULTS.md section 8 and commit.
