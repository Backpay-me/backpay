<div align="center">

# ⏚ BACKPAY

### My AI tools logged every dollar of my usage. I was paid **$0**.

**The open-source data union for AI dev tools.**
Counters never content · every byte previewed before consent · 50% of every contract back to members.

[![npm](https://img.shields.io/npm/v/backpay?color=ffb000&labelColor=0c0a07)](https://www.npmjs.com/package/backpay)
[![license](https://img.shields.io/badge/license-MIT-ffb000?labelColor=0c0a07)](LICENSE)
[![deps](https://img.shields.io/badge/dependencies-0-ffb000?labelColor=0c0a07)](#read-the-code)
[![node](https://img.shields.io/badge/node-%E2%89%A518-ffb000?labelColor=0c0a07)](package.json)

[**backpay.me**](https://backpay.me) · [the film](https://backpay.me/launch-film.html) · [privacy](https://backpay.me/privacy.html)

</div>

---

Every AI coding tool you run writes usage logs to your own disk — and most of them also ship
that telemetry home, where it gets aggregated and sold as market intelligence to investors,
competitors, and analysts. **You generate the data. You were never offered a cut.**

Backpay inverts it. You run a tiny open-source meter that reads those *local* logs, submits
day-level **counters only**, and the union sells k-anonymous aggregates — the live index of
which AI tools are actually winning. **Half of every euro flows back to members, pro-rata by
days contributed.**

## Quick start

```
npx backpay
```

That's the whole install. Here is everything it does, in order:

1. Reads your local usage logs (via [ccusage](https://github.com/ryoppippi/ccusage), the
   16k-star parser your tools' logs already feed).
2. **Prints the complete payload** — every byte that would leave your machine.
3. Asks. Nothing is sent before you type `y`. The preview is always free.
4. Submits your backfill, tells you your member number — the first 100 carry
   **permanent founding weight** in the revenue share.
5. Offers a daily cron tick (~1 second a day). **No resident daemon. Nothing runs in the
   background, ever.**

## What leaves your machine

One day's payload, in full:

```jsonc
{ "schema_version": 0,
  "panelist": "<random uuid — not your name>",
  "date": "2026-06-12",
  "entries": [ {
      "tool": "claude-code",          // fixed vocabulary
      "model": "claude-opus-4-8",     // fixed vocabulary
      "input_tokens": 18093021,
      "output_tokens": 842117,
      "cache_read_tokens": 114230998,
      "cache_creation_tokens": 1082211,
      "cost_usd_est": 23.91,
      "sessions": 4
  } ] }
```

## What can never leave your machine

| Data | Status |
|---|---|
| Prompts, completions, code | **no field exists — cannot be sent** |
| File paths, repo / project names | **no field exists — cannot be sent** |
| Your name, email, employer | **no field exists — your id is a random UUID** |
| Machine identifiers, hostnames | **no field exists** |
| Anything finer than the calendar day | **no field exists** |

Tool and model names are mapped onto a fixed enum — **strings from your logs are never
copied into payloads**. This isn't a privacy *promise*; it's the shape of the schema.
A payload that tried to carry your prompt has nowhere to put it.

## The constitution

> i. **Counters, never content.** The schema has no field for prompts, paths or names.
>
> ii. **The meter is open source.** Every byte previewed before consent. One file, zero
> dependencies, readable in one coffee.
>
> iii. **No one is ever the product alone.** No data cell covering fewer than five members
> is published or sold. Individual rows: never, at any price.
>
> iv. **The ledger is public from day zero.** Half of every euro, pro-rata by days
> contributed — or this is just another harvester with better fonts.
>
> v. **Paid in money nobody can freeze.** Default payout rail: Bitcoin Lightning.

## Commands

| Command | What it does |
|---|---|
| `npx backpay` | first run: full onboarding (preview → consent → backfill → optional cron) |
| `npx backpay preview` | print exactly what would be sent. sends nothing |
| `npx backpay submit [--all]` | submit today (or all days) |
| `npx backpay status` | your days on record + ledger balance |
| `npx backpay export <file>` | write your payloads to a JSON file |
| `npx backpay stop` | **leave.** removes the cron line + local config. one command |

## How you get paid

Buyers (vendors, VCs, funds) license k-anonymous aggregates — the usage-side index that
spend-side data like Ramp's can't see. **50% of every contract** accrues to members,
pro-rata by data-days contributed in the contract period. Your balance is visible via
`status` from day one, *before* the first contract closes — so you can verify the math
while it's still small enough to check by hand. Default payout rail: a Bitcoin Lightning
address you control.

## FAQ

**Isn't this spyware with extra steps?**
Spyware hides what it takes. The meter prints it and asks. The schema can't hold content,
the code is one file you can read, there's no daemon, and leaving is one command.

**ccusage already exists. What's new?**
ccusage is the *reader* — it shows **you** your own stats, and we build on it with credit.
Backpay is the *economics*: methodology, k-anonymous aggregation, buyers, and a ledger
that pays you. Different layer.

**Who actually buys this?**
The same people who pay for spend-side indexes today. Spend tells you who paid; usage
tells you who *stayed*. That retention layer is currently unclaimed.

**50% of zero is zero.**
Correct — today the ledger reads €0.00 and the homepage says so. The union exists before
the first contract; that's what founding weight is for.

**What about Cursor?**
No clean local usage log (token data is buried in binary blobs). CLI agents first;
Cursor lands when it can be done counters-only, or not at all.

**Why should I trust you?**
Don't. Read the file. Run `preview`. The design goal is that trust is structural, not
reputational.

## Read the code

The entire meter is [`collect.js`](collect.js) — one file, zero dependencies, standard
library only. If you can read JavaScript, you can audit your own data pipeline in one
coffee. That's not a constraint we suffer; it's the product.

## License

MIT. Member №1 is the founder, dogfooding his own meter at [backpay.me](https://backpay.me).
