---
description: Set up Phone Line, so web pages can run on your own Claude (you approve each site, and anything that acts asks you first)
allowed-tools: Bash(node:*)
---

Run this and wait for it to finish (up to about three minutes: it waits for the person to claim their room):

```
node "${CLAUDE_PLUGIN_ROOT}/bin/phoneline.mjs" setup
```

Then tell the user, briefly:
- Whether the runner is up (the ✓ / ! lines).
- That their browser opened the claim page. It shows a 6-digit code: claim the room only if it matches the code in the output. Quote the code.
- Whether the room was claimed. If not, the link works for an hour, and `/phoneline:status` shows it again.
- To get taps and notifications on their phone: open the room link from the output in Safari, tap "Ask to join", approve it on the Mac as owner, then Share → Add to Home Screen.
- How a web page uses it: the `new PhoneLine({ room: "…" })` line from the output.
- If Ask Notch is not installed, that installing it adds the same confirmations on the notch.

If the command failed, show the ✗ line and suggest a fix. Never paste tokens.
