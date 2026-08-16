# stilltrue — project brief

> **Name: `stilltrue`** (settled Aug 2026). Verified available on npm at time of writing — claim it early. Grab `stilltrue.dev` too.
>
> The name is the product's question: *is it still true?* Facts don't fail to be true — they **stop** being true, and "still" carries that time dimension. Tagline: **"Your tests check your code. stilltrue checks your facts."**
>
> CLI reads as `npx stilltrue drift` / `npx stilltrue report` / `npx stilltrue golden`.
>
> Checked and rejected: `curator` (npm-squatted, abandoned 2011 v0.0.9; also vague about what it does), `touchstone` (taken, dead v0.0.3), `plumbline` (taken, active), `sooth` (taken, active). Runner-up: `holdstrue` (available) — better English, weaker as a command, loses the time dimension.
>
> **The package name is independent of the watchdog names.** `drift` can still be renamed to `rot`/`staleness` later without touching the brand. See naming note in Open Questions.

*(Historical note: this document was drafted under the working name "Curator"; any remaining references to that name mean `stilltrue`.)*

> ## START HERE (agent orientation)
>
> **Status:** UNPINNED — Brian wants to build this soon (Aug 2026). **No code exists yet.** Start with §"First session" at the bottom of this doc.
>
> **One sentence:** An npm package + CLI that makes AI-in-the-loop apps falsifiable — regression evals for answers, drift checks for curated facts, and judge-model verification of output against sources — extracted from machinery already running in production in this repo.
>
> **This is an EXTRACTION, not an invention.** All three pieces exist here as bespoke code and must become imports of the package:
> - `eval/` — golden eval harness (~40 deterministic cases, self-spawns server on :8098, `npm run eval`, "every fixed bug becomes a case")
> - `server/askgwinnett/review.js` — check sweep: judge model (gemini-2.5-flash, temp 0) verifies every draft answer against its tool payloads before publishing; fail-open
> - Weekly GitHub Actions drift checks — BOC refresh + GCPS roster surname check; fail loudly on drift (built twice: county + school board)
>
> **Built THREE times, in three domains.** The third instance is in a different repo and is the most sophisticated: `backrooms/.docs/P9_AI_LEVEL_REJECTION_CONTRACT.md` + `src/world/levelModelAcceptanceGates.ts`. **Read P9 before designing the `verify` API** — see §"Verify API" below. Three independent implementations because nothing off the shelf did this. That is the evidence the package should exist.

## Positioning (settled)

**NOT RAG-in-a-box.** RAG is the retrieval layer (saturated market). This is the trust layer RAG products don't ship: proof the answers are still true. RAG's popularity is the distribution, not the competition — anyone with a RAG stack is the customer. Notable credibility point: AskGwinnett explicitly parked semantic RAG in favor of deterministic tool routing because correctness mattered more than clever retrieval; this package is what was built instead.

**Plain-language pitch:** AI apps quietly start lying three ways — code changes break old answers, the world changes and curated facts rot, the model embellishes beyond its sources. Curator is one watchdog per failure: a test list (`golden`), a staleness checker (`drift`), a fact-checker (`sweep`). "Everyone's building AI apps that answer questions; almost nobody has an alarm for when the answers stop being true. This is the alarm."

## Shape (settled)

- TypeScript npm package + CLI, lives in the guarded app's repo, runs in CI. No server, no dashboard, no SaaS. GitHub Actions is the scheduler.
- `npx curator golden` (every push) · `npx curator drift` (weekly cron) · `sweep` is both CLI and library import (runs in the request path, where review.js sits today).
- Cases/checks are **data, not code** (JSON + config) — same doctrine as eval/ cases and Lost Corridors maps.
- Zod for all schemas. Provider-agnostic judge adapter (Gemini/OpenAI/Anthropic — this is a mixed shop).
- Ship a GitHub Action wrapper so the weekly drift cron is ~5 lines of workflow.

```ts
// curator.config.ts sketch
export default defineCurator({
  golden: { cases: './curator/golden/*.json', target: 'http://localhost:8098/askgwinnett/chat' },
  drift: [{ name: 'gcps-board-roster', source: fetchAndScrape, expect: './data/school-board.json', compare: 'surnames' }],
  sweep: { judge: { provider: 'gemini', model: 'gemini-2.5-flash', temperature: 0 }, mode: 'fail-open' },
})
```

