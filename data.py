"""Local CSV validation and a conservative, explicitly defined care endpoint."""

import csv
import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

WINDOW = 365


def load_data(directory):
    directory = Path(directory)
    schema = json.loads((directory / "datapackage.json").read_text())
    tables = {}
    digest = hashlib.sha256()
    for name in ("patients", "episodes", "labs"):
        raw = (directory / f"{name}.csv").read_bytes()
        digest.update(raw)
        resource = next(r for r in schema["resources"] if r["name"] == name)
        fields = resource["schema"]["fields"]
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig"), newline=""))
        if set(reader.fieldnames or []) != {f["name"] for f in fields}:
            raise ValueError(f"{name}.csv: sloupce neodpovídají datapackage.json")
        rows, seen = [], set()
        for number, row in enumerate(reader, 2):
            if None in row or any(v is None for v in row.values()):
                raise ValueError(f"{name}.csv:{number}: nesprávný počet polí")
            for field in fields:
                key, kind = field["name"], field["type"]
                value, rules = row[key], field.get("constraints", {})
                try:
                    if value == "":
                        if rules.get("required"):
                            raise ValueError("povinná hodnota chybí")
                        row[key] = None if kind in ("integer", "number") else ""
                        continue
                    if kind in ("integer", "number"):
                        value = int(value) if kind == "integer" else float(value)
                        if not math.isfinite(value):
                            raise ValueError("neplatné číslo")
                    if "minimum" in rules and value < rules["minimum"]:
                        raise ValueError("hodnota pod minimem")
                    if "enum" in rules and value not in rules["enum"]:
                        raise ValueError("neznámá kategorie")
                    if "pattern" in rules and not re.fullmatch(rules["pattern"], value):
                        raise ValueError("neplatný formát")
                    row[key] = value
                except (ValueError, TypeError) as exc:
                    raise ValueError(f"{name}.csv:{number}, {key}: {exc}") from exc
            primary = tuple(row[k] for k in resource["schema"].get("primaryKey", []))
            if primary and primary in seen:
                raise ValueError(f"{name}.csv:{number}: duplicitní klíč")
            seen.add(primary)
            rows.append(row)
        tables[name] = rows
    patients = {p["patient_id"] for p in tables["patients"]}
    if not patients:
        raise ValueError("Prázdná kohorta")
    episodes = {e["episode_id"]: e for e in tables["episodes"]}
    for e in tables["episodes"]:
        if e["patient_id"] not in patients or not e["episode_id"].startswith(e["patient_id"] + "-E"):
            raise ValueError("episodes.csv: neplatná vazba pacienta")
        if e["day_end"] is not None and e["day_end"] < e["day_start"]:
            raise ValueError("episodes.csv: konec před začátkem")
    for lab in tables["labs"]:
        if lab["patient_id"] not in patients:
            raise ValueError("labs.csv: neplatná vazba pacienta")
        if lab["episode_id"] and (lab["episode_id"] not in episodes or
                                 episodes[lab["episode_id"]]["patient_id"] != lab["patient_id"]):
            raise ValueError("labs.csv: neplatná vazba epizody")
        if lab["ref_low"] is not None and lab["ref_high"] is not None and lab["ref_low"] > lab["ref_high"]:
            raise ValueError("labs.csv: obrácené referenční meze")
    tables["fingerprint"] = digest.hexdigest()[:16]
    return tables


def covered_days(episodes, anchor, window=WINDOW):
    """Union of half-open intervals; unknown ends never become zero-length stays."""
    intervals = sorted((max(e["day_start"], anchor), min(e["day_end"], anchor + window))
                       for e in episodes if e["day_end"] is not None
                       and e["day_end"] > e["day_start"])
    total, right = 0, anchor
    for start, end in intervals:
        total += max(0, end - max(right, start))
        right = max(right, end)
    return total


def patient_features(tables):
    by_patient, by_lab, tumors = defaultdict(list), defaultdict(list), defaultdict(list)
    for e in tables["episodes"]:
        by_patient[e["patient_id"]].append(e)
    for lab in tables["labs"]:
        by_lab[lab["patient_id"]].append(lab)
    for p in tables["patients"]:
        tumors[p["patient_id"]].append(p)
    result = []
    for patient_id, records in sorted(tumors.items()):
        p = min(records, key=lambda row: row["tumor_id"])
        episodes = sorted(by_patient[patient_id], key=lambda e: (e["day_start"], e["episode_id"]))
        matching = [e["day_start"] for e in episodes if e["dx_main"] == p["dx_icd10"]]
        anchor = min(matching) if matching else None
        followup = max((e["day_end"] if e["day_end"] is not None else e["day_start"]
                        for e in episodes), default=0) - anchor if anchor is not None else None
        reasons = []
        if len(records) > 1:
            reasons.append("Více nádorů: přiřazení péče nelze spolehlivě určit")
        if anchor is None:
            reasons.append("Chybí epizoda se shodnou nádorovou diagnózou")
        elif followup < WINDOW + 6:
            reasons.append("Chybí doložený kontakt alespoň 371 dnů po indexu")
        if anchor is not None and any(e["day_end"] is None and e["day_start"] < anchor + WINDOW
                                      for e in episodes):
            reasons.append("Chybí konec pobytu, který mohl zasáhnout sledované okno")
        selected = [e for e in episodes if anchor is not None and e["day_start"] < anchor + WINDOW
                    and (e["day_end"] if e["day_end"] is not None else e["day_start"]) >= anchor]
        stays = [e for e in selected if e["day_end"] is not None and e["day_end"] > e["day_start"]
                 and e["day_end"] > anchor]
        contacts = [e for e in selected if e["day_end"] == e["day_start"]]
        labs = [lab for lab in by_lab[patient_id] if anchor is not None and anchor <= lab["day"] < anchor + WINDOW]
        observed = covered_days(episodes, anchor) if anchor is not None else None
        flags = Counter(lab["flag"] for lab in labs)
        codes = Counter(e["dx_main"] or "neuvedeno" for e in selected)
        result.append({
            "patient_id": patient_id, "diagnosis": p["dx_icd10"], "age": p["age_group"], "sex": p["sex"],
            "tumor_count": len(records), "anchor": anchor, "followup": followup,
            "eligible": not reasons, "quality": reasons, "observed": observed,
            "sensitivity": [covered_days(episodes, anchor + shift) for shift in (-3, 3)] if anchor is not None else [],
            "stays": len(stays), "contacts": len(contacts),
            "longest_stay": max((min(e["day_end"], anchor + WINDOW) - max(e["day_start"], anchor) for e in stays), default=0),
            "d70": sum(e["dx_main"] == "D70" for e in selected),
            "ab_codes": sum(e["dx_main"].startswith(("A", "B")) for e in selected),
            "labs_count": len(labs), "labs_abnormal": flags["L"] + flags["H"],
            "labs_with_reference": sum(flags[f] for f in ("L", "N", "H")),
            "diagnosis_counts": dict(codes.most_common()),
            "timeline": [{"start": e["day_start"] - anchor,
                          "end": e["day_end"] - anchor if e["day_end"] is not None else None,
                          "diagnosis": e["dx_main"], "episode_id": e["episode_id"]} for e in selected],
            "labs": [{**lab, "day": lab["day"] - anchor} for lab in labs],
        })
    return result

