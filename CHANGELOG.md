# Changelog

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
