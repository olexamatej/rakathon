#!/usr/bin/env python3
"""Extract HemOncKB Solid Tumors regimens from the local Dataverse ZIP."""

import csv
import hashlib
import io
import json
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/dataverse_files.zip"
OUTPUT = ROOT / "data/solid-tumors-regimens.json"
SECTIONS = {
    "Breast Oncology", "Dermatologic Oncology", "Endocrine Oncology",
    "GI Oncology", "Genitorurinary Oncology", "Gynecologic Oncology",
    "Head & Neck Oncology", "Mesothelioma", "Neuro-Oncology", "Sarcoma",
    "Thoracic Oncology",
}
# These two diseases are explicitly cross-listed under Solid Tumors on HemOnc.org.
CROSS_LISTED = {"575", "576"}  # CNS leukemia; CNS lymphoma
USES = {"Is current in adult": "current", "Is historical in adult": "historical"}
COMPONENT_RELATIONSHIPS = {
    "Has AB-drug cjgt", "Has allograft suppressor", "Has anticoag tx",
    "Has antineoplastic", "Has cytotoxic chemo", "Has endocrine tx",
    "Has growth factor", "Has immunosuppressor", "Has immunotherapy",
    "Has local therapy", "Has pept-drug cjgt", "Has radioconjugate",
    "Has radiotherapy", "Has restorative tx", "Has steroid tx",
    "Has supportive med", "Has targeted therapy", "May require",
}


def rows(archive, filename):
    with archive.open(filename) as stream:
        reader = csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))
        for row in reader:
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Malformed CSV: {filename}, line {reader.line_num}")
            yield row


