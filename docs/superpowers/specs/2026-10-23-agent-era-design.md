# agent-era — design

Date: 2026-10-23 · Author: Caleb Brown (kayluhb), with Claude

## Intent

Developers are shipping far more since they started working with AI coding agents, and they want to see — and show — how much more. `agent-era` is a Claude Code plugin: a person types `/agent-era`, and within a couple of minutes they get a good-looking share card (PNG) of their own GitHub output before vs. after AI agents, plus a short summary in the terminal.

It came out of Caleb looking at his own history: ~40–90 PRs/month for years, then a step change in April 2026 to ~450–630/month. The point of the card is that "whoa" moment, made shareable.

## Why a plugin (decided)

A hosted web app was considered and rejected. Counting private-repo PRs through a GitHub OAuth app requires the `repo` scope, whose consent screen reads "Full control of private repositories" — unacceptable for a fun stats tool. Running locally on the person's already-authenticated `gh` CLI avoids any consent screen, includes private repos, needs no server, and no data leaves their machine except the card they choose to share.

## Goals

- One command, `/agent-era`, produces a 1200×630 PNG share card and a terminal summary.
- Includes private repos and all orgs the person's `gh` login can see.
- Fast: PR history in under a minute; whole run ideally ≤ 2–3 minutes for a heavy user (~7,500 lifetime PRs).
- Works for anyone with `gh` authenticated; installable from a public GitHub repo via Claude Code's `/plugin` flow.

## Non-goals

- No per-repo or per-org stats on the card (Caleb: "we don't need that to include repo stats"). This also keeps private repo/org names out of a public image.
- No hosted service, no OAuth app, no data storage, no telemetry.
- Not a general GitHub analytics dashboard.

## Anti-goals (failure even if it "works")

- Leaking private repo or org names into the image.
- A headline number that's wildly inflated by noise (e.g. one generated 119k-line PR).
- Silently showing a misleadingly low number when data is missing — if something couldn't be counted, say so.
- An error or empty card for someone whose output never jumped. They still get a card with an honest multiplier (e.g. 1.2×).

## The card (decided with Caleb via mockups)

