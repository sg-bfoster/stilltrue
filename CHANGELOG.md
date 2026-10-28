# Changelog

## 0.8.0 — 2026-10-28

**A list is not a denial.**

Asked whether `apple.com/apple-card` supports "Apple Card works with Windows
PCs", the judge ruled `not_supported`, reasoning:

> by listing only Apple devices as having the technology, it implies
> exclusion of other platforms like Windows.

The page never mentions Windows, so the right answer is `cant_tell`. The
contradiction guard could not catch it, because the quoted sentence was real.
It was about Apple Pay, though, not Apple Card. Two lines were added to the
shipped judge prompt:

- A source that names the cases something applies to has not ruled out the
  ones it leaves unnamed, unless it says so in words ("only", "not available
  on").
- A contradicting sentence must be about the same subject as the claim.

Measured on qwen3.6-35b-a3b, the weakest engine behind the demo:

| Set | 0.7.1 | 0.8.0 |
|---|---|---|
| Apple: Windows PCs, 3 runs | 0/3 | 3/3 |
| Apple: 10% Daily Cash, 3 runs | 3/3 | 3/3 |
| Controls | 4/4 | 4/4 |
| 21-case comparison set | 21/21 | 21/21 |
| False supported, all sets | 0 | 0 |

The box is not deterministic at temperature 0. On a second sample 0.8.0
scored 20/21 on the comparison set, missing "Visitors must create an
account". Rerun five times on each prompt, that case scored 4/5 on 0.7.1
and 5/5 on 0.8.0, so the miss is run-to-run variance rather than a
regression.

Known gap: two synthetic list cases still come back `not_supported` on that
model, which reads "issued at Duluth, Norcross and Snellville" as "issued
only at" them. Generating reasoning before the verdict fixed those two but
broke the real Apple case 3/3, so that change did not ship.

## 0.7.1 — 2026-09-13

Docs restructure, no behavior changes except one message:

- README cut from 408 lines to ~190. A fresh-eyes pass (install → first
  green check in three minutes) showed setup was never the problem — the
  document performed difficulty the tool doesn't have. The drift
  quickstart, which tested perfect, is untouched.
- New `docs/CONFIG.md`: the reference shelf (config fields, compare modes,
  helpers, CLI flags), moved verbatim out of the tutorial path.
- `docs/VERIFY.md` gained the `supportStage` section from the README, so
  the ready-made stage lives beside the judge walkthrough it builds on.
- `stilltrue init` now prints the full MARKERS.md URL — npm users have no
  repo checkout for a relative path to resolve against.

## 0.7.0

**A different value now counts as a contradiction.**

The judge used to answer `cant_tell` when a source stated its own figure for
the thing a claim quantified. Asked whether `apple.com/apple-card` supports
"Apple Card gives 10% Daily Cash back on every purchase", it reasoned:

> The source states that Apple Card offers 2% Daily Cash for most purchases,
> 3% at Apple and select merchants, and 1% on the titanium card, but it does
> not mention a 10% Daily Cash rate.

It had read every rate on the page and still treated the absence of the
claimed number as the claim being unaddressed. Nothing on that page denies
10% in words, so the old wording — `cant_tell: the source does not address
the claim` — left it nowhere else to land.

Explicit denial is the rare shape of a false claim. The common one is a wrong
number, and a checker that goes quiet on wrong numbers is quiet exactly when
it is most useful. It also collapsed the distinction the verdict set exists
for: a claim the source contradicts and a claim the source never mentions
came back identical.

- `not_supported` now explicitly covers a source stating a DIFFERENT VALUE for
  what the claim quantifies — a rate, price, date, count, duration or name.
- `cant_tell` explicitly excludes that case.
- The contradiction-quote rule gains the matching line: where the conflict is
  a differing value, the sentence to cite is the one stating the source's own
  value.
- "Compare like with like" ships in the same change, because the obvious
  over-correction is ruling `not_supported` against a page that simply lists
  several values for different cases.

**Minor, not patch.** The public API is unchanged, but verdicts change for the
same inputs — and for a library whose product IS the verdict, that should not
reach a consumer pinned to `^0.6.0` silently.

Verified against a local gpt-oss-20b (the weaker of two available engines),
five claims against one live page:

| claim | before | after |
|---|---|---|
| 3% Daily Cash at Apple | supported | supported |
| **10% on every purchase** | **cant_tell** | **not_supported** |
| works with Windows PCs | cant_tell | cant_tell |
| 2% with Apple Pay | — | supported |
| no annual fee | — | supported |

The last two are over-correction checks. The contradiction guard did not
downgrade the 10% verdict, so it arrived with a verbatim quote that passed the
contiguous-run check — refused with evidence, not merely refused.

## 0.6.0 and earlier

Not recorded here; see the git history.
