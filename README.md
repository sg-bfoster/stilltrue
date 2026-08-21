# stilltrue

> Your tests check your code. **stilltrue** checks your facts.

## The problem

Say you've built an app or chatbot that answers questions using facts you
collected — a list of school board members, office hours, tax rates,
whatever. You checked those facts when you wrote them down. But the world
keeps moving: a board member resigns, a rate changes, a first day of school
rolls over. **Your app doesn't know.** It keeps confidently repeating
yesterday's truth, and nothing alerts you.

stilltrue is the alarm. Once a week (or whenever you like), it re-reads the
official web pages your facts came from and checks that every fact you
recorded still appears there. If something vanished, your build fails and
tells you exactly which fact went stale — so a human can go verify and
update it.

## What you get

| Command | What it does |
|---|---|
| `npx stilltrue drift` | Checks your saved facts against their live sources. Fails loudly if a fact has gone stale. |
| `npx stilltrue report` | Turns past check runs into a simple web page — green/red grid, what broke and when. |
| `verify` | For developers: a checkpoint that inspects AI-generated answers before they're shown to users. |

## Getting started

You'll need [Node.js](https://nodejs.org) (version 20 or newer) and a
project folder with your facts saved in a JSON file.

**1. Install it** — in your project folder, run:

```bash
npm install --save-dev stilltrue
```

**2. Scaffold a check** — this creates a ready-to-edit config file (it
never overwrites anything you already have):

```bash
npx stilltrue init
```

Open the generated `stilltrue.config.mjs`. Each check answers three
questions: *where do I fetch the truth from* (`source`), *what do I
believe* (`expect`), and *how do I compare the two* (`compare`) — and in
its simplest form, **the only editing needed is replacing strings**:

```js
import { defineStilltrue, corpus } from 'stilltrue';

export default defineStilltrue({
  drift: [
    {
      name: 'my-first-check',
      // Where the truth lives: the official page(s) your facts came from.
      source: corpus(['https://example.org/about']),
      // What you believe: your facts, as short strings ("markers").
      expect: ['Jane Smith', 'Main Street Office', '12 locations'],
      // How to compare: every marker must still appear on those pages.
      compare: 'contains-all',
    },
  ],
});
```

This says: *fetch that page, and make sure "Jane Smith", "Main Street
Office", and "12 locations" all still appear on it.* Swap in your own URL
and your own facts — that's a working check, no programming required.

