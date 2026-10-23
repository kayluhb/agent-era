# agent-era

How much more do you ship since you started working with AI coding agents? `agent-era` is a Claude Code plugin that reads your own GitHub history through the `gh` CLI you're already logged in to, and makes a share card comparing your output before and after.

![Example card: 6.8× more PRs per month with AI agents](docs/example-card.png)

It counts private repos and every org your `gh` login can see. It runs on your machine, needs no sign-up, and takes about 2–3 minutes for a heavy GitHub user.

## Install

In Claude Code:

```
/plugin marketplace add kayluhb/agent-era
/plugin install agent-era@agent-era
```

## Use

```
/agent-era
```

Claude runs the script, tells you your headline number, and writes `agent-era-<your-login>.png` to the current folder.

You can also run the script directly:

```bash
node bin/agent-era.js [--since YYYY-MM] [--out path.png] [--no-commits] [--no-lines]
```

| Flag | What it does |
| --- | --- |
| `--since YYYY-MM` | Set the month your agent era started, instead of detecting it |
| `--out PATH` | Where to write the card (default `./agent-era-<login>.png`) |
| `--no-commits` | Skip commit counts (faster) |
| `--no-lines` | Skip the lines-changed sample (faster) |

## How the numbers work

**The agent-era line.** agent-era looks for the month where your PRs jumped: the month whose next three months average at least 2× the 12 months before it (from 2023 on, full months only). If it finds no jump, it uses February 2025, when Claude Code launched. Use `--since` if it picked the wrong month.

**The multiplier.** "Before" is your average PRs per month over the 12 full months before the line. "After" is your average over the full months since. The current month is never counted, because it isn't over yet. If you had no PRs before the line, the card shows your after rate with no multiplier.

**Commits** are counted on each repo's default branch only, which is what GitHub's commit search covers. A squash-merged branch counts as one commit.

**Lines changed** is the median of additions + deletions per merged PR, from a sample of up to 500 PRs on each side of the line. It's a median, so one giant generated file or lockfile can't inflate it.

## Privacy

- The script talks only to GitHub's API, through your own `gh` login. Nothing is stored or sent anywhere else.
- The card shows your GitHub handle and aggregate counts only. It never shows repo or org names.
- When you run it through Claude Code, the summary (aggregate counts, no repo names) passes through your Claude session so Claude can tell you about it.

If one of your orgs requires SSO and hasn't authorized the GitHub CLI, its PRs won't be counted. agent-era tells you when it detects this.

## Requirements

- Node.js 22 or newer
- [GitHub CLI](https://cli.github.com), logged in (`gh auth login`)
- Google Chrome or Chromium to make the PNG. Without it, you get an SVG instead. Set `CHROME_PATH` if Chrome is somewhere unusual.

## Development

```bash
npm install   # dev tools only (Biome)
npm test
npm run check
```
