# Building your judge — a complete `verify` walkthrough

`verify` hands you a socket, not a bulb: stilltrue runs your checkpoints in
order and enforces the contract (short-circuit, timeouts, fail-open,
structured rejections, retries), but the checkpoints themselves are
functions **you** supply. For deterministic checkpoints that's easy —
`zodStage` ships in the box. The intimidating one is the **AI judge**: the
stage that reads a generated answer and its sources and rules on whether
the sources actually support it.

> **Start here instead, for the common case.** If what you want is
> *does this source support this claim?*, that judge now ships:
> `supportStage({ judge })` gives you the prompt, the response schema and
> the contradiction guard, and takes one argument — a function that calls
> your model. See the README. This guide is what to read when the
> ready-made stage is not the shape you need, or when you want to
> understand what it is doing on your behalf.

This guide is the missing recipe. It's extracted from a judge that has run
in production on every AskGwinnett answer — copy it, then change one line
to use your model provider.

## The mental model (30 seconds)

If you've written Express middleware, you already know this pattern:

```js
app.use(checkAuth);        // Express calls your function,
                           // looks only at next() vs error
runVerify(draft, [judge]); // stilltrue calls your function,
                           // looks only at {ok:true} vs {ok:false}
```

Express doesn't know your auth middleware calls Okta; stilltrue doesn't
know your judge stage calls a model. The provider, the prompt, and the API
key are yours. That's the whole "no AI inside" design.

## The complete judge, copy-paste

```js
import { runVerify } from 'stilltrue';

// ── the ONE provider-specific line ──────────────────────────────────────
// Swap this call for your SDK: OpenAI, Anthropic, a local model, anything
// that takes a prompt and returns text. Keep temperature 0.
async function callModel(prompt) {
  const model = genAI.getGenerativeModel({          // @google/generative-ai
    model: 'gemini-flash-latest',
    generationConfig: { temperature: 0, maxOutputTokens: 400,
                        responseMimeType: 'application/json' },
  });
  const result = await model.generateContent(prompt);
  return result.response.text();
}
// OpenAI equivalent of the call:
//   (await openai.chat.completions.create({ model: 'gpt-4o-mini',
//     temperature: 0, response_format: { type: 'json_object' },
//     messages: [{ role: 'user', content: prompt }] }))
//     .choices[0].message.content
// ────────────────────────────────────────────────────────────────────────

const JUDGE_INSTRUCTIONS = `
You are a strict fact-check judge. Decide whether the SOURCES support the
ANSWER using ONLY the source text — no outside knowledge, no charitable
guessing.
Verdicts:
- "supported": the sources affirmatively back every claim in the answer.
- "not_supported": the sources contradict the answer, or the answer asserts
  something the sources are incompatible with.
- "cant_tell": the sources do not address the answer's claims, or address
  them only partially. Silence is NOT support.
Return STRICT JSON only:
{"verdict":"supported"|"not_supported"|"cant_tell",
 "reason":"<one or two plain sentences>",
 "rewrite":"<a corrected answer using only the sources, or null>"}
`.trim();

export function makeJudgeStage(sources) {
  return {
    name: 'judge',
    timeoutMs: 10_000,
    failPolicy: 'open',   // a judge outage must never block your app
    check: async (draft) => {
      const raw = await callModel(
        `${JUDGE_INSTRUCTIONS}\n\nSOURCES:\n${sources}\n\nANSWER:\n${draft}`,
      );
      const v = JSON.parse(raw);   // a throw here = infra failure → fail-open
      if (v.verdict === 'supported') return { ok: true };
      return {
        ok: false,
        messages: [`judge: ${v.verdict} — ${v.reason}`],
        ...(v.rewrite ? { revision: v.rewrite } : {}),
      };
    },
  };
}

// Wire it up:
const result = await runVerify(draft, [makeJudgeStage(sourcesText)]);
if (result.ok) publish(result.value);        // result.revised may be true
else           publish(result.value);        // the rewrite, if one came back
```

That's the entire integration. Everything below is why each choice is made
the way it is — the parts that took production iteration to learn.

## Crafting the judging prompt

The prompt is the judge. These rules are the difference between a judge
that catches hallucinations and one that rubber-stamps them:

1. **Source-only, said twice.** "Using ONLY the source text — no outside
   knowledge." Models desperately want to be helpful with what they know;
   the instruction must slam that door. You are judging *the pairing*
   (answer ↔ sources), not the truth of the world.
2. **Silence is not support.** Without this line, judges pass any answer
   the sources merely *fail to contradict* — which is most hallucinations.
   A true-sounding claim with no backing in the sources must fail.
3. **Three verdicts, not two.** "Contradicted" and "not addressed" are
   different failures with different fixes (rewrite vs. retrieve more).
   Collapsing them loses the signal your retry loop needs.
