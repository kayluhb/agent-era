---
name: agent-era
description: Generate a before/after-AI-agents share card of the user's GitHub PRs, commits and lines changed, from their authenticated gh CLI. Use when the user runs /agent-era or asks how much more they ship with AI agents.
---

# agent-era

Make a 1200×630 share card that compares the user's GitHub output before and after they started working with AI agents.

1. Run the script with a timeout of at least 5 minutes. Pass through any `--since YYYY-MM`, `--out <path>`, `--no-commits` or `--no-lines` the user gave:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/agent-era.js"
   ```

   It prints progress to stderr and the summary to stdout. A heavy GitHub user takes about 2–3 minutes.

2. Tell the user the headline (for example "6.8× more PRs per month"), the before → after numbers, the detected agent-era month, and where the card was written. Mention any caveats the summary lists.

3. If you can display images, read the PNG and show it.

4. Never add repo names to what you report. The card and summary contain only aggregate counts.

5. If the script says the GitHub CLI is missing or logged out, give the user the exact fix it printed (install from https://cli.github.com, or run `gh auth login`).

If the detected era month looks wrong to the user, offer to rerun with `--since YYYY-MM`.
