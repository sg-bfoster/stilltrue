# stilltrue

> Your tests check your code. **stilltrue** checks your facts.

AI-in-the-loop apps quietly start lying three ways: code changes break old
answers, the world changes and curated facts rot, and the model embellishes
beyond its sources. stilltrue is one watchdog per failure mode, run from CI —
no server, no dashboard, no SaaS.

| Command | Watchdog | Status |
|---|---|---|
| `npx stilltrue drift` | Curated facts vs their live authoritative sources — fails the build on rot | **v0.1 focus** |
| `npx stilltrue golden` | Deterministic regression evals for answers | later (may wrap promptfoo) |
| `verify` (library) | Judge answers against their sources in the request path | later (P9-shaped staged pipeline) |

**Why drift first:** "drift detection" in the market means statistical ML
feature drift; website-change monitors alert humans, not CI. Nobody ships
*"assert my curated facts still match their live source, as a CI check."*
This was built bespoke three times across three domains before becoming a
package — see [docs/BRIEF.md](docs/BRIEF.md) for the full design brief,
positioning, and build plan.

## Core principle

**AI may extract, but must never decide.** The default drift path has zero AI:
fetch → parse → compare → diff. A consumer's `source()` may use an LLM to pull
structure out of a messy page, but the comparison and the verdict are always
deterministic. Same inputs, same verdict — a nondeterministic alarm trains
people to ignore it.

Drift has three outcomes, never two: `pass`, `rot` (facts changed — fail the
build), and `error` (source unreachable — warn, don't fail). Conflating the
last two causes alarm fatigue.

## Status

Pre-v0.1. Current state: config seam design (`src/config.ts`) validated
against two real production checks (`examples/stilltrue.config.ts`). Next:
the drift runner, then swapping AskGwinnett's bespoke GitHub Actions to it.

## License

MIT