## Core principle: AI may extract, but must never decide (settled)

The package's core is **deterministic**. Same inputs → same verdict, always. A nondeterministic alarm is worse than no alarm, because people learn to ignore it.

- **`drift` default path has zero AI.** Fetch → parse → compare to the expected file → diff. No API key, no per-run cost, no hallucinated alarms.
- **AI may enter in exactly two places, both opt-in and both the consumer's choice:**
  1. *Extraction* — a consumer's `source()` may use an LLM to pull structure out of a messy page (cf. `events-ai-extract.js`). Inside their function; the package neither knows nor cares.
  2. *Judging, in `verify` only* — pluggable by design (LLM per review.js, or deterministic per P9).
- **The comparison/verdict step stays deterministic even when extraction used AI.** Extraction turns mush into structured data; comparing structured data is deterministic.
- **`golden`:** deterministic assertions by default (`mustContain`, `mustCite`, `forbid`, shape checks — what the existing ~40 cases already are). LLM-graded assertions opt-in per case, and **reported separately** — a nondeterministic assertion in a regression suite is a different animal and shouldn't be averaged in with deterministic ones.

This is the same rule Brian has now applied four times: popup-book (AI fills content, templates own geometry), Atari scene compiler (AI describes scenes, compiler owns timing), P9 (AI proposes levels, gates own acceptance), and here. Treat it as the house philosophy, not a per-feature decision.

## Verify API — model it on P9, not on review.js (settled)

`review.js` alone would have baked in a wrong assumption: that the judge is a model and the verdict is a single pass/fail. `backrooms` P9 proves otherwise, in a domain with no chat, no text, and no LLM.

**Required reading before writing `verify`:** `backrooms/.docs/P9_AI_LEVEL_REJECTION_CONTRACT.md` and `src/world/levelModelAcceptanceGates.ts`.

What P9 contributes that review.js does not:

- **The judge is pluggable.** It may be an LLM (review.js), a deterministic validator (Zod parse, geometry invariants), or a **staged pipeline** of validators.
- **Stages are ordered and short-circuit.** Run in a fixed order, stop at the first failure; later stages may assume earlier ones passed. P9 runs nine (`parse_schema` → `model_invariants` → `compiled_portals` → … → `floor_ceiling_coverage`).
- **Rejection is structured and machine-readable**, designed to be fed *back to the generator* for retry:
  ```ts
  { ok: false, stage: Stage, messages: string[] }   // one issue per entry
  ```
- **Retry contract is a first-class concept**, not an afterthought. This is the feedback loop the Atari brief identifies as the missing ingredient for AI 6502 codegen — same shape, different validator.
- **Separation of gate tiers:** fast structural gates run inline; expensive gameplay/simulation checks stay in CI (`level:check`). The package should express both tiers.

