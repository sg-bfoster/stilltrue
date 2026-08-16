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

**2. Describe a check** — create a file called `stilltrue.config.mjs` in
the same folder. Each check answers three questions: *where do I fetch the
truth from* (`source`), *what do I believe* (`expect`), and *how do I
compare the two* (`compare`):

```js
import { defineStilltrue, corpus, json, surname } from 'stilltrue';

export default defineStilltrue({
  drift: [
    {
      name: 'school-board-roster',
      // Where the truth lives: the district's own pages.
      source: corpus(['https://www.myschooldistrict.org/board']),
      // What you believe: read your saved file, keep just the last names.
      expect: json('./data/school-board.json', (data) =>
        data.members.map((m) => surname(m.name))
      ),
      // How to compare: every name must still appear on those pages.
      compare: 'contains-all',
    },
  ],
});
```

This example says: *fetch the board page, and make sure every last name in
my `school-board.json` file still appears somewhere on it.*

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

## What about testing prompts?

That's a different job with a great existing tool:
[promptfoo](https://promptfoo.dev) tests your prompts; stilltrue tests your
facts. How they fit together: [docs/GOLDEN.md](docs/GOLDEN.md).

## License

MIT — free to use, modify, and share.
