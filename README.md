# LeetCode for Obsidian

Browse, solve, and note LeetCode problems inside your Obsidian vault. Every
solved problem becomes a first-class note — tagged, linked, and discoverable —
so practice builds a knowledge graph instead of scattered code files.

## Features

- Browse the LeetCode problem list with search + difficulty/status filters
- Open any problem as an Obsidian note with locked frontmatter and a `## Problem` statement rendered as Markdown
- Write solutions in a native fenced code block — no custom editor, no separate editor pane
- Run your code against sample or custom test cases with `LeetCode: Run`
- Submit to LC's judge with `LeetCode: Submit`; every verdict type (AC, WA, TLE, MLE, CE, RE) is surfaced
- On Accepted, the plugin updates frontmatter and writes `[[Technique]]` backlinks, turning your vault into a knowledge graph of solving techniques
- Browse your past LC submissions with `LeetCode: View past submissions`
- Previously fetched problems stay readable offline

## Install

### From the Obsidian community plugin store (recommended, after v0.1.0 acceptance)

1. Open Obsidian → Settings → Community plugins → Browse
2. Search for `LeetCode`
3. Install, then Enable

### Manual install (from release assets, pre-acceptance)

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest [GitHub release](https://github.com/moxu/obsidian-leetcode/releases)
2. Copy them into `.obsidian/plugins/leetcode/` inside your vault
3. Open Obsidian → Settings → Community plugins → enable `LeetCode`

## Usage walkthrough

1. Install and enable the plugin.
2. Log in: Settings → LeetCode → `Log in`. An embedded window captures your `leetcode.com` session cookie after you sign in normally. If the embedded window does not work on your platform, paste your `LEETCODE_SESSION` cookie into the manual-cookie field instead.
3. Open the problem browser via the ribbon icon or the `LeetCode: Open problem browser` command.

   ![Problem browser](docs/problem-browser.png)

4. Click any problem. The plugin creates a note at `{Problems folder}/{id}-{slug}.md` with the problem statement, frontmatter, and a fenced code block ready for your solution.

   ![Problem note](docs/problem-note.png)

5. Write your solution in the `## Code` fenced block. In Reading mode, `Run` and `Submit` buttons appear directly below the code block. In Live Preview, use the command palette (`LeetCode: Run`, `LeetCode: Submit`).
6. When you are ready, click `Submit`. The verdict modal shows the result, runtime, memory, and percentile:

   ![Verdict — Accepted](docs/verdict-accepted.png)

7. On Accepted, the plugin writes `[[Technique Name]]` wikilinks under a `## Techniques` section and creates stub technique notes. Open Obsidian's Graph view to see the knowledge graph forming:

   ![Graph view](docs/graph-view.png)

## Network usage

This plugin communicates with leetcode.com to fetch problems and submit solutions. No other network endpoints are contacted.

Authentication is handled via an embedded Obsidian `BrowserWindow` that captures your LC session cookie after you sign in. The cookie is stored only in `.obsidian/plugins/leetcode/data.json` on your local machine, is never transmitted anywhere except leetcode.com, and is never logged.

## Configuration

Open Settings → LeetCode. Three sections:

- **Authentication** — log in, log out, or paste a session cookie manually as a fallback.
- **Notes** — choose the vault folder for problem notes (default: `LeetCode`) and the default language (default: `python3`).
- **Knowledge Graph** — override the technique-notes folder (defaults to `{Problems folder}/Techniques`) and toggle automatic technique backlinks on Accepted submissions.

## Troubleshooting

- `LeetCode session expired. Log in again.` — your session cookie is no longer valid. Click the `Log in` action on the Notice, or open Settings → LeetCode → `Log in`.
- `LeetCode is rate limiting us. Try again in a moment.` — LC returned HTTP 429. The plugin auto-retries once after a short backoff; if you see this twice in a row, wait a few seconds and retry manually.
- `Couldn't reach LeetCode. Check your connection.` — your machine cannot reach `leetcode.com` (offline, DNS issue, firewall). Plugin does not auto-retry network failures.
- `LeetCode is slow to respond. Try again.` — LC did not answer within 10 seconds. Judge or network latency; retry manually.
- Run/Submit buttons don't appear — buttons are rendered in Reading mode only. In Live Preview, use the command palette.

## License

Released under the [MIT License](LICENSE).

## Contributing

Issues and pull requests welcome at [github.com/moxu/obsidian-leetcode](https://github.com/moxu/obsidian-leetcode).
