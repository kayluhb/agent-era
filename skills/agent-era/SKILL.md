---
name: agent-era
description: Generate a before/after-AI-agents share card of the user's GitHub PRs, commits, merges, reviews and agent co-authorship (Claude, Cursor), from their authenticated gh CLI. Use when the user runs /agent-era or asks how much more they ship with AI agents.
---

# agent-era

Make a 1200×630 share card that compares the user's GitHub output before and after they started working with AI agents.

1. Run the script with a timeout of at least 10 minutes. Pass through any `--since YYYY-MM`, `--out <path>`, `--no-commits`, `--no-lines`, `--theme default` or `--chart-from YYYY-MM` the user gave. A bare year like "2016" usually means `--chart-from 2016-01`, so confirm if unsure:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/agent-era.js"
   ```

   It prints progress to stderr and the summary to stdout. A heavy GitHub user takes about 3–4 minutes, and an early `--chart-from` adds about 2 seconds per extra month.

2. Tell the user the headline (for example "6.8× more PRs per month"), the before → after numbers, the detected agent-era month, and where the card was written. The summary's `On the card:` line names the tiles the script picked for the card; say why each one stands out. Then pick one or two fun facts the tiles don't show, like their share of PRs opened between 6pm and 6am, or how many repos and languages their merged PRs touched. Mention any caveats the summary lists.

3. If you can display images, read the PNG and show it.

4. Never add repo names to what you report. The card and summary contain only aggregate counts.

5. If the script says the GitHub CLI is missing or logged out, give the user the exact fix it printed (install from https://cli.github.com, or run `gh auth login`).

If the detected era month looks wrong to the user, offer to rerun with `--since YYYY-MM`.

The card uses the user's terminal colors with a random accent, and the summary's `Colors:` line says which. If they want a different accent, a rerun picks a new one. If they want the standard look, rerun with `--theme default`.
