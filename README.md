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

## Quick start

```ts
// stilltrue.config.ts (or .mjs / .js)
import { defineStilltrue, corpus, json, surname } from 'stilltrue';

export default defineStilltrue({
  drift: [
    {
      name: 'school-board-roster',
      source: corpus(['https://district.example.org/board']),
      expect: json('./data/school-board.json', (d) => d.members.map((m) => surname(m.name))),
      compare: 'contains-all',
    },
  ],
});
```

```yaml
# .github/workflows/drift.yml
on:
  schedule: [{ cron: '17 14 * * 3' }]  # off-beat minute: GitHub drops :00 crons
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
      - run: npx stilltrue drift
```

`source` is your code (fetch+parse, or LLM extraction — the comparison stays
deterministic either way). `expect` is your curated file. Rot fails the run
with one message per vanished fact; unreachable sources only warn.

## Status

v0.1 — `drift` is real and running in production (AskGwinnett). `golden` and
`verify` are designed but not yet shipped; see the brief.

## License

MIT
