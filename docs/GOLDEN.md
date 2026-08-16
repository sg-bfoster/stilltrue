# Golden — why stilltrue doesn't ship it, and how to do it well

stilltrue deliberately has no `golden` runner. Regression evals for prompts
and answers are a crowded, well-served lane — [promptfoo](https://promptfoo.dev)
is the incumbent (YAML/JS cases, deterministic + LLM-graded assertions,
provider matrix, CI, HTML viewer) and building a second one would serve
nobody. **promptfoo tests your prompts; stilltrue tests your facts.**

Use promptfoo (or your own harness) for golden. Use stilltrue for the two
things eval tools don't cover: `drift` (are my curated facts still what the
authority publishes?) and `verify` (staged acceptance of AI output in the
request path).

## Doctrine worth keeping, whatever runner you use

Extracted from a production harness (AskGwinnett, ~117 cases) that has
gated real releases:

1. **Every fixed bug becomes a case.** The suite is a ratchet: once a wrong
   answer is fixed, a case pins it. Suites grown this way stay honest;
   suites written up-front go stale.
2. **Deterministic assertions by default** — `mustContain`, `mustMatchAny`,
   `forbid`, shape checks. An assertion that can flake trains you to rerun
   until green.
3. **LLM-graded assertions are a different animal.** Opt-in per case, and
   report them separately — never average a nondeterministic grade into a
   deterministic pass rate.
4. **The target is just a URL + request template.** Keep the harness able to
   point at localhost, staging, or prod; spawn the server in the harness
   only if your app makes that cheap.
5. **Assert intent, not vocabulary.** A case that demands the literal word
   "address" fails when the model says "your specific location" while doing
   exactly the right thing. Use alternations (`mustMatchAny`) sized to the
   intent, and widen them when a flake shows the model phrasing varies.
6. **Gate on exit codes, unpiped.** `npm run eval` in CI, no `| tail` —
   pipes mask the exit status that CI depends on.

## Pairing with stilltrue

A healthy AI app runs all three, and they answer different questions:

| Question | Tool |
|---|---|
| Did a code change break an answer that used to be right? | golden (promptfoo / your harness) |
| Did the world change out from under my curated facts? | `stilltrue drift` |
| Is this specific generated answer faithful to its sources, right now? | `stilltrue verify` |
