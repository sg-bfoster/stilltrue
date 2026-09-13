# Configuration reference

Everything `stilltrue drift` and the config file accept. The 60-second
setup lives in the [README](../README.md); this page is the shelf you come
back to.

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
[VERIFY.md](VERIFY.md).

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

