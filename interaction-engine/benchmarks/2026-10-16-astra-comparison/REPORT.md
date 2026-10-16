# Astra benchmark follow-up — 2026-10-16

Astra covered the full checklist in all six runs, but Sol Fast remains faster on this sample.

| Model | Requested mode | Median | Min–max | Expected pairs | Checked effects |
| --- | --- | ---: | ---: | ---: | ---: |
| gpt-6-astra | Standard | 38.1 s | 37.0–38.9 s | 5/5 each run | 6/6 each run |
| gpt-6-astra | Fast | 27.2 s | 27.0–28.5 s | 5/5 each run | 6/6 each run |
| gpt-6.1-sol | Standard (earlier batch) | 33.7 s | 33.3–37.1 s | 5/5 each run | 6/6 each run |
| gpt-6.1-sol | Fast (earlier batch) | 20.7 s | 19.4–21.2 s | 5/5 each run | 6/6 each run |

Three real HTTP requests per model/mode, same four-drug request, low reasoning, ephemeral Codex, no model tools or search. Same binary, prompt and schema as the [earlier benchmark](../2026-10-16-model-comparison/REPORT.md), verified by SHA-256. Requests ran sequentially with order randomized within each repetition. Timing includes Codex startup, inference, parsing and enrichment, excluding Rust server startup. No warm-up; shared caches and separate batch timing can affect comparisons.

Astra Fast reduced its own median latency by 28.6%, but its median was 31.5% higher than the earlier Sol Fast median. No additional checklist coverage was observed. All six responses returned HTTP 200, Czech prose and the five expected pairs without additional pairs. The assistant read every response against the [source-backed checklist](../REFERENCE.md); this is not clinician validation. Mechanisms and conditional recommendations covered all six checked effects. Some recommendations mention a third drug elsewhere in the regimen; two Standard responses use “normal INR” where “therapeutic INR” is more precise. Severity for aspirin–ibuprofen varied between moderate and major; severity was not scored against an authoritative scale.

Fast means requested priority service; the CLI does not confirm the actual served tier. One fixed sample with three repetitions per configuration does not establish clinical safety or general performance.

Artifacts: [timings](timings.csv), [runs](runs.json), [summary](summary.json), [OpenAPI validation](schema-validation.json), [manual review](manual-review.json), [clinical text](clinical-text-for-review.md), [metadata](metadata.json). Individual `*.response.json` files contain the actual API outputs.

Reproduce with `python3 scripts/benchmark.py --output benchmarks/<new-name> --models gpt-6-astra`, then run the review and validation commands from the README.
