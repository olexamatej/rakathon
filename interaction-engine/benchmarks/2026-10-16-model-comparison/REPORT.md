# Model latency and quality benchmark — 2026-10-16

**GPT-6.1 Sol with Fast requested gave the best observed speed/coverage tradeoff for this sample.** Its median was 20.7 seconds, with all five expected pairs and all six checked effects in every run.

Input: warfarin, ibuprofen, aspirin, fluconazole. Three real HTTP requests per configuration (18 total), run sequentially with randomized order within each repetition block. Same release server build, prompt, schema, four-drug input, `low` reasoning, no model tools or search, and deterministic post-inference links.

Timing starts immediately before the HTTP request and ends after reading its body. It includes Codex process startup, model response, parsing, validation, and link generation; it excludes the Rust server process startup. No separate warm-up was performed. Prompt/model caches were shared and may affect timing.

| Model | Requested mode | Median | Min–max | Expected pairs per run | Checked effects per run | Successful / valid |
| --- | --- | ---: | ---: | --- | --- | --- |
| `gpt-6-luna` | Standard | 7.4 s | 6.8–8.5 s | 3–4/5 | 3–4/6 | 3/3 |
| `gpt-6-luna` | Fast | 7.9 s | 7.4–9.9 s | 4/5 | 5/6 | 3/3 |
| `gpt-5.6-terra` | Standard | 44.0 s | 39.2–48.2 s | 5/5 | 6/6 | 3/3 |
| `gpt-5.6-terra` | Fast | 36.1 s | 15.3–41.5 s | 5/5 | 6/6 | 3/3 |
| `gpt-6.1-sol` | Standard | 33.7 s | 33.3–37.1 s | 5/5 | 6/6 | 3/3 |
| `gpt-6.1-sol` | Fast | 20.7 s | 19.4–21.2 s | 5/5 | 6/6 | 3/3 |

Observed median latency reduction for Fast requests: Sol 38.6%; Terra 17.9%. Luna showed no latency benefit in this small sample. Terra Fast had a wide 15.3–41.5 second range, so its speed was less consistent than Sol Fast.

## Quality review

The [independent checklist](../REFERENCE.md) has five expected pairs and six effects: three warfarin combinations, GI/bleeding risk plus antiplatelet interference for aspirin–ibuprofen, and increased ibuprofen exposure with fluconazole. Keyword indicators were used for triage, then the assistant read every response against the checklist. This was not clinician review. The sources were not provided to any benchmarked model.

- **Luna Standard:** returned the three warfarin interactions in every run. It omitted aspirin–ibuprofen entirely twice; on the third run it included GI/bleeding risk but omitted antiplatelet interference. It omitted fluconazole–ibuprofen in all three runs.
- **Luna Fast:** returned four expected pairs and five effects each time, consistently missing fluconazole–ibuprofen. The faster family was incomplete in both modes.
- **Terra Standard/Fast:** included all five expected pairs and six effects in all six runs. Its Czech was readable but occasionally awkward. Some INR wording was less precise than Sol’s; no exact dose instructions or invented source citations were present.
- **Sol Standard/Fast:** included the full checklist in all six runs. It consistently explained that bleeding risk with warfarin plus aspirin/ibuprofen can persist despite a therapeutic INR. Sol Fast did not lose checklist coverage here. Two Fast responses included contextual references to warfarin inside recommendations for another pair; that is a wording limitation if every pair entry must stand entirely alone.
- **All 18:** successful HTTP 200, OpenAPI-conformant JSON, all four names resolved, pair references valid, readable Czech explanations, empty unverified source references, and no additional pairs outside the checklist observed.
- **Severity/evidence:** all three warfarin pairs were major in all outputs. Aspirin–ibuprofen severity and evidence labels varied between models/runs; these were not scored against a single authoritative severity scale.
- **Links:** Patient.info pair links were generated for every returned pair. Terra sometimes produced parenthesized canonical synonyms outside our small Drugs.com alias map, reducing its Drugs.com prefills to 1–5 of its 5 pairs. Those entries retained explicit manual-entry fallbacks. Sol produced mapped names for all 5 pair links in every run. This is a catalog-matching limitation separate from clinical coverage.

## Recommendation and limits

Use pinned `gpt-6.1-sol` with Fast requested for the next prototype evaluation:

```sh
CODEX_MODEL=gpt-6.1-sol CODEX_SERVICE_TIER=fast cargo run --release
```

This benchmark covers one fixed four-drug case with only three repetitions per configuration. It does not establish clinical safety, general drug/brand coverage, production tail latency, or statistical significance. The unchecked aspirin–fluconazole pair is not proven safe by its absence from these responses or the checklist. Do not use Luna as the sole interaction detector on the strength of these results.

Fast was explicitly requested as `service_tier="priority"`; Standard was explicitly `"default"`. The installed CLI advertises Fast for these models, but its JSONL output does not establish the actual served tier. These are measurements of the requested configurations, not verified service-tier guarantees. No Ultrafast tier was benchmarked. See the [official Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference) and [Fast mode documentation](https://developers.openai.com/api/docs/guides/fast-mode).

## Artifacts and reproduction

- [Per-request timings and headers](runs.json)
- [CSV timings](timings.csv)
- [Summary data](summary.json)
- [OpenAPI validation results](schema-validation.json)
- [Manual review notes](manual-review.json)
- [Extracted clinical text](clinical-text-for-review.md)
- [Run metadata and order](metadata.json)
- Every `*.response.json` contains the actual API response; server logs are stored alongside them.

From the repository root:

```sh
cargo build --release
python3 scripts/benchmark.py --output benchmarks/<new-run-name>
python3 scripts/review_benchmark.py benchmarks/<new-run-name>
cargo run --example validate_benchmark -- benchmarks/<new-run-name>
```

The output directory must not already exist. Review the responses manually after mechanical checks; keyword scores alone are not a correctness judgment.
