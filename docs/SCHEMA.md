# Submission schema contract — v0

The entire trust story reduces to this file. The submitter constructs payloads
**only** from the fields below. Nothing else is read into the payload object.
Schema changes require a version bump + re-consent in the client.

## Payload (one per panelist per day)

```json
{
  "schema_version": 0,
  "panelist": "<random uuid issued at signup — no email/name in payload>",
  "date": "2026-06-11",
  "entries": [
    {
      "tool": "claude-code",          // enum: see TOOLS below
      "model": "claude-opus-4-8",     // enum: known-model vocabulary; unknown → "other"
      "input_tokens": 123456,
      "output_tokens": 23456,
      "cache_read_tokens": 999999,
      "cache_creation_tokens": 88888,
      "cost_usd_est": 12.34,          // ccusage estimate, number
      "sessions": 7
    }
  ]
}
```

## What is structurally absent (not "scrubbed" — never extracted)

- file paths, project/repo names, git remotes
- prompt or response content, session titles
- hostnames, usernames, emails
- timestamps finer than day granularity

## Enums

TOOLS: the ccusage-supported set (claude-code, codex, gemini-cli, copilot-cli,
opencode, openclaw, amp, droid, kilo, kimi, qwen, goose, cursor*, other).
MODELS: maintained vocabulary file; anything unmatched maps to "other"
(prevents a weird local string ever riding along).

\* cursor = sessions/duration only in v0 (no clean local token log; see
docs/CURSOR-FEASIBILITY.md, to be written).

## Server-side publication rule

No aggregate cell (tool × model × date cut) is published or sold with n < 5
distinct panelists. Individual rows are never sold, period.