def extract(source):
    with zipfile.ZipFile(source) as archive:
        filenames = {}
        for table in ("concept_stage", "concept_relationship_stage", "concept_synonym_stage"):
            matches = [name for name in archive.namelist() if name.endswith(f"_{table}.csv")]
            if len(matches) != 1:
                raise ValueError(f"Expected exactly one {table} CSV")
            filenames[table] = matches[0]
        snapshot = filenames["concept_stage"][:10]

        def active(row):
            return (not row["invalid_reason"]
                    and row["valid_start_date"] <= snapshot <= row["valid_end_date"])

        concepts = {r["concept_code"]: r for r in rows(archive, filenames["concept_stage"])
                    if r["vocabulary_id"] == "HemOnc" and active(r)}
        extra_names = [n for n in archive.namelist() if n.endswith("_HemOncKB additional tables.zip")]
        if len(extra_names) != 1:
            raise ValueError("Expected exactly one additional-tables ZIP")
        with zipfile.ZipFile(io.BytesIO(archive.read(extra_names[0]))) as extra:
            conditions = {
                r["condition_cui"]: r for r in rows(extra, "Tables/conditions.csv")
                if r["section"] in SECTIONS or r["condition_cui"] in CROSS_LISTED
                or (r["section"] == "Disease-agnostic" and r["condition_type"] == "Other solid neoplasm")
            }
            drug_ids = {r["drug_CUI"] for r in rows(extra, "Tables/drugs.csv")}

        uses, components = defaultdict(set), defaultdict(set)
        for row in rows(archive, filenames["concept_relationship_stage"]):
            if not active(row) or row["vocabulary_id_1"] != "HemOnc" or row["vocabulary_id_2"] != "HemOnc":
                continue
            first, second, relationship = row["concept_code_1"], row["concept_code_2"], row["relationship_id"]
            if first not in concepts or second not in concepts:
                continue
            if second in conditions and relationship in USES:
                uses[first].add((second, USES[relationship]))
            if relationship in COMPONENT_RELATIONSHIPS:
                components[first].add((second, relationship))

        synonyms = defaultdict(set)
        for row in rows(archive, filenames["concept_synonym_stage"]):
            if row["synonym_vocabulary_id"] == "HemOnc" and active(row):
                synonyms[row["synonym_concept_code"]].add(row["synonym_name"])

    result = []
    for identifier in sorted(uses, key=lambda key: (concepts[key]["concept_name"].casefold(), key)):
        concept = concepts[identifier]
        if concept["concept_class_id"] not in {"Regimen", "Synthetic Regimen", "Procedure"}:
            raise ValueError(f"Unexpected regimen class: {concept['concept_class_id']}")
        groups = {key: set() for key in ("drugs", "supportive_drugs", "drug_classes", "supportive_drug_classes")}
        other = []
        for code, relationship in sorted(components[identifier]):
            component = concepts[code]
            if relationship == "May require":
                group = None  # Conditional procedures are not regimen ingredients.
            elif code in drug_ids:
                group = "supportive_drugs" if relationship == "Has supportive med" else "drugs"
            elif component["concept_class_id"] == "Component Class":
                group = "supportive_drug_classes" if relationship == "Has supportive med" else "drug_classes"
            else:
                group = None
            if group:
                groups[group].add(component["concept_name"])
            else:
                other.append({"id": code, "name": component["concept_name"], "relationship": relationship})
        result.append({
            "id": identifier,
            "name": concept["concept_name"],
            "type": concept["concept_class_id"],
            "synonyms": sorted(synonyms[identifier] - {concept["concept_name"]}),
            **{key: sorted(values, key=str.casefold) for key, values in groups.items()},
            "other_components": sorted(other, key=lambda value: (value["name"].casefold(), value["relationship"])),
            "conditions": [
                {"id": code, "name": conditions[code]["condition"], "status": status}
                for code, status in sorted(uses[identifier], key=lambda value: (conditions[value[0]]["condition"].casefold(), value[1]))
            ],
        })

    # Check recognizable regimens and prevent related/comparator treatments leaking into ingredients.
    by_id = {r["id"]: r for r in result}
    assert len(by_id) == len(result) and result
    assert by_id["11702"]["drugs"] == ["Gemcitabine", "Oxaliplatin"]
    assert by_id["11702"]["supportive_drugs"] == ["Dexamethasone"]
    assert by_id["13829"]["drugs"] == ["Fluorouracil", "Leucovorin", "Oxaliplatin"]
    assert by_id["14680"]["drugs"] == ["Fluorouracil", "Irinotecan", "Leucovorin", "Oxaliplatin"]
    assert by_id["25325"]["drugs"] == ["Bevacizumab", "Carboplatin", "Paclitaxel nanoparticle albumin-bound"]
    assert by_id["33831"]["drugs"] == [] and by_id["33831"]["drug_classes"] == ["Androgen-deprivation therapy"]
    assert all(item["conditions"] for item in result)
    assert all(condition["id"] in conditions for item in result for condition in item["conditions"])

    return {
        "source": {
            "archive": "data/dataverse_files.zip",
            "sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "snapshot_date": snapshot,
            "concept_tables": filenames,
            "additional_tables_archive": extra_names[0],
            "additional_tables": ["Tables/conditions.csv", "Tables/drugs.csv"],
        },
        "scope": {
            "section": "Solid Tumors",
            "section_reference": "https://hemonc.org/w/index.php?title=Main_Page&oldid=168066#Solid_Tumors",
            "condition_sections": sorted(SECTIONS),
            "disease_agnostic_condition_type": "Other solid neoplasm",
            "cross_listed_condition_ids": sorted(CROSS_LISTED),
            "use_statuses": sorted(USES.values()),
            "notes": [
                "Only active concepts and relationships at the archive snapshot date are used.",
                "Pediatric-only indications and other HemOnc sections are excluded. CNS leukemia and CNS lymphoma are included because the Solid Tumors index cross-lists them.",
                "Synthetic Regimen identifies source-inferred therapeutic-equivalence variants, not independently curated regimens.",
                "Regimen Stub, Regimen Class and dosing-level Regimen Variant concepts are excluded; stubs have incomplete details and no adult indication relationships.",
                "drugs contains named ingredients from the drugs table; supportive_drugs is separate. Class-only components are not expanded into guessed ingredients.",
                "other_components preserves radiotherapy, devices, procedures, conditional procedures and components absent from the drugs table, with the source relationship.",
                "Lists are unions across source regimen variants; ingredients and supportive drugs need not occur together in every variant. No dosing or schedules are extracted.",
                "Empty ingredient lists may indicate observation/no treatment, a class-based regimen, or missing source composition; they do not prove an absence of drugs.",
            ],
        },
        "counts": {
            "total": len(result),
            "by_type": dict(sorted(Counter(r["type"] for r in result).items())),
            "distinct_drugs": len({drug for r in result for drug in r["drugs"]}),
            "distinct_supportive_drugs": len({drug for r in result for drug in r["supportive_drugs"]}),
            "without_named_drugs": sum(not r["drugs"] for r in result),
        },
        "regimens": result,
    }


if __name__ == "__main__":
    dataset = extract(SOURCE)
    OUTPUT.write_text(json.dumps(dataset, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dataset["counts"], ensure_ascii=False))
    print(OUTPUT.relative_to(ROOT))
