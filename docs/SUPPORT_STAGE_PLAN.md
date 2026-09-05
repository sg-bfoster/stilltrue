# `supportStage` — a battery for the verify half

**Status:** scoped, not built. Written 2026-09-05 after building the same
thing by hand inside `bfoster-services` and measuring what went wrong.

---

## The problem, stated from the code rather than from feel

The two halves of this package have completely different on-ramps.

**Drift is easy.** `npm install`, `npx stilltrue init`, replace some strings.
Batteries included: `corpus()`, `json()`, `surname()`, `contains-all`. The
README can honestly claim *no programming required*, and it is true.

**Verify is an interface you implement.** To check one claim against one source
a user must understand `VerifyStage`, the `StageOutcome` union, `failPolicy`
open versus closed, and the inline/ci tier system — and then write the judge
themselves: prompt, response schema, parsing, error handling. `docs/VERIFY.md`
runs to 194 lines because it genuinely takes that long to explain.

Exactly one ready-made stage ships today: `zodStage`, a schema check. There is
**no battery for the AI-judging case** — which is the headline use case, the
thing the README leads with, and the reason people arrive at the package.

So the most compelling promise stilltrue makes — *does this source actually
support this claim?* — is the one place it hands you an interface and wishes
you luck.

## Why now: the work already exists, in the wrong place

`bfoster-services` now runs exactly this as the Fact Check page. Building it
took an afternoon, and most of that afternoon was spent on things every other
user would also have to rediscover:

- the judge prompt, including the line that a **qualification is not a
  contradiction** — without it the verdict was unstable
- a **grammar-constrained response schema** (`json_schema`, not `json_object` —
  the local runtime rejects the latter outright) so the verdict enum is
  enforced at the sampler rather than requested politely
- a **contradiction guard**: any "not supported" ruling must quote the
  contradicting sentence, and the quote is checked against the source in code
- matching on the **longest contiguous run**, not the whole string, with a
  threshold set from measurement

None of that is application logic. It is verification logic, which is what this
package is for, and it currently lives where nobody else can use it.

## What the measurements bought

Recorded because they are the justification for the design, and because a
future reader will otherwise be tempted to simplify them away.

**The judge's boundary is unstable without help.** Adding two lines to a source
that never mention the claim flipped a verdict from `supported` to
`not_supported` — three runs each way, so not sampling noise. A frontier model
was stable on the same input; a smaller local model was not. A package that
promises engine-agnostic verification has to survive the weaker engine.

**Exact quote matching is too strict.** The model tidied a quote's subject into
a grammatical sentence — quoting "dogs must remain on a leash…" where the
source read "Dogs are permitted in all county parks **but** must remain on a
leash…". That is what careful writers do when quoting, and exact matching threw
away a correct verdict for it.

**The threshold has to come from data.** A first guess of 40 characters
discarded two more legitimate verdicts. Contradictions in prose measured 76-96
characters; a contradicting line in a fee table — `"Seniors 65 and over $1.00."`
— is only 26. The shipped default is 24, and this is precisely the kind of
number that must be configurable rather than baked in: it was derived from
civic-notice prose and has no claim to authority on anyone else's corpus.

## Proposed API

One function, shaped like `zodStage`, which is the established precedent for a
shipped stage.

```js
import { supportStage, runVerify } from 'stilltrue';

const stage = supportStage({
  // The ONLY required argument: how to call your model. stilltrue ships no AI
  // and no key — same contract as today's README promise.
  judge: async ({ system, user }) => callMyModel({ system, user }),
});

const result = await runVerify([stage], { claim, source });
```

`result.value` carries `{ verdict, reasoning, evidence, contradiction }`.
`result.ok` is false when the verdict is not `supported`, with the reasoning as
the rejection message so `formatRejection()` and `generateVerified()` keep
working unchanged.

Options, all defaulted:

| option | default | why it exists |
|---|---|---|
| `judge` | — | required; you bring the model |
| `name` | `'support'` | stage name in results |
| `minRun` | `24` | contradiction-quote threshold, measured not guessed |
| `requireContradiction` | `true` | enforce the guard; off restores naive behaviour |
| `system` | shipped prompt | override entirely if your judge needs different framing |
| `failPolicy` | `'open'` | a judge outage should warn, not reject — matches the existing default |
| `schema` | shipped | exposed so callers can pass it to a provider that supports constrained decoding |

The shipped system prompt and JSON schema are **exported separately**
(`SUPPORT_SYSTEM`, `SUPPORT_SCHEMA`) so a caller wiring a provider with native
structured output can hand the schema straight to it — that is how the box path
in `bfoster-services` gets its guarantee, and it should not require reaching
into internals.

## What moves, and what does not

**Moves into the package:** the prompt, the schema, `verifyFactCheck`'s
contradiction check including longest-contiguous-run matching, and the verdict
vocabulary.

**Stays in the application:** everything about *calling* a model — endpoints,
keys, timeouts, streaming, engine fallback, budget guards. The package must
still ship no AI, no key, and no provider dependency. `supportStage` receives a
function and never learns what is behind it.

## Anti-goals

- **Do not bundle a provider.** The README's "bring your own judge — any
  provider, or none" is the package's best line. A convenience `openaiJudge()`
  would quietly make that untrue.
- **Do not hardcode the threshold.** 24 came from one corpus of civic notices.
  Configurable, documented, and honest about its provenance.
- **Do not add a fourth verdict yet.** "Supported, with a qualification" is a
  real gap — most real sources read that way — but the boundary was measurably
  unstable, and a fourth bucket would only spread the instability across four
  labels instead of three. Revisit with evidence.
- **Do not make the guard mandatory.** `requireContradiction: false` must
  remain, or the package dictates policy to callers whose corpora differ.

## What this does to the README

The verify section can finally mirror the drift section's shape: install, bring
a judge function, get a working check. The 194-line walkthrough in
`docs/VERIFY.md` becomes the *advanced* path — writing your own stages — rather
than the only path.

That is the actual win. Not a new feature: a shorter first page.

## Estimate and versioning

Small-to-moderate. One new file (~120 lines), one export, unit tests for the
guard (nine already exist in `bfoster-services/eval/unit-factcheck-guard.js`
and port directly), plus README and `docs/VERIFY.md` edits.

**0.6.0** — additive capability, no behaviour change to existing APIs.

## Open questions

1. **Should `ok` be false for `cant_tell`?** Currently proposed as yes, since
   only `supported` is affirmative. But in a `generateVerified` loop that means
   an unanswerable claim retries and then fails, which may not be what a caller
   wants. Possibly `treatCantTellAs: 'reject' | 'warn'`.
2. **Should the stage fetch a URL source?** `corpus()` already fetches for
   drift. Reusing it would be consistent, but it drags fetch policy — timeouts,
   blocked hosts, bot-protection 403s — into a stage that is otherwise pure.
   Suggest not, initially: callers pass text.
3. **Is 24 right for non-civic corpora?** Unknown. It is measured, not
   universal. Worth stating in the docs as measured-on-one-corpus rather than
   presenting it as a tuned constant.
