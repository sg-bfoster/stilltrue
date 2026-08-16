# Picking good markers

A drift check is only as good as its markers — the short strings that must
still appear on the source page. The scaffold and helpers handle the
mechanics; choosing *what* to assert is judgment. These rules come from
checks that have run in production.

## The one-sentence rule

A good marker is a string that **stays the same as long as the fact is
true, and disappears when the fact stops being true** — and nothing else
about the page should be able to break it.

## Do

- **Assert surnames, not full names.** Pages vary titles and first names —
  "Dr. Jane Smith" one year, "Superintendent Smith" the next. The surname
  survives both. That's what the `surname()` helper is for (it also strips
  "Jr." / "III").
- **Assert numbers with a unit word attached.** `"143 schools"` is a strong
  marker; bare `"143"` is weak — it could match a street address or a page
  count somewhere else on the page. Glue the number to the word that gives
  it meaning.
- **Assert dates the way the page writes them.** If the page says
  "August 5, 2026", assert exactly that string. When the site rolls to a
  new year, the marker vanishes and the check tells you to refresh.
- **Fetch every page the facts are spread across.** `corpus()` accepts a
  list — if the roster is on one page and the superintendent on another,
  include both. A marker only needs to appear on *one* of them.
- **Keep the curated file as the single source of truth** and *derive*
  markers from it in the config (`json('./facts.json', data => [...])`).
  When you update the data file, the markers update themselves — they can
  never drift apart from the facts they guard.

## Don't

- **Don't assert whole sentences or paragraphs.** One rewording by the
  site's editor fires a false alarm. Long markers rot with the page's
  *style*; short markers rot with its *facts*. You want the second.
- **Don't assert anything that appears in menus, footers, or boilerplate.**
  "Contact Us" will still be on the page long after the fact you care about
  is gone — a marker that can't fail protects nothing.
- **Don't assert formatting.** Phone numbers are risky: `770.822.7010` vs
  `(770) 822-7010` is the same fact, different string. If you must assert
  one, match the page's exact formatting, and expect to revisit it.
- **Don't chase synonyms with the marker.** If a fact could be phrased many
  ways ("chair", "chairwoman", "chairperson"), the *name* is the marker,
  not the title.

## Case sensitivity and matching

`contains-all` matching is **case-insensitive** and matches anywhere in the
page text (HTML tags, scripts, and styles are stripped first). So `"Smith"`
matches "SMITH", "smith", and "Smithfield" — keep markers long enough that
accidental substring hits are implausible. If a surname is dangerously
common on that page ("Park", "Hall"), consider a longer marker like
`"Vice Chair Park"` — matched to how the page actually writes it.

## When a check fires

`rot` means: go look at the source page yourself, verify what changed, and
update your curated data file by hand. stilltrue deliberately never
auto-updates your facts — an alarm you can audit is trustworthy; a robot
that silently rewrites your data is not.