So the `verify` shape is roughly: an ordered array of stages, each `(input, ctx) => Promise<{ok, messages}>`, with fail-open policy configurable per stage (review.js's doctrine: a judge outage must never block the app).

## Consumers — build against two, not one (settled)

AskGwinnett alone is a sample size of one and will produce an API perfectly shaped to AskGwinnett. Wire consumer #2 in **before** the API feels finished.

| Consumer | golden | drift | verify | Why it matters |
|---|:--:|:--:|:--:|---|
| **AskGwinnett** (`bfoster-services` + `county-app`) | ✅ | ✅ | ✅ | Only project where all three bite; the only real external-rot source |
| **Lost Corridors** (`backrooms`) | ✅ | ❌ | ✅ | **Primary generalization test.** No chat, no text, no LLM judge. `test:p9-gates` + a dozen `test:*` scripts are already a golden suite; P9 is already a verify pipeline |
| Rabin Forest | ✅ | — | ✅ | Different provider mix + framework (React/Express). Optional third |
| Atari harness (`atari-game`) | ✅ | ❌ | ✅ | Later. "Question" = scene, assertion = cycle report. Proves nothing is hardcoded to chat |
| ~~Callmata~~ | ❌ | ❌ | ❌ | **Verified no fit** — no AI, no curated external facts; data is user-generated app state. Useful negative example: defines the audience as "apps that make claims about facts they didn't author" |

## Build/launch plan (settled)

1. v0.1 is the **refactor**: eval/, review.js, and both drift Actions become imports of the package. AskGwinnett running on it IS the proof and writes the README.
2. Publish only when that swap is green.
3. Second consumer: the Atari 2600 scene-compiler harness (`atari-game/.agents/scene-compiler-brief.md`) — golden cases where the "question" is a scene and the assertion is a cycle report.
4. Third consumer: the walkable-storybook pipeline (story model vs compiled scene verification).

## Competitive landscape (researched Aug 2026 — do not skip this section)

- **`golden` is a crowded lane.** promptfoo (npm, YAML cases, CI, deterministic + LLM-graded assertions) is the incumbent and covers ~80% of golden's design; DeepEval owns the Python side; Braintrust/LangSmith/Langfuse own the SaaS side. **Do not build a second promptfoo.** Options: interoperate (curator case format → promptfoo runner), or keep golden as a thin opinionated wrapper only.
- **`sweep` half-exists.** Runtime guardrails are established in Python (Guardrails AI, NeMo); LLM-as-judge is a known pattern. TS-native, fail-open, Express/Next-request-path verification is thinner — differentiated but not virgin.
- **`drift` is the open lane and the product's identity.** "Drift detection" in the market means statistical ML feature drift (Evidently, NannyML) — an unrelated problem. Website-change monitors (changedetection.io) alert humans, not CI, and aren't bound to a dataset. **Nobody ships "assert my curated facts still match their live authoritative source, as a CI check that fails on rot."** Brian built this twice (BOC refresh, GCPS surname check) because it didn't exist. It still doesn't.

**Revised positioning (supersedes original pitch):** "promptfoo tests your prompts; Curator tests your facts." Lead with drift — it could ship alone as v0.1 and still be novel. Sweep is the second act. Golden defers to or wraps promptfoo.

## Open questions

- Name ("curator" is a placeholder; check npm availability).
- **Watchdog naming (unsettled — do not treat as final):** `golden` is a correct industry borrow (golden dataset/golden files) — keep. `drift` collides with statistical ML drift (Evidently/NannyML sense) — maybe fine, maybe rename to `rot` / `staleness` / `freshness`. `sweep` is a private coinage from review.js and collides with hyperparameter sweeps (W&B) — for a public package, rename to `verify` or `grounded` (industry terms: groundedness / faithfulness checking, LLM-as-judge).
- Monorepo of scoped packages (@x/golden, @x/drift, @x/sweep) vs one package with three entry points. Lean: one package, three entry points; split later if real.
- How much of the eval harness's self-spawning-server trick generalizes vs stays AskGwinnett-specific (probably: target is just a URL + request template).
- License (lean MIT).

## First session — where to actually start

Ship **`drift` alone** as v0.1. It is the open lane (no incumbent), the smallest piece, and the one with a real production consumer on day one. Do not start with golden (crowded — promptfoo) or verify (needs the P9 design absorbed first).

1. **Decide the repo + name.** New standalone repo. Check npm availability before committing to a name.
2. **Design the config seam first, not the implementation.** The entire product is "the package owns the *how*, the consumer's config owns the *what*." Write `curator.config.ts` for two real checks — the GCPS roster surname check and the BOC refresh — *before* writing the runner. If the config can express both without special-casing, the seam is right.
3. **Build the runner:** load config → for each check, call `source()` → compare against `expect` → structured result. ~400 lines.
4. **Three distinct outcomes, never two.** `pass` / `rot` (facts no longer match — fail the build) / `error` (source unreachable, timeout, WAF 403 — warn, do NOT fail). Conflating the last two causes alarm fatigue and uninstalls. Brian has already hit this with the Grayson RSS WAF 403 (`cachedFetch` stale-serve).
5. **Swap AskGwinnett's two bespoke drift Actions to call the package.** Green = v0.1 works.
6. **Only then**: the HTML report (`npx curator report`) — drift timeline, red/green grid, diffs of what rotted. This is the differentiator; eval tooling in this space is all terminal walls of text, and Brian is a frontend dev. Screenshots are how dev tools spread.
7. Publish. Then verify (P9-shaped), then decide golden's fate (wrap promptfoo or defer to it).

**Explicitly deferred:** auto-updating curated data. Drift alarms, a human fixes. A later civilized option is opening a PR with the proposed diff — never a silent write to main.

## Risk noted in session

OSS adoption needs docs/evangelism energy that isn't the fun part for Brian. Downside case is still good: three of his own projects consume it, so it's accountable to him even at zero stars. Do not let README-polish block the v0.1 refactor.
