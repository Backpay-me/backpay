#!/usr/bin/env node
/**
 * backpay — the open-source meter. your AI usage, measured on your terms, 50% back.
 *
 * Reads usage stats via ccusage (which parses logs your AI tools already
 * write locally), extracts ONLY the whitelist schema (docs/SCHEMA.md),
 * shows you every byte, and submits nothing without your yes.
 *
 * Zero dependencies. Read it in one coffee — that's the point.
 *
 * Commands:
 *   (none) / init      full onboarding: preview → consent → backfill → daily cron
 *   preview            print the exact payload(s), send nothing
 *   submit [--all]     POST today's (or all) payload(s) to the aggregator
 *   status             your days on record + ledger balance
 *   rank               your standing — daily/weekly/monthly + a shareable card
 *   stop               remove the cron line + delete config. leaving is one command.
 *   export <file>      write payloads to a JSON file (offline path)
 *
 * Config: ~/.config/backpay/config.json { panelist, endpoint, token }
 */

const { execFileSync, execSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const readline = require('node:readline');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');

const SCHEMA_VERSION = 0;
const DEFAULT_ENDPOINT = process.env.BACKPAY_ENDPOINT || 'https://api.backpay.me';
const CRON_TAG = '# backpay daily';

// Fixed vocabularies — anything unmatched maps to "other".
// Strings from logs are never copied into payloads.
const TOOLS = new Set([
  'claude-code', 'codex', 'gemini-cli', 'copilot-cli', 'opencode',
  'openclaw', 'amp', 'droid', 'kilo', 'kimi', 'qwen', 'goose', 'cursor',
]);
const MODEL_PATTERNS = [
  [/claude-opus-4-8/, 'claude-opus-4-8'],
  [/claude-opus-4-7/, 'claude-opus-4-7'],
  [/claude-opus-4-6/, 'claude-opus-4-6'],
  [/claude-opus/, 'claude-opus-other'],
  [/claude-sonnet-4-6/, 'claude-sonnet-4-6'],
  [/claude-sonnet/, 'claude-sonnet-other'],
  [/claude-haiku-4-5/, 'claude-haiku-4-5'],
  [/claude-haiku/, 'claude-haiku-other'],
  [/gpt-5/, 'gpt-5-family'],
  [/gpt-4/, 'gpt-4-family'],
  [/o[34]-/, 'openai-o-family'],
  [/gemini-2/, 'gemini-2-family'],
  [/gemini/, 'gemini-other'],
  [/kimi/, 'kimi-family'],
  [/qwen/, 'qwen-family'],
];

function classifyModel(raw) {
  if (typeof raw !== 'string') return 'other';
  const m = MODEL_PATTERNS.find(([re]) => re.test(raw));
  return m ? m[1] : 'other';
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

// ---------------------------------------------------------------------------
// config

const CONFIG_DIR = path.join(os.homedir(), '.config', 'backpay');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const configExists = () => fs.existsSync(CONFIG_PATH);

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    const cfg = { panelist: randomUUID(), endpoint: DEFAULT_ENDPOINT, token: randomUUID() };
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
    return cfg;
  }
}

// ---------------------------------------------------------------------------
// collection — run ccusage, extract whitelist fields only

function runCcusage() {
  const out = execFileSync('npx', ['-y', 'ccusage@latest', 'daily', '--json', '--breakdown'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 120_000,
  });
  return JSON.parse(out);
}

function extract(ccJson, panelist) {
  const days = Array.isArray(ccJson.daily) ? ccJson.daily : [];
  return days.map((d) => {
    const entries = [];
    const breakdowns = Array.isArray(d.modelBreakdowns) ? d.modelBreakdowns : [];
    if (breakdowns.length > 0) {
      for (const b of breakdowns) {
        entries.push({
          tool: 'claude-code', // ccusage daily is CC; unified multi-tool comes later
          model: classifyModel(b.modelName ?? b.model),
          input_tokens: num(b.inputTokens),
          output_tokens: num(b.outputTokens),
          cache_read_tokens: num(b.cacheReadTokens),
          cache_creation_tokens: num(b.cacheCreationTokens),
          cost_usd_est: num(b.cost ?? b.totalCost),
          sessions: 0,
        });
      }
    } else {
      entries.push({
        tool: 'claude-code',
        model: 'other',
        input_tokens: num(d.inputTokens),
        output_tokens: num(d.outputTokens),
        cache_read_tokens: num(d.cacheReadTokens),
        cache_creation_tokens: num(d.cacheCreationTokens),
        cost_usd_est: num(d.totalCost),
        sessions: 0,
      });
    }
    return { schema_version: SCHEMA_VERSION, panelist, date: String(d.date ?? d.period).slice(0, 10), entries };
  });
}

