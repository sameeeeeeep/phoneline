---
description: Is Phone Line set up and running on this Mac? (room, owner, runner, apps)
allowed-tools: Bash(node:*)
---

Run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" status` and summarise in two or three lines: the room and its owner, whether the runner is running, the apps set up, and anything wrong in the last log lines. If the room is not claimed yet, run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" claim` and give the link and code.