Every other field, compare mode, and helper is in
[Configuration](#configuration) below. Choosing *what* to assert is the
judgment call — surnames beat full names, `"143 schools"` beats a bare
`"143"`. The short guide: [docs/MARKERS.md](docs/MARKERS.md).

**Leveling up (optional):** you don't have to keep the facts in the config.
If `./data/markers.json` is just a list of strings, point at it with
`expect: json('./data/markers.json')` — still no code. And if your app
already keeps structured data, derive the markers from it so your data file
stays the single source of truth:

```js
// ./data/school-board.json: { "members": [{ "name": "Dr. Jane Smith" }, ...] }
expect: json('./data/school-board.json', (data) =>
  data.members.map((m) => surname(m.name))   // keeps just "Smith" — titles
),                                           // and first names vary on pages
```

The function receives *your* file's contents, whatever shape they are, and
returns the list of markers — stilltrue never needs to understand your data
structure. Update the data file and the markers update themselves.

**3. Run it:**

```bash
npx stilltrue drift
```

You'll see one line per check:

```
✓ school-board-roster — pass (1204ms)

1 pass, 0 rot, 0 error (errors warn, never fail)
```

## The three results (and why there are three, not two)

- **pass** — every saved fact still appears at its source. All good.
- **rot** — a fact is gone from the source. The world changed; your data is
  stale. This *fails the run* so you notice and fix the data.
- **error** — the website couldn't be reached (down, timeout, blocked).
  This only *warns*. An unreachable site doesn't mean your facts are wrong,
  and an alarm that cries wolf gets ignored — so outages never fail the build.

## Configuration

stilltrue loads a config file from the current directory. The first of
these that exists wins:

`stilltrue.config.ts` · `.mts` · `.js` · `.mjs` · `.cjs`

(`npx stilltrue init` writes `.mjs`.) Point at a file anywhere with
`stilltrue drift --config path/to/file`.

Wrap the export with `defineStilltrue` so TypeScript can check it:

```js
import { defineStilltrue, corpus, json, surname } from 'stilltrue';

export default defineStilltrue({
  drift: [ /* one entry per fact-set */ ],
  verify: { /* optional named pipelines — library use, see below */ },
});
```

### Drift checks

Each `drift` entry is one curated fact-set vs its live source.

| Field | Required | Default | What it is |
|---|---|---|---|
| `name` | yes | — | Short id. Shows up in the terminal, `--only`, and the report. |
| `source` | yes | — | `async (ctx) => actual`. Fetch/parse the live authority. **Throw** if the source is unreachable — that is outcome `error`, never `rot`. |
| `expect` | yes | — | The curated facts. A value, or `async (ctx) => expected` (e.g. `json(...)`). A throw here is also `error` (broken config, not rot). |
| `compare` | no | `'deep-equal'` | How to compare `expect` against what `source` returned. |

`source` and function-form `expect` receive `ctx`:

| | |
|---|---|
| `ctx.warn(message)` | Record a non-fatal note (one of several pages down, odd markup). Shows as a warning; does not fail the run. |
| `ctx.configDir` | Absolute directory of the config file. Data paths resolve from here. |

### `compare`

**`'contains-all'`** — `expect` is a list of marker strings; `source` must
return a text corpus (what `corpus()` returns). Every marker must appear
somewhere in that text, case-insensitively. Extra text on the page is
ignored. This is the webpage-watch check.

**`'deep-equal'`** — structural equality. Extra keys, missing keys, and
value mismatches all rot, with pathed messages
(`$.members[2].name: expected "Smith", source has "Jones"`). Use this when
`source()` already returns structured data that should match `expect`
exactly.

**A function** — `(expected, actual) => string[]`. Return `[]` to pass;
each string is one mismatch (outcome `rot`). Throw if the shapes are
unusable (outcome `error`). Use this for numeric tolerance, order-insensitive
lists, or any comparison that isn't "markers in a page" or "these two
objects are identical."

```js
compare: (expected, actual) =>
  expected.rate === actual.rate
    ? []
    : [`tax rate ${expected.rate} → ${actual.rate}`],
```

Surnames are a *marker choice*, not a compare mode: derive them from your
data with `surname()` and use `'contains-all'`.

### Helpers

These are the built-in `source` / `expect` builders. You can always write
your own functions instead.

**`corpus(urls, options?)`** — fetch pages, strip HTML to text,
concatenate. Individual unreachable pages call `ctx.warn`; if *every* page
fails, it throws (`error`). Pair with `'contains-all'`.

| Option | Default | What it is |
|---|---|---|
| `timeoutMs` | `20000` | Per-page fetch timeout, milliseconds. |
| `userAgent` | `stilltrue drift check (github.com/sg-bfoster/stilltrue)` | Sent on each request so operators can identify the check. |

```js
source: corpus(
  ['https://example.org/about', 'https://example.org/board'],
  { timeoutMs: 15_000, userAgent: 'my-app drift check' },
),
```

**`json(path, derive?)`** — read a JSON file relative to the config file.
With no `derive`, the parsed value *is* the expectation (typical with
`'deep-equal'`). With `derive`, you map that value into whatever `compare`
needs — usually a marker list:

```js
expect: json('./data/board.json', (data) =>
  data.members.map((m) => surname(m.name)),
),
```

**`surname(fullName)`** — last token of a name, with leading honorifics
(`Dr.`, `Mr.`, `Mrs.`, `Ms.`) and trailing generational suffixes (`Jr.`,
`Sr.`, `II`–`V`) stripped. `"Dr. Jane Smith III"` → `"Smith"`.

**`htmlToText(html)`** — the same tag-stripping `corpus()` uses. For a
custom `source` that already has HTML in hand.

### Custom `source`

A throw is an outage; a return value is data to compare. Warn for partial
trouble:

```js
source: async (ctx) => {
  const res = await fetch('https://example.org/api/rates');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.updatedAt) ctx.warn('response missing updatedAt');
  return data;
},
expect: json('./data/rates.json'),
// compare defaults to 'deep-equal'
```

### `verify` pipelines

`verify` is an optional map of named stage lists, for use from your app
(`runVerify(config.verify.answers, draft)`). There is no `stilltrue verify`
CLI command — verification runs in the request path, not in CI.

Each stage:

| Field | Required | Default | What it is |
|---|---|---|---|
| `name` | yes | — | Id of this checkpoint. The first rejection reports this name. |
| `check` | yes | — | `(input, ctx) => { ok: true, value? } \| { ok: false, messages, revision? }`. |
| `failPolicy` | no | `'open'` | What a **thrown** stage means. `'open'`: warn and continue (a judge outage must not block the app). `'closed'`: treat the throw as a rejection. |
| `timeoutMs` | no | none | Abort the stage after this many ms. The timeout follows `failPolicy`. |
| `tier` | no | `'inline'` | `'inline'` always runs; `'ci'` runs only when you call `runVerify(..., { tier: 'ci' })`. |

Stages run in order and stop at the first rejection. `zodStage(name, schema)`
builds a parse stage from a Zod schema.
`generateVerified({ generate, stages, attempts, tier })` is the generate →
verify → retry loop (`attempts` defaults to `2`). See
[For developers: `verify`](#for-developers-verify) below.

### CLI flags

`stilltrue drift`:

| Flag | What it does |
|---|---|
| `--config <path>` | Config file. Default: first `stilltrue.config.*` in the current directory. |
| `--only <name,name>` | Run only these checks. |
| `--json <path>` | Write the result array as JSON. |
| `--record` | Append this run to history. |
| `--history <path>` | History file for `--record`. Default: `.stilltrue/history.jsonl`. |

`stilltrue report`:

| Flag | What it does |
|---|---|
| `--history <path>` | History file to read. Default: `.stilltrue/history.jsonl`. |
| `--out <path>` | HTML output. Default: `stilltrue-report.html`. |
| `--title <text>` | Page `<title>` and heading. Default: `stilltrue drift report`. |

## Running it automatically every week

If your project is on GitHub, add this file as
`.github/workflows/drift.yml` and GitHub will run the check every Wednesday
and email you if anything rotted:

```yaml
name: Fact drift check
on:
  schedule:
    - cron: '17 14 * * 3'   # Wednesdays, ~10am US Eastern
  workflow_dispatch:         # adds a manual "Run workflow" button
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with: { node-version: '22' }
      - run: npm ci
      - run: npx stilltrue drift
```

## The report

Add `--record` to save each run, then generate the web page:

```bash
npx stilltrue drift --record
npx stilltrue report
```

That writes `stilltrue-report.html` — open it in any browser. It shows a
timeline grid (one row per check, one column per run, green ✓ / red ✗ /
amber ⚠) and a log of everything that ever rotted, with details.

## One rule underneath everything

**AI may extract, but never decides.** The drift check itself uses no AI at
all — it fetches, reads, and compares text, the same way every time, with
no API key and no cost. Deterministic alarms are trustworthy alarms. (If
*your* fact-gathering step wants to use AI to pull structure out of a messy
page, that's fine — it happens inside your `source` function, and the
comparison stays mechanical.)

## For developers: `verify`

`verify` is a library for teams shipping AI-generated answers: an ordered
series of checkpoints (a schema parse, a rules check, an AI judge — your
choice) that each answer must pass before publishing. Rejections say
exactly which checkpoint failed and why, in a format you can feed back to
the model for a retry. A broken checker never blocks your app — it fails
open. See the [project docs](docs/BRIEF.md) and the typed API in
`stilltrue`'s exports (`runVerify`, `zodStage`, `generateVerified`).

**Bring your own judge — any provider, or none.** stilltrue ships no AI
and never touches a model key: a checkpoint is just a function you supply,
so the judge stage can call Gemini, OpenAI, Anthropic, a local model — or
be a plain schema/rules check with no AI at all. Swapping providers means
editing your function, never this package.

Don't design the judge from scratch: **[docs/VERIFY.md](docs/VERIFY.md)**
is a complete copy-paste walkthrough — a production-tested judging prompt
("silence is not support"), the response mapping, retries, and the
generate → verify → retry loop — with one marked line to swap for your
provider.

## What about testing prompts?

That's a different job with a great existing tool:
[promptfoo](https://promptfoo.dev) tests your prompts; stilltrue tests your
facts. How they fit together: [docs/GOLDEN.md](docs/GOLDEN.md).

## License

MIT — free to use, modify, and share.