// ---------------------------------------------------------------------------
// transport

function request(method, endpoint, pathName, token, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, endpoint);
    const payload = body ? JSON.stringify(body) : null;
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data || '{}');
          res.statusCode === 200 ? resolve(json) : reject(new Error(json.error || `HTTP ${res.statusCode}`));
        } catch { reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

// ---------------------------------------------------------------------------
// cron

function cronInstalled() {
  try { return execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }).includes(CRON_TAG); }
  catch { return false; }
}

function installCron() {
  const self = path.resolve(__filename);
  const line = `23 6 * * * node ${self} submit >> ${CONFIG_DIR}/meter.log 2>&1 ${CRON_TAG}`;
  let current = '';
  try { current = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }); } catch {}
  if (current.includes(CRON_TAG)) return false;
  execSync('crontab -', { input: current + line + '\n' });
  return true;
}

function removeCron() {
  let current = '';
  try { current = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' }); } catch { return; }
  const next = current.split('\n').filter((l) => !l.includes(CRON_TAG)).join('\n');
  execSync('crontab -', { input: next.endsWith('\n') ? next : next + '\n' });
}

// ---------------------------------------------------------------------------
// standing card — earnings-first, amber/instrument voice. Renders ONLY the
// caller's own figures + the distribution shape (their percentile + panel_size).
// No other panelist's numbers exist in this payload, by construction (server-side).

const fmtTok = (n) => {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
};

// top X% from a percentile rank (share below). p=90 → top 10%.
const topPct = (p) => Math.max(0.1, Math.round((100 - p) * 10) / 10);

function windowLines(label, w) {
  const head = `${label.padEnd(9)} ${w.data_days}d · ${fmtTok(w.tokens)} tok · $${w.cost_usd_est.toFixed(2)}`;
  const tail = w.ranked
    ? `  └ contribution: top ${topPct(w.contribution_percentile)}% of ${w.panel_size}  ·  usage(${w.usage_percentile_basis}): top ${topPct(w.usage_percentile)}%`
    : `  └ ${w.reason}`;
  return [head, tail];
}

function renderCard(s) {
  const W = s.windows;
  const body = [
    `member №${s.panelist_number}`,
    '',
    ...windowLines('today', W.today),
    ...windowLines('last 7d', W.last_7d),
    ...windowLines('last 30d', W.last_30d),
    '',
    `ledger: €${s.ledger.accrued_eur.toFixed(2)} accrued · ${s.ledger.data_days_credited} data-days credited`,
    '50% of every contract, pro-rata by days. ranked on contribution, not spend.',
  ];
  const out = ['', '  ┌─ BACKPAY · YOUR STANDING ───────────────────────'];
  for (const l of body) out.push('  │  ' + l);
  out.push('  └──────────────────────────────────────────────────', '');
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// onboarding

const ask = (q) => new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  rl.question(q, (a) => { rl.close(); res(a.trim()); });
});

