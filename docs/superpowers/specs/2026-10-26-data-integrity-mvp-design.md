# Sub-project 1 — Data integrity & honest UI (MVP)

Date: 2026-10-26 · Owner: Fawaz (sole user) · Developer: Claude
Status: design approved in chat ("موافق على أي حاجة") with the MVP criterion below.

## Intent
Nora must never state a number or a screen state that isn't true, and must never lose saved data.
**MVP criterion (stated by Fawaz):** single user, no extra restrictions beyond what this needs.
No auth hardening, no multi-tenant work, no Drive bridge changes (deferred to a later sub-project).

## Success criteria
1. Asking for a measure/filter column that doesn't exist returns an explicit error listing available columns — never a sum of another column.
2. A failed Postgres restore at boot can never overwrite the good Postgres copy.
3. Uploading several PDFs at once keeps every document in the ingest index.
4. The assistant never says "it's on your screen" unless a screen tool actually ran; tool tags never appear in spoken/written replies.
5. A shown view does not disappear without a user/assistant action (root cause found first).
6. Quick actions show immediate busy feedback until the result or an error arrives.
7. Assistant name/gender is consistent across header, input, button labels and screen-reader names for the active engine.

## Design

### A. Excel column matching (`datasets.js` `colIdx`, `applyFilters`, query paths)
- Match order: exact → normalized (hamza/ta-marbuta/diacritics/"ال") → word-set match.
- Substring match only when the column's normalized name is ≥ 3 chars **and** covers ≥ 60% of the requested name's characters.
- A column whose profile role is `id` is never accepted as a **measure**.
- Unknown measure/group/filter column → throw `ColumnNotFound` with message `العمود «x» غير موجود. المتاح: …`. Nora receives it as the tool error.

### B. Safe restore + protected mode (`persist.js`, `store.js`, `server.js`)
- `restore()`: fetch all `sqlite:*` snapshots first (up to 3 attempts, 1s/3s backoff), validate each is an array, then apply all tables in **one** SQLite transaction.
- On final failure, or when Postgres was configured but `initStore` fell back to SQLite: set `persistState = {protected:true, reason}`; `snapshot()` becomes a no-op while protected.
- Expose `persist` in `/api/ping` and the SSE `hello`; the UI shows a red bar: «وضع محمي: الحفظ الدائم متوقف — <السبب>».
- `SIGTERM`: run a final `snapshot()` (skipped when protected) before exit.

### C. PDF index serialization (`ingest/pipeline.js`)
- In-process promise-chain mutex `withIndex(fn)` around every read-modify-write of `ingest:index` (receive, status updates, reprocess). Single Render instance ⇒ sufficient (approach A, approved).

### D. No false screen claims (`history.js`, `index.html`, `server.js` prompt)
- History archive: remove tool markers from archived assistant text entirely, so the model has no textual pattern to imitate.
- Client: strip any `[استخدمت …]` / `⟨نفّذت …⟩` patterns from displayed/stored assistant text.
- Guard: if an assistant turn claims the screen ("قدامك|على الشاشة|معروضة") and no screen tool ran in that turn, append a note to the log `⚠️ ما انعرض شي فعلياً` and send the model one silent correction per turn asking it to call the tool (never more than once, to avoid loops). Works on the transcript of both engines; best-effort.

### E. Disappearing view (`index.html`)
- Investigate with superpowers:systematic-debugging before changing code. Fix the root cause; add a regression check in the Playwright UI test.

### F. Quick-action busy state (`index.html`)
- On click: button gets `aria-busy="true"`, disabled, inline spinner; main area shows a skeleton card «جاري تجهيز …». Cleared when a view renders, an error arrives, or after 30s with «ما وصل رد — حاول مرة ثانية» (retry button).
- Follows ui-ux-pro-max: loading-buttons, loading-states, timeout-feedback, aria-live polite.

### G. Persona consistency (`index.html`)
- One `PERSONA` map per engine: `{gemini:{name:'نورة', fem:true}, eleven:{name:'فواز', fem:false}}`.
- All strings derived from it: header status (`جاهزة/جاهز`), placeholder, mic/input aria-labels, engine switch label `المساعد: <name>`, quick-action prompts (`اعرضي/اعرض`).

## Out of scope (YAGNI for MVP)
Access-code rate limiting, Drive HMAC, multi-tenancy, Postgres schema migration, unified ingest path, tool consolidation. Brand palette/fonts stay as they are (the ui-ux-pro-max palette suggestion conflicts with FSC/Tujar identity and is not used).

## Testing
- `npm test` → `node --test test/` runs: existing ingest suite + new `test/integrity.test.mjs` (A, B, C, D-history) written test-first.
- UI checks (D-client, E, F, G) in `test/ui.check.mjs` with Playwright against a local server; screenshots before/after.
- Production verification after deploy: quick action shows busy state and real view; header/labels consistent.
