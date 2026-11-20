---
description: Stop Phone Line's runner on this Mac (add "forget" to also delete this Mac's room login)
allowed-tools: Bash(node:*)
---

If the user said "forget" (or wants everything removed), run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" uninstall --forget`; otherwise run `node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" uninstall`. Confirm in one line. Web pages stop running on their Claude until they run `/phoneline:setup` again.