async function init() {
  console.error('\n  BACKPAY — the meter\n  ───────────────────');
  console.error('  Reading your local usage logs (via ccusage)…\n');
  const cfg = loadConfig();
  const payloads = extract(runCcusage(), cfg.panelist);
  if (payloads.length === 0) {
    console.error('  No usage data found locally. Run your AI tools a bit, come back.');
    return;
  }

  // the ritual: show every byte before consent
  const days = payloads.length;
  const totalCost = payloads.reduce((a, p) => a + p.entries.reduce((b, e) => b + e.cost_usd_est, 0), 0);
  console.error(`  Found ${days} day(s) — est. $${totalCost.toFixed(2)} of compute on record.\n`);
  if (days < 28) {
    console.error('  ⓘ Fewer days than you expected? Claude Code keeps only the last ~30 days of');
    console.error('    logs by default, so this is capped by retention, not your real history.');
    console.error('    • Going forward you need do nothing — the daily auto-submit banks each new');
    console.error('      day before it is pruned, so the union keeps your full history from here.');
    console.error('    • Want a bigger starting history? Raise cleanupPeriodDays in');
    console.error('      ~/.claude/settings.json (e.g. 3650). Affects future logs only.\n');
  }
  console.error('  This is EVERYTHING that would be sent (latest day shown, all days identical in shape):\n');
  console.log(JSON.stringify(payloads[payloads.length - 1], null, 2));
  console.error('\n  Counters and fixed-vocabulary names only. No prompts, no paths, no repo names —');
  console.error('  the schema has no field for them. Full contract: docs/SCHEMA.md\n');

  const yn = await ask(`  Join the union and submit these ${days} day(s)? [y/N] `);
  if (yn.toLowerCase() !== 'y') { console.error('  Nothing sent. The preview is always free.'); return; }

  let lastResp = null;
  for (const p of payloads) lastResp = await request('POST', cfg.endpoint, '/v0/submit', cfg.token, p);
  const n = lastResp?.panelist_number;
  console.error(`\n  ✓ submitted. You are member №${n ?? '?'}. The meter is on.`);

  if (process.platform === 'win32') {
    console.error('  Daily auto-submit is macOS/Linux for now (no cron on Windows).');
    console.error('  Run `npx backpay submit` manually, or wire it via Task Scheduler.');
  } else {
    const cronYn = await ask('  Install the daily cron (one tick a day, runs ~1s, no daemon)? [Y/n] ');
    if (cronYn.toLowerCase() !== 'n') {
      installCron() ? console.error('  ✓ cron installed (06:23 daily).') : console.error('  cron already present.');
    } else {
      console.error('  Skipped. Run `submit` manually whenever — days only count when submitted.');
    }
  }
  console.error('\n  Your balance: 50% of every contract, pro-rata by days contributed.');
  console.error('  Check anytime: `status`. Leave anytime: `stop` (one command, everything local removed).\n');
}

// ---------------------------------------------------------------------------
// main

async function main() {
  const [cmdRaw, arg] = process.argv.slice(2);
  const cmd = cmdRaw ?? (configExists() ? 'status' : 'init');

  if (cmd === 'init') return init();

  const cfg = loadConfig();

  if (cmd === 'preview') {
    const payloads = extract(runCcusage(), cfg.panelist);
    console.log(JSON.stringify(payloads, null, 2));
    console.error(`\n^ this is EVERYTHING that would be sent (${payloads.length} day(s)). Nothing else is read.`);
    return;
  }

  if (cmd === 'export') {
    if (!arg) { console.error('export needs a filename'); process.exit(1); }
    const payloads = extract(runCcusage(), cfg.panelist);
    fs.writeFileSync(arg, JSON.stringify(payloads, null, 2));
    console.error(`wrote ${payloads.length} day(s) to ${arg}`);
    return;
  }

  if (cmd === 'submit') {
    const payloads = extract(runCcusage(), cfg.panelist);
    if (payloads.length === 0) { console.error('no usage data found locally.'); return; }
    const toSend = arg === '--all' ? payloads : payloads.slice(-1);
    for (const p of toSend) {
      const r = await request('POST', cfg.endpoint, '/v0/submit', cfg.token, p);
      console.error(`submitted ${p.date} (${p.entries.length} entries, member №${r.panelist_number ?? '?'})`);
    }
    return;
  }

  if (cmd === 'status') {
    const me = await request('GET', cfg.endpoint, '/v0/me', cfg.token);
    console.error(`member №${me.panelist_number ?? '?'} · ${me.days} day(s) on record`);
    console.error(`ledger: €${me.ledger.accrued_eur.toFixed(2)} accrued · ${me.ledger.data_days_credited} data-days credited`);
    return;
  }

  if (cmd === 'rank') {
    const s = await request('GET', cfg.endpoint, '/v0/standing', cfg.token);
    console.log(renderCard(s)); // stdout: the shareable card (own figures only)
    console.error('  ^ your card — own figures + your percentile only. screenshot/paste it; no token, no link.');
    return;
  }

  if (cmd === 'stop') {
    removeCron();
    try { fs.rmSync(CONFIG_DIR, { recursive: true }); } catch {}
    console.error('meter off. cron removed, local config deleted. (server-side deletion: email, until the API grows a self-serve delete — it will.)');
    return;
  }

  console.error('usage: init | preview | submit [--all] | status | rank | stop | export <file>');
  process.exit(1);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