4. **Strict JSON with the exact schema in the prompt**, and the provider's
   JSON mode turned on. Parse it; never regex a verdict out of prose.
5. **Temperature 0.** The judge should be as deterministic as a model gets.
   Same answer, same sources, same verdict — anything else trains you to
   re-run until green.
6. **Ask for a rewrite.** A judge that can only reject leaves you
   regenerating from scratch. A judge that returns a corrected,
   sources-only rewrite gives `verify` a `revision` — an answer you can
   ship immediately.
7. **Keep `messages` feedable.** The rejection text goes back into the
   generator's next attempt (`generateVerified`), so write the prompt so
   `reason` reads as an instruction ("the sources say Thursday, not
   Tuesday"), not a verdict essay.

## Operational choices

- **`failPolicy: 'open'`** (the default) — a thrown stage (timeout, API
  down, malformed JSON) means the *checker* broke, not the answer. Warn and
  ship. The warning lands in `result.warnings`; log it so a pattern of
  outages is visible. Use `'closed'` only where shipping unchecked is
  worse than shipping nothing.
- **`timeoutMs`** — set one. A judge that hangs is an outage; the timeout
  routes it into the failPolicy instead of your request path.
- **Model tier** — judging is constrained classification, not generation.
  A cheap flash-tier model at temperature 0 is the right tool; per-answer
  cost is a fraction of the draft's.
- **Malformed JSON** — mostly transient. Either let the throw fail open, or
  retry once inside your `check` before giving up (the production judge
  retries once within a single deadline).

## Cheap stages first

Never make the model check what a regex can. Order the pipeline so the
free checks run before the billed one:

```js
import { zodStage } from 'stilltrue';

await runVerify(draft, [
  zodStage('shape', AnswerSchema),   // free, instant, deterministic
  makeJudgeStage(sources),           // the one model call, last
]);
```

Stages short-circuit: a draft that fails the schema never costs a judge
call.

## Closing the loop: `generateVerified`

```js
import { generateVerified, formatRejection } from 'stilltrue';

const { value } = await generateVerified({
  generate: (feedback) => draftAnswer(question, sources, feedback),
  stages: [zodStage('shape', AnswerSchema), makeJudgeStage(sources)],
  attempts: 2,
});
```

On rejection, the stage's `messages` are handed to your `generate` for the
next attempt — the judge's "the sources say Thursday, not Tuesday" becomes
the correction instruction. `formatRejection` renders a result into
prompt-ready text if you wire the loop yourself.

## Test the judge like the code it is

Your judge is now load-bearing — so pin its behavior the same way you pin
answers: a handful of fixed (answer, sources) pairs with known verdicts —
one clearly supported, one contradicted, one unaddressed ("silence is not
support" — the case most worth pinning). Run them with your eval harness or
[promptfoo](https://promptfoo.dev) whenever you touch the judging prompt,
and run them against the *weakest* model you'd allow, not the best. See
[GOLDEN.md](GOLDEN.md) for the doctrine.

## Live example

The judge pattern above runs in production twice: on every
[AskGwinnett](https://www.askgwinnett.com) answer before publishing, and as
an interactive demo you can poke at —
[rabinforest.com/playground/fact-check](https://www.rabinforest.com/playground/fact-check)
— paste a claim and a source and watch the three verdicts behave.

---

## What `supportStage` adds on top of this recipe

The shipped stage is this walkthrough plus two things learned by running it
against a smaller model than the one it was designed for.

**A line in the prompt: a qualification is not a contradiction.** Sources
qualify constantly — hours with holiday exceptions, fees with waivers, rules
with carve-outs. Without that instruction, a judge treats the caveat as the
source "saying otherwise" and returns `not_supported`, which overstates in
the opposite direction. Measured on a local model, its absence also made the
verdict *unstable*: adding two lines to a source that never mentioned the
claim flipped it, three runs each way, where a frontier model was unmoved.

**A guard in code, not in the prompt.** `not_supported` must carry the
contradicting sentence, quoted, and the stage checks the quote is really in
the source before letting the verdict stand. Prompting improves the odds;
only a structural check gives a guarantee, and this is the verdict most
worth guaranteeing.

Two details of that check were paid for in wrong answers, and are worth
knowing if you write your own:

- **Match on the longest contiguous run, not the whole quote.** Judges tidy
  quotes into grammatical sentences — quoting *"dogs must remain on a leash…"*
  where the source reads *"Dogs are permitted in all county parks **but** must
  remain on a leash…"*. Exact matching discards correct verdicts for it.
- **Set the threshold from your corpus.** The default is 24 characters.
  Contradictions written in prose measured 76-96, but a contradicting line in
  a fee table — `"Seniors 65 and over $1.00."` — is only 26, and a first guess
  of 40 silently threw those away. The number is measured on civic notices and
  has no claim on anyone else's material.
