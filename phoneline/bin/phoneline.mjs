#!/usr/bin/env node
// phoneline.mjs: set up Phone Line on this Mac in one go, so web pages can run on your own Claude.
//
//   node phoneline.mjs setup        make your room (or reuse it), start the runner as a login service, open the claim page
//   node phoneline.mjs claim        show the claim link again (until the room has an owner)
//   node phoneline.mjs status       room, owner, runner, apps, last log lines
//   node phoneline.mjs apps [allow <app> --origin <site> [--tool t] [--act t] [--approve-jobs] [--auto] | deny <app>]
//   node phoneline.mjs uninstall [--forget]
//
// What setup does:
//   1. Copies the runner (runner.mjs, no dependencies) and its read-only tool list into ~/.phoneline.
//   2. Asks the relay for a new room (POST /start). The room comes with this Mac's runner already in it, approved as a
//      runner, and a claim link. Nothing else can join until the room has an owner: you.
//   3. Starts the runner as a macOS login service (launchd: it starts at login and restarts if it stops).
//   4. Opens the claim link in your browser. It shows a 6-digit code; claim the room only if your terminal shows the
//      same one. Then add the room to your phone (the claim page says how) for notifications and taps on the go.
//
// Env: PHONELINE_RELAY (default https://phoneline.dev), PHONELINE_HOME (default ~/.phoneline), PHONELINE_NO_OPEN=1.
// Flags for setup: --no-service (don't install the login service; run `node ~/.phoneline/runner.mjs kit` yourself),
// --no-open, --wait <seconds> (how long to wait for the claim, default 120), --name "<runner name>".
import { spawnSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, chmodSync, readdirSync } from 'node:fs';
import { homedir, hostname, platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RELAY = (process.env.PHONELINE_RELAY || 'https://phoneline.dev').replace(/\/+$/, '');
const DIR = process.env.PHONELINE_HOME || join(homedir(), '.phoneline');
const RUNNER = join(DIR, 'runner.mjs');
const PAIRING = join(DIR, 'kit-pairing.json');
// line.sameep.ai is retired for phoneline.dev (the same relay, rooms and tokens): a Mac set up with it moves on its own
const OLD_RELAYS = ['https://line.sameep.ai', 'https://cos-relay.sameep-fd6.workers.dev'];
function readPair() {
  const p = read(PAIRING);
  if (p && OLD_RELAYS.includes(String(p.relay).replace(/\/+$/, '')) && RELAY === 'https://phoneline.dev') { p.relay = RELAY; try { writeFileSync(PAIRING, JSON.stringify(p), { mode: 0o600 }); } catch { /* read-only: still use the new address */ } }
  return p;
}
const CLAIM = join(DIR, 'claim.json');
const LOG = join(DIR, 'runner.log');
const LABEL = 'ai.sameep.phoneline';
const PLIST = join(homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const say = (s = '') => process.stdout.write(s + '\n');
const fail = (s) => { say(`✗ ${s}`); process.exit(1); };
const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function relayOk(u) {
  try { const x = new URL(u); return x.protocol === 'https:' || (['localhost', '127.0.0.1'].includes(x.hostname) && x.protocol === 'http:'); } catch { return false; }
}
function findClaude() {
  const tries = [process.env.COCO_CLAUDE_BIN, join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  try { tries.push(execSync('command -v claude', { encoding: 'utf8', shell: '/bin/zsh', stdio: ['ignore', 'pipe', 'ignore'] }).trim()); } catch { /* not on PATH */ }
  return tries.find((p) => p && existsSync(p));
}
async function api(path, { method = 'GET', token, json } = {}) {
  const r = await fetch(RELAY + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(json ? { 'content-type': 'application/json' } : {}) }, body: json ? JSON.stringify(json) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const service = () => platform() === 'darwin' && !argv.includes('--no-service') && !process.env.PHONELINE_NO_SERVICE;

// the launchd login service: the runner in kit mode, with its home in DIR, restarted if it stops
export function plist({ node, runner, dir, claude, log }) {
  const path = [dirname(node), dirname(claude), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  const x = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${x(node)}</string><string>${x(runner)}</string><string>kit</string></array>
  <key>WorkingDirectory</key><string>${x(dir)}</string>
  <key>EnvironmentVariables</key><dict>
    <key>PATH</key><string>${x(path)}</string>
    <key>COCO_RUNNER_HOME</key><string>${x(dir)}</string>
    <key>COCO_CLAUDE_BIN</key><string>${x(claude)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${x(log)}</string>
  <key>StandardErrorPath</key><string>${x(log)}</string>
</dict></plist>
`;
}
function startService(claude) {
  mkdirSync(dirname(PLIST), { recursive: true });
  writeFileSync(PLIST, plist({ node: process.execPath, runner: RUNNER, dir: DIR, claude, log: LOG }));
  const uid = process.getuid();
  spawnSync('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { stdio: 'ignore' });
  const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, PLIST], { encoding: 'utf8' });
  if (r.status !== 0) fail(`couldn't start the runner service: ${r.stderr}`);
}
async function waitServing(secs = 45) {
  for (let i = 0; i < secs; i++) {
    try { if (readFileSync(LOG, 'utf8').split('\n').slice(-30).some((l) => l.includes('serving web pages'))) return true; } catch { /* no log yet */ }
    await sleep(1000);
  }
  return false;
}
async function owner(pair) {
  const m = await api(`/r/${pair.room}/members`, { token: pair.token }).catch(() => ({ status: 0 }));
  if (m.status === 401) return { revoked: true };
  return { owner: (m.data?.members || []).find((x) => x.role === 'owner' && x.status === 'active') || null };
}
function showClaim(c) {
  say('');
  say(`  Open this link and claim your room:  ${c.url}`);
  say('');
  say(`  The page shows a code. Claim the room only if it is:   ${c.code}`);
  say(`  (the link works until ${new Date(c.expires).toLocaleTimeString()})`);
}
function askNotch() {
  try { return readdirSync(join(homedir(), '.claude/plugins/cache/ask-notch/ask-notch')).length > 0; } catch { return false; }
}

async function setup() {
  if (Number(process.versions.node.split('.')[0]) < 18) fail(`Node ${process.versions.node} is too old; Phone Line needs Node 18+.`);
  if (!relayOk(RELAY)) fail(`PHONELINE_RELAY must be https (or http://localhost): ${RELAY}`);
  const claude = findClaude();
  if (!claude) fail('Claude Code is not installed on this Mac (no `claude` found). Install it and sign in first.');
  mkdirSync(DIR, { recursive: true, mode: 0o700 });
  for (const f of ['runner.mjs', 'read-only-tools.json']) copyFileSync(join(HERE, f), join(DIR, f));
  let pair = readPair();
  if (pair && pair.relay !== RELAY) fail(`this Mac is set up with ${pair.relay}; run uninstall --forget first to switch to ${RELAY}`);
  if (pair) {
    const o = await owner(pair);
    if (o.revoked) fail('this Mac\'s runner was removed from its room. Run: uninstall --forget, then setup again.');
    say(`✓ Your room ${pair.room} is already set up on this Mac${o.owner ? `, owned by ${o.owner.name}` : ' (not claimed yet)'}`);
  } else {
    const r = await api('/start', { method: 'POST', json: { name: opt('name') || `Claude Code on ${hostname().replace(/\.local$/, '')}` } });
    if (r.status !== 201) fail(r.data?.message || `the relay did not make a room (${r.status})`);
    pair = { relay: RELAY, room: r.data.room, token: r.data.runner_token, me: r.data.runner?.id || null };
    writeFileSync(PAIRING, JSON.stringify(pair), { mode: 0o600 }); chmodSync(PAIRING, 0o600);
    // the claim link on the relay this Mac called, whatever host the reply names (only its path and #secret are used)
    const cu = new URL(r.data.claim_url);
    writeFileSync(CLAIM, JSON.stringify({ url: `${RELAY}${cu.pathname}${cu.hash}`, code: r.data.claim_code, expires: Date.now() + r.data.expires_in_s * 1000 }), { mode: 0o600 }); chmodSync(CLAIM, 0o600);
    say(`✓ Made your room: ${pair.room}`);
  }
  if (service()) {
    writeFileSync(LOG, '');
    startService(claude);
    say((await waitServing()) ? '✓ The runner is up: web pages can use your Claude once you approve them' : '! The runner started but is not serving yet; check: phoneline status');
  } else say(`! No login service on this machine. Keep the runner running yourself:\n    COCO_RUNNER_HOME=${DIR} node ${RUNNER} kit`);
  const o = await owner(pair);
  const c = read(CLAIM);
  if (!o.owner && c && c.expires > Date.now()) {
    showClaim(c);
    if (platform() === 'darwin' && !argv.includes('--no-open') && !process.env.PHONELINE_NO_OPEN) spawnSync('open', [c.url]);
    const until = Date.now() + Math.max(0, Number(opt('wait') ?? 120)) * 1000;
    let got = null;
    while (Date.now() < until && !got) { await sleep(2000); got = (await owner(pair)).owner; }
    say('');
    say(got ? `✓ Claimed by ${got.name}. It's your room now.` : '… Not claimed yet. Open the link above when you are ready (phoneline claim shows it again).');
  } else if (!o.owner) say('! The claim link expired before anyone claimed the room. Run: uninstall --forget, then setup again.');
  say('');
  say(`  Your room: ${RELAY}/r/${pair.room}  (add it to your phone's Home Screen for notifications)`);
  say(`  A web page uses it with: new PhoneLine({ room: "${pair.room}" })`);
  say(askNotch() ? '  Ask Notch is installed: confirmations also show on your notch.' : '  Optional: install the Ask Notch plugin so confirmations also show on your notch.');
}

async function claim() {
  const pair = readPair(); if (!pair) fail('no room on this Mac yet. Run: setup');
  const o = await owner(pair);
  if (o.owner) return say(`✓ ${pair.room} is already claimed by ${o.owner.name}.`);
  const c = read(CLAIM);
  if (!c || c.expires <= Date.now()) fail('the claim link expired. Run: uninstall --forget, then setup again.');
  showClaim(c);
}

async function status() {
  const pair = readPair();
  if (!pair) return say('No Phone Line room on this Mac. Run: setup');
  const o = await owner(pair);
  say(`Room: ${pair.room} on ${pair.relay}${o.revoked ? ' (this runner was removed from it)' : o.owner ? `, owned by ${o.owner.name}` : ', not claimed yet (phoneline claim)'}`);
  if (platform() === 'darwin') {
    const r = spawnSync('launchctl', ['print', `gui/${process.getuid()}/${LABEL}`], { encoding: 'utf8' });
    say(r.status === 0 ? `Runner: ${/state = running/.test(r.stdout) ? 'running' : 'loaded, not running'} (login service)` : 'Runner: no login service');
  }
  const apps = read(join(DIR, 'kit-apps.json'))?.apps || {};
  say(`Apps set up: ${Object.keys(apps).join(', ') || 'none (an app you have not set up runs on the model only)'}`);
  try { say('Last log lines:\n' + readFileSync(LOG, 'utf8').trim().split('\n').slice(-5).join('\n')); } catch { /* no log */ }
}

function apps() {
  if (!existsSync(RUNNER)) fail('not set up yet. Run: setup');
  const sub = argv[0] && ['allow', 'deny'].includes(argv[0]) ? argv : ['apps'];
  const r = spawnSync(process.execPath, [RUNNER, 'kit', ...sub], { env: { ...process.env, COCO_RUNNER_HOME: DIR }, encoding: 'utf8' });
  process.stdout.write(r.stdout || ''); process.stdout.write(r.stderr || '');
  process.exitCode = r.status || 0;
}

async function uninstall() {
  if (platform() === 'darwin') { spawnSync('launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`], { stdio: 'ignore' }); rmSync(PLIST, { force: true }); }
  const pair = readPair();
  if (pair) await api(`/r/${pair.room}/serve`, { method: 'POST', token: pair.token, json: { on: false } }).catch(() => null);
  if (argv.includes('--forget')) rmSync(DIR, { recursive: true, force: true });
  say(`✓ The runner is stopped${argv.includes('--forget') ? ' and this Mac\'s room login is deleted (the room stays; its owner can remove this runner from it)' : ''}.`);
}

// dial <number> <pin> [--yes]: connect a web page that shows "Call this page: 482 913 7720 · PIN K7Q2" to this Mac's
// Claude. Without --yes it only says which page that is, for the person to OK. Uses this Mac's runner login.
async function dial() {
  const pair = readPair(); if (!pair) fail('no room on this Mac yet. Run: setup');
  const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--pin'));
  const pin = opt('pin') ?? pos.at(-1);
  const number = pos.length > 1 ? pos.slice(0, -1).join(' ') : pos[0];
  if (!number || !pin || pos.length < 2 && !opt('pin')) fail('usage: dial <number> <pin> [--yes]   e.g. dial 482 913 7720 K7Q2');
  const relay = (pair.relay || RELAY).replace(/\/+$/, '');
  const r = await fetch(`${relay}/r/${pair.room}/dial`, { method: 'POST', headers: { authorization: `Bearer ${pair.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ number, pin, connect: argv.includes('--yes') }) })
    .then(async (x) => ({ status: x.status, data: await x.json().catch(() => ({})) }), () => ({ status: 0, data: { message: `could not reach ${relay}` } }));
  if (r.status !== 200) fail(String(r.data.message || `the relay said ${r.status}`).replace(/^\w+: /, ''));
  const p = r.data.page, host = new URL(p.origin).host;
  if (!r.data.connected) {
    say(`${r.data.number} is ${p.name} at ${p.origin}${p.app ? ` (app "${p.app}")` : ''}. Its number runs out in ${Math.ceil(p.expires_in_s / 60)} min.`);
    say(`Ask: "Connect ${p.name} (${host}) to your Claude?" Then, only on a yes: dial ${number} ${pin} --yes`);
  } else say(`✓ Connected: ${p.name} (${host}) runs on your Claude now, with only the tools its app has. Anything that acts still asks you. Hang it up from your room: ${relay}/r/${pair.room}`);
}

const cmd = process.argv[2] || 'setup';
argv.shift();
const run = { setup, claim, status, apps, uninstall, dial }[cmd];
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!run) fail(`unknown command "${cmd}". Try: setup, claim, status, apps, uninstall, dial`);
  await run();
}