Style: "before/after with the multiplier leading" (mockup option C + A's stat, variant 1).

- 1200×630 PNG (social link-preview size).
- Background: diagonal gradient, deep indigo → purple → pink (`#1b1340` → `#3a1d6e` at 55% → `#e2557a`), white text.
- Top-left label: `@<github-login> · pull requests`.
- Headline: huge multiplier, e.g. **`6.8×`**, with "more PRs per month with AI agents" beneath.
- Beside it (right-aligned, smaller): before / after PRs per month, before number dimmed (≈55% opacity), each with a small uppercase label ("before" / "after").
- Bottom: monthly PR bar chart, translucent white bars for pre-era months, solid white for agent-era months, rounded tops.
- Mockup reference: `card-style-v2.html`, option 1, in the brainstorm session.

**My call (not yet seen by Caleb):** a slim secondary row between the headline and the bars with two more before→after pairs: **commits/month** and **median lines changed per PR**. Same visual language, smaller. If it crowds the card, the builder may drop it to a second card or the terminal only — flag that back rather than cramming.

## Stats and definitions

All counts are for the authenticated `gh` user (`gh api user --jq .login`).

### PRs (headline)
- Count of PRs authored by the user, by creation month, from their first PR to now.
- **Method (tested 2026-10-23):** GraphQL `search(type: ISSUE, query: "author:<login> is:pr created:<start>..<end>") { issueCount }`, many months aliased into one query. 24 months in one request took ~5 s and cost 1 rate-limit point; counts matched REST search exactly. Whole history since 2008 ≈ 9 requests.
- Do **not** use `contributionsCollection` — it lumps private contributions into an opaque `restrictedContributionsCount` (it reported 0 PRs for a year with 747 private PRs).

### Agent-era start ("the line")
- **My call:** auto-detect the month where output jumped: the month *m* maximizing (mean PRs of m..m+2) / (mean PRs of the 12 months before m), considering only *m* from 2023-01 onward and requiring a ratio ≥ 2.
- If no month qualifies, default to **2025-02** (Claude Code's launch) and show whatever multiplier results, honestly.
- Overridable: `/agent-era --since YYYY-MM`.
- For Caleb this should detect **2026-04**.

### Multiplier
- **Before** = mean PRs/month over the 12 full months before the era start.
- **After** = mean PRs/month over full months from era start through last month (exclude the current partial month).
- Multiplier = after / before, one decimal place. If before is 0, show the after rate without a multiplier.
- For Caleb (data as of 2026-10-23): before ≈ 68/mo (Apr 2025–Mar 2026), after ≈ 462/mo (Apr–Sep 2026), ≈ 6.8×. (The mockup's 58 / 471 / 8.1× used a different window — the definition above wins.)

### Commits
- REST `search/commits` `total_count` for `author:<login> committer-date:<range>` (no GraphQL equivalent). Rate-limited to ~30 requests/min; pace requests and back off on secondary-rate-limit 403s.
- Only commits on repos' default branches are indexed; squash merges count once. Say "commits on default branches" wherever the number appears in text.
- **My call:** yearly totals across full history + monthly totals for the last 36 months (≈ 50 requests, ~1–2 min). Card uses commits/month before vs. after with the same windows as PRs.
- Tested: Caleb June 2025 = 61, June 2026 = 680.

### Lines changed
- From PR `additions` / `deletions` via GraphQL search nodes. Slow: one month of 628 PRs took ~45 s; full history would take ~9 min. Totals are dominated by outliers (one PR alone was +119,033).
- **My call:** report **median (additions + deletions) per merged PR**, before vs. after, from a sample of up to ~500 PRs per window spread across its months. No lifetime line totals.

## Terminal summary

After the card is written: path to the PNG; the before/after/multiplier for PRs, commits and median lines; a compact year-by-year PR (and commit) table back to the first year with activity; and any caveats that applied (e.g. secondary rate limit forced partial data, org access restricted). No repo names needed.

## Rendering

- **My call:** generate the card as standalone HTML/SVG, then render to PNG with headless Chrome/Chromium if found (`--headless --screenshot --window-size=1200,630`). If no Chrome is found, write the SVG (and HTML) and tell the user how to get a PNG.
- Fonts must be available offline or embedded; don't depend on network fonts.
- Output to the current directory as `agent-era-<login>.png` unless the user gives a path.

## Plugin shape

- Public GitHub repo `kayluhb/agent-era`, installable as a Claude Code plugin (marketplace manifest + plugin manifest), exposing one skill/command `/agent-era`.
- The skill instructs Claude to run a bundled script and relay results; the heavy lifting lives in the script so it's deterministic and testable.
- **My call:** script in Node (ESM, standard library only, no `npm install` step) shelling out to `gh`. Lint/format with Biome (Caleb's standard).
- Preconditions the script checks: `gh` installed and authenticated; clear message if not.

## Constraints

- No dependencies the user must install beyond `gh` (and optionally Chrome for PNG).
- Respect GitHub rate limits: GraphQL points and search secondary limits. Sequential requests with backoff on 403/429.
- Privacy: nothing written except the output files; nothing sent anywhere except GitHub's API.

## Edge cases (my calls, from the builder review)

- **Short history before the era start:** if there are fewer than 12 months of activity before the era start, average "before" from the first month with a PR, not padding with zeros (zeros would inflate the multiplier). Show a caveat when this applies.
- **Detection uses full months only:** the m..m+2 window never includes the current partial month, so a partial month can't trigger a false jump.
- **Old `--since` dates:** if the before-window predates the 36 months of monthly commit data, fetch the extra months rather than dropping the commits comparison.
- **Org access gaps:** if an org restricts the `gh` token (e.g. SSO not authorized), its counts can come back low with no error. Detect such orgs where possible and list them as a caveat in the terminal summary.
- **What passes through Claude:** the script talks only to GitHub's API, but the skill has Claude relay the summary, so aggregate counts (never repo names) pass through the Claude session. The README says so.

## Left to the builder

- Exact script/module layout, tests, and plugin manifest details.
- Bar-chart and typography details within the described style.
- How to locate Chrome across macOS/Linux/Windows.
- Sampling strategy for lines, within the stated intent.
