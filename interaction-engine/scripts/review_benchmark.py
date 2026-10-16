#!/usr/bin/env python3
"""Generate mechanical benchmark checks and text for manual review.

Keyword indicators do not establish clinical correctness or language quality.
"""
import argparse
import csv
import itertools
import json
import pathlib
import statistics
import unicodedata


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def drug_key(name):
    name = normalize(name).strip()
    return {"kyselina acetylsalicylova": "aspirin", "acetylsalicylic acid": "aspirin",
            "flukonazol": "fluconazole"}.get(name, name)


EXPECTED = {tuple(sorted(pair)) for pair in [
    ("warfarin", "ibuprofen"), ("warfarin", "aspirin"), ("warfarin", "fluconazole"),
    ("ibuprofen", "aspirin"), ("ibuprofen", "fluconazole")]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=pathlib.Path)
    args = parser.parse_args()
    directory = args.directory
    input_names = json.loads((directory / "request.json").read_text())["drugs"]
    runs = json.loads((directory / "runs.json").read_text())
    reviews, texts = [], []
    for run in runs:
        row = {key: run[key] for key in ["model", "mode", "repeat", "elapsedSeconds", "httpStatus", "responseFile"]}
        if run["httpStatus"] != 200:
            row["error"] = "HTTP failure"
            reviews.append(row)
            continue
        response = json.loads((directory / run["responseFile"]).read_text())
        row["responseBytes"] = (directory / run["responseFile"]).stat().st_size
        drugs = {drug["id"]: drug_key(drug["name"]) for drug in response["drugs"]}
        # Match pair identity through input resolutions, rather than expecting
        # one spelling of canonical names (e.g. aspirin with a Czech synonym).
        for resolution in response["resolutions"]:
            if resolution["status"] == "resolved":
                drugs[resolution["drugId"]] = drug_key(input_names[resolution["inputIndex"]])
        pair_text, severities = {}, {}
        texts.append(f"\n## {run['responseFile']} ({run['elapsedSeconds']:.2f}s)\n")
        for interaction in response["interactions"]:
            pair = tuple(sorted(drugs[drug_id] for drug_id in interaction["drugIds"]))
            severities[" + ".join(pair)] = interaction["severity"]
            pieces = []
            for finding in interaction["findings"]:
                pieces += [finding["summary"], finding.get("mechanism", ""), *finding["clinicalEffects"],
                           *(r["description"] for r in finding["recommendations"])]
                texts.append(f"### {' + '.join(pair)} / {finding['severity']} / {finding['evidence']['level']}\n")
                texts.append(json.dumps({k: finding[k] for k in ["summary", "mechanism", "clinicalEffects", "recommendations"] if k in finding}, indent=2, ensure_ascii=False))
            pair_text[pair] = normalize(" ".join(pieces))
        found = set(pair_text)
        # These are deliberately only indicators to guide the manual review.
        bleed = lambda pair: "krvac" in pair_text.get(tuple(sorted(pair)), "")
        aspirin_text = pair_text.get(tuple(sorted(["aspirin", "ibuprofen"])), "")
        exposure_text = pair_text.get(tuple(sorted(["fluconazole", "ibuprofen"])), "")
        indicators = {
            "warfarin_ibuprofen_bleeding": bleed(["warfarin", "ibuprofen"]),
            "warfarin_aspirin_bleeding": bleed(["warfarin", "aspirin"]),
            "warfarin_fluconazole_effect": any(t in pair_text.get(tuple(sorted(["warfarin", "fluconazole"])), "") for t in ["inr", "antikoagul", "krvac"]),
            "aspirin_ibuprofen_gi": "krvac" in aspirin_text or "gastro" in aspirin_text or "vred" in aspirin_text,
            "aspirin_ibuprofen_antiplatelet": any(t in aspirin_text for t in ["antiagreg", "anti-agreg", "protidestick", "kardioprotek", "kardiovaskularni ochran"]),
            "ibuprofen_fluconazole_exposure": any(t in exposure_text for t in ["koncentr", "expoz", "metabol", "cyp2c9", "odbour"]),
        }
        row.update(expectedPairsFound=len(found & EXPECTED),
            missingExpectedPairs=[list(p) for p in sorted(EXPECTED - found)],
            extraPairs=[list(p) for p in sorted(found - EXPECTED)],
            reportedPairs=len(found), status=response["status"], coverage=response["coverage"],
            drugNames=list(drugs.values()), severityByPair=severities,
            returnedDrugNames=[drug["name"] for drug in response["drugs"]],
            drugsComPrefilledPairs=sum(any(link["provider"] == "Drugs.com" and link.get("prefilled") is True for link in pair["externalLinks"]) for pair in response["interactions"]),
            patientPrefilledPairs=sum(any(link["provider"] == "Patient.info" and link.get("prefilled") is True for link in pair["externalLinks"]) for pair in response["interactions"]),
            heuristicEffectIndicators=indicators, heuristicEffectCount=sum(indicators.values()))
        reviews.append(row)
    (directory / "mechanical-review.json").write_text(json.dumps(reviews, indent=2, ensure_ascii=False) + "\n")
    (directory / "clinical-text-for-review.md").write_text("# Model output for manual review\n" + "\n".join(texts) + "\n")
    summaries = []
    for (model, mode), group in itertools.groupby(sorted(reviews, key=lambda r: (r["model"], r["mode"])), key=lambda r: (r["model"], r["mode"])):
        group = list(group)
        successes = [r for r in group if r["httpStatus"] == 200]
        times = [r["elapsedSeconds"] for r in successes]
        summary = {"model": model, "mode": mode, "runs": len(group), "successful": len(successes),
            "medianSeconds": statistics.median(times) if times else None,
            "minSeconds": min(times) if times else None, "maxSeconds": max(times) if times else None,
            "meanSeconds": statistics.mean(times) if times else None,
            "expectedPairsPerSuccessfulRun": [r["expectedPairsFound"] for r in successes],
            "heuristicEffectCounts": [r["heuristicEffectCount"] for r in successes],
            "extraPairsPerSuccessfulRun": [len(r["extraPairs"]) for r in successes]}
        summaries.append(summary)
        print(json.dumps(summary))
    (directory / "summary.json").write_text(json.dumps(summaries, indent=2) + "\n")
    with (directory / "timings.csv").open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=["model", "mode", "repeat", "elapsedSeconds", "httpStatus", "responseFile"])
        writer.writeheader()
        writer.writerows({key: row[key] for key in writer.fieldnames} for row in reviews)


if __name__ == "__main__":
    main()
