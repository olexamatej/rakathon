# External-site research: warfarin + ibuprofen

Date: 2026-10-16. One live HTTP request per supplied checker URL; no retries.
Model: gpt-6.1-sol; requested service tier: priority; low reasoning effort.
Three simultaneous requests; per-request timeout: 90 seconds. Timings include Codex startup, web research, inference, and server validation.

All seven requests returned HTTP 200. Two dedicated pages were found, four searches found no dedicated page, and one result was inconclusive.

| Site | HTTP | Outcome | Seconds | Dedicated page |
| --- | --- | --- | ---: | --- |
| drugs.com | 200 | found | 12.78 | [Pair page](https://www.drugs.com/drug-interactions/ibuprofen-with-warfarin-1310-0-2311-0.html) |
| webmd.com | 200 | not_found | 11.65 | — |
| patient.info | 200 | found | 18.82 | [Pair page](https://patient.info/medication-interactions/warfarin-and-ibuprofen-interaction) |
| rxlist.com | 200 | not_found | 11.76 | — |
| reference.medscape.com | 200 | inconclusive | 13.74 | — |
| rxlabelguard.com | 200 | not_found | 11.93 | — |
| rxcheck.dev | 200 | not_found | 10.44 | — |

## Returned Czech summaries

### drugs.com

Drugs.com označuje interakci warfarinu s ibuprofenem jako závažnou (Major): kombinace může zvýšit riziko vážného krvácení, zejména v trávicím traktu. Doporučuje konzultaci s lékařem ohledně alternativy, úpravy dávky nebo častějšího sledování INR. Při neobvyklém krvácení, tvorbě modřin či jiných známkách krvácení doporučuje okamžitou lékařskou pomoc.

### webmd.com

Vyhledávání na webmd.com nenalezlo samostatnou veřejnou stránku věnovanou přesně dvojici warfarin–ibuprofen, ani při použití obchodních názvů. Tento výsledek neznamená, že mezi léky není interakce nebo že je jejich kombinace bezpečná.

### patient.info

Stránka uvádí, že kombinace warfarinu a ibuprofenu výrazně zvyšuje riziko závažného krvácení, zejména do žaludku či střev. Doporučuje vyhnout se této kombinaci, pokud ji výslovně nenařídí lékař, a při známkách krvácení, například černé stolici nebo neustávajícím krvácení z nosu, okamžitě vyhledat lékařskou pomoc.

### rxlist.com

Při vyhledávání na rxlist.com nebyla nalezena samostatná stránka věnovaná dvojici warfarin a ibuprofen, a to ani pod odpovídajícími obchodními názvy. Tento výsledek neznamená, že mezi léky není interakce nebo že je jejich kombinace bezpečná.

### reference.medscape.com

Vyhledávání na reference.medscape.com nenalezlo samostatnou stránku věnovanou dvojici warfarin–ibuprofen. Obsah zadaného interakčního checkeru se nepodařilo načíst, takže výsledek nelze spolehlivě ověřit; nejde o potvrzení bezpečnosti kombinace.

### rxlabelguard.com

Při vyhledávání na rxlabelguard.com nebyla nalezena veřejná stránka věnovaná přímo dvojici warfarin–ibuprofen; výsledky obsahovaly pouze dokumentaci API a obecné články. To neznamená, že mezi léky není interakce ani že je jejich kombinace bezpečná.

### rxcheck.dev

Při vyhledávání na rxcheck.dev nebyla nalezena veřejně dostupná stránka věnovaná přímo dvojici warfarin–ibuprofen. Tento výsledek neznamená, že mezi léky není interakce nebo že je jejich kombinace bezpečná.

## Validation and interpretation

- All seven response bodies conform to the OpenAPI InteractionResearchResponse schema (see schema-validation.json).
- Success headers included Content-Language: cs, Cache-Control: no-store, and X-Interaction-Source: web-search.
- Both returned dedicated pair-page URLs were also opened successfully in a separate web check after the API run.
- Medscape returned inconclusive because the checker content could not be loaded reliably.
- not_found describes a search outcome, not absence of a drug interaction or proof of safety. These searches do not exercise interactive checkers through a browser.
- These are single observations, not a completeness or reliability benchmark. Medical wording is agent-reported; this run does not independently validate every clinical claim.

Raw requests, response bodies, headers, timing records, model metadata, and the research prompt are saved alongside this report.
