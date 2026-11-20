---
description: See or change what each web app may do on your Claude (tools, acts that ask first, approve each job)
argument-hint: "[allow <app> --origin <site> [--folder <project>] [--tool <read tool>] [--act <tool that acts>] [--approve-jobs | --auto] | deny <app>]"
allowed-tools: Bash(node:*)
---

With no arguments, run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" apps` and summarise each app's lists in a line.

Otherwise run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" apps $ARGUMENTS` and confirm what changed in one line. Rules to explain if the user asks:
- An app you have not set up runs on the model only: no tools, no files.
- `--folder <project>` lets that one app read inside that one folder: read only, never your home folder or credentials. Other apps still read no files. `--no-folder` takes it away.
- `--tool` must be a read-only tool. A tool that sends, writes, pays or deletes goes under `--act`, and every call asks you first, with a 6-digit code that the page shows too.
- `--approve-jobs` makes every job from that app wait for your tap; `--auto` turns that off.
- `--origin` pins the app to a site.

Only change an app's lists when the user asked for that change.
