# Medscape research diagnosis

Tested 2026-10-17 Europe/Prague (2026-10-16 23:28 UTC) with warfarin + ibuprofen.

## Reproduction

Built the current source with `cargo build --release` and ran an isolated local server on port 3307 using a fresh SQLite database, the default gpt-6.1-sol / priority / low reasoning settings, and the normal 90-second deadline. A temporary Codex wrapper captured stdout tool events without changing arguments or input. Submitted `request.json` to `/interaction-research` and polled every two seconds.

The endpoint returned HTTP 200 after 16.05 seconds with `status: inconclusive`, `url: null` (see `response.json`). This is a completed research outcome, not an execution failure or timeout. The web event trace (`events.jsonl`) shows site-restricted searches, unrelated monograph results, and an Internal Error on attempted retrieval of the checker. An independent direct HTTP request to the checker returned 403; this establishes failure for that request, not that all clients are blocked.

## Browser comparison

Opened https://reference.medscape.com/drug-interactionchecker in Chrome. The page showed Register / Log In links; no sign-in was performed. Cleared prior locally restored selections, searched and selected warfarin, then searched and selected plain ibuprofen (not IV or a combination product). Autocomplete required typing key events; inserting text alone did not trigger suggestions.

The loaded result showed exactly one interaction under **Significant - Monitor Closely**, for **ibuprofen + warfarin**. It described pharmacodynamic synergism and advised modifying therapy / close monitoring, with an explanation concerning antiplatelet drugs increasing warfarin anticoagulation. This records Medscape's displayed content, not independent clinical validation. Screenshot: `browser-result.png`.

The address remained the generic checker URL; selecting the pair did not create a dedicated pair URL.

## Cause

1. `src/research_prompt.txt:1` authorizes only web search, and line 5 requires a retrieved dedicated pair page. It explicitly disqualifies generic interactive checkers, individual-drug articles, and results requiring browser interaction.
2. `src/codex.rs:157` disables browser use (and the next line disables computer use); the event parser rejects non-web tool activity. The worker cannot type/select medications and read the rendered checker.
3. `src/research.rs:89` rejects the generic checker path even if the model were to return it as `found`.

Thus there are both retrieval limitations (the hosted fetch fails here) and a contract mismatch (the accessible browser result is intentionally ineligible). The current result follows the implemented rules. No evidence suggests that longer timeouts or retries alone would resolve this.

## Proposed implementation direction

Support a Medscape browser adapter that selects and verifies the exact two names, waits for a completed result, and captures the rendered pair evidence. Extend the response/validation rules to permit a generic checker source URL specifically when accompanied by verified pair selections and result evidence; keep dedicated-page validation for the existing web-search path. Do not simply remove the URL rejection: the generic URL alone does not prove which pair was evaluated, and static checker markup can contain empty result templates.

No production behavior was changed in this investigation.
