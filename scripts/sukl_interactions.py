#!/usr/bin/env python3
"""Deterministic, partial SÚKL → DDInter mapping; Python standard library only."""

import argparse
import csv
import hashlib
import http.cookiejar
import itertools
import json
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".local/ddinter"
OUTPUT = ROOT / "exports/interactions"
BASE_URL = "https://ddinter2.scbdd.com"
ATC_CODES = "ABCDGHJLMNPRSV"
LEVELS = {"Major", "Moderate", "Minor", "Unknown"}
ROUTES = {
    "POR": "", "IVN": "", "IMS": "", "SDR": "",
    "DRM": "topical", "OPH": "ophthalmic", "NAS": "nasal", "AUR": "otic",
}
HYDRATES = r"(?:mono|di|tri|tetra|penta|hexa|hemi|sesqui)?hydrate"
# Only a single SÚKL parent edge with an unchanged base name is eligible.
COUNTERIONS = (
    "hydrochloride", "dihydrochloride", "hydrobromide", "besilate", "mesilate",
    "tosilate", "esilate", "fumarate", "hemifumarate", "maleate", "succinate",
    "tartrate", "hydrogen tartrate", "citrate", "sulfate", "hydrogen sulfate",
    "oxalate", "calcium", "sodium", "potassium",
)


def normalized(value):
    return " ".join(value.split()).casefold()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")
    temporary.replace(path)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def csv_rows(path, required, encoding="cp1250", delimiter=";"):
    with path.open(encoding=encoding, newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        if not required.issubset(reader.fieldnames or []):
            raise ValueError(f"Unexpected CSV header: {path}")
        for row in reader:
            if None in row or any(row[key] is None for key in required):
                raise ValueError(f"Invalid CSV row in {path}, line {reader.line_num}")
            yield row


def pair_key(first, second):
    return "|".join(sorted((first, second)))


def load_ddinter(directory):
    drugs, interactions = {}, {}
    columns = {"DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"}
    for code in ATC_CODES:
        for row in csv_rows(directory / f"{code}.csv", columns, "utf-8-sig", ","):
            for suffix in "AB":
                identifier, name = row[f"DDInterID_{suffix}"], row[f"Drug_{suffix}"]
                if not re.fullmatch(r"DDInter\d+", identifier) or not name.strip():
                    raise ValueError("Invalid DDInter drug identifier/name")
                if identifier in drugs and drugs[identifier] != name:
                    raise ValueError(f"Conflicting DDInter names: {identifier}")
                drugs[identifier] = name
            key = pair_key(row["DDInterID_A"], row["DDInterID_B"])
            level = row["Level"]
            if level not in LEVELS or (key in interactions and interactions[key] != level):
                raise ValueError(f"Invalid/conflicting DDInter severity: {key}")
            interactions[key] = level
    if not interactions:
        raise ValueError("Empty DDInter export")
    return drugs, interactions


def salt_name_matches(name, parent):
    suffix = normalized(name).removeprefix(normalized(parent) + " ")
    if suffix == normalized(name):
        return False
    return bool(re.fullmatch(
        rf"(?:(?:{'|'.join(COUNTERIONS)})(?: {HYDRATES})?|{HYDRATES})", suffix
    ))


class Mapper:
    def __init__(self, substances, parents, drugs, aliases, cas):
        self.substances, self.parents = substances, parents
        self.aliases = aliases
        self.names = defaultdict(set)
        self.special_forms = set()
        self.bases = set()
        for identifier, name in drugs.items():
            name = normalized(name)
            self.names[name].add(identifier)
            match = re.fullmatch(r"(.+) \(([^()]*)\)", name)
            base, qualifier = match.groups() if match else (name, "")
            self.bases.add(base)
            if qualifier and qualifier not in ROUTES.values():
                self.special_forms.add(base)
        for code, alias in aliases.items():
            if (code not in substances or substances[code]["NAZEV_EN"] != alias["sourceName"]
                    or drugs.get(alias["targetId"]) != alias["targetName"] or not alias.get("source")):
                raise ValueError(f"Stale/invalid substance alias: {code}")
            if "cas" in alias and alias["cas"] not in cas.get(code, set()):
                raise ValueError(f"CAS mismatch for alias: {code}")
            if "parentCode" in alias and parents.get(code) != alias["parentCode"]:
                raise ValueError(f"Parent mismatch for alias: {code}")

    def match(self, code, route):
        name = self.substances[code]["NAZEV_EN"]
        base, method = normalized(name), "exact_name"
        if base not in self.bases:
            if code in self.aliases:
                base, method = normalized(self.aliases[code]["targetName"]), "explicit_alias"
            elif code in self.parents:
                parent = normalized(self.substances[self.parents[code]]["NAZEV_EN"])
                if parent in self.bases and salt_name_matches(name, parent):
                    base, method = parent, "salt_name_and_parent"
                else:
                    return {"reason": "no_exact_identity"}
            else:
                return {"reason": "no_exact_identity"}
        route_codes = route.split("/")
        if any(code not in ROUTES for code in route_codes):
            return {"reason": "unsupported_route"}
        identifiers = set()
        for route_code in route_codes:
            qualifier = ROUTES[route_code]
            if not qualifier and base in self.special_forms:
                return {"reason": "formulation_requires_review"}
            target = f"{base} ({qualifier})" if qualifier else base
            candidates = self.names.get(target, set())
            if len(candidates) != 1:
                return {"reason": "missing_or_ambiguous_route_entity"}
            identifiers.update(candidates)
        if len(identifiers) != 1:
            return {"reason": "ambiguous_route"}
        return {"ddinterId": next(iter(identifiers)), "method": method}


def build_dataset(sukl_directory, ddinter_directory, alias_path):
    dlp = sukl_directory / "dlp"
    inputs = [sukl_directory / "metadata.json", alias_path, Path(__file__)]

    def table(filename, columns):
        path = dlp / filename
        inputs.append(path)
        return list(csv_rows(path, set(columns)))

    substances = {row["KOD_LATKY"]: row for row in table("dlp_latky.csv", ["KOD_LATKY", "NAZEV_EN"])}
    parents = {}
    for row in table("dlp_soli.csv", ["KOD_LATKY", "KOD_SOLI"]):
        child, parent = row["KOD_SOLI"], row["KOD_LATKY"]
        if child in parents and parents[child] != parent:
            raise ValueError(f"Ambiguous SÚKL parent: {child}")
        if child not in substances or parent not in substances:
            raise ValueError(f"Unknown SÚKL parent/substance: {child}")
        parents[child] = parent
    cas = defaultdict(set)
    for row in table("dlp_synonyma.csv", ["KOD_LATKY", "ZDROJ", "NAZEV"]):
        if row["ZDROJ"] == "CAS":
            cas[row["KOD_LATKY"]].add(row["NAZEV"])
    products = table("dlp_lecivepripravky.csv", ["KOD_SUKL", "NAZEV", "LL", "CESTA", "FORMA"])
    drugs, interactions = load_ddinter(ddinter_directory)
    mapper = Mapper(substances, parents, drugs, read_json(alias_path), cas)
    medications, matched_substances, outcomes = {}, {}, Counter()
    for row in products:
        code = row["KOD_SUKL"]
        if not re.fullmatch(r"\d{7}", code) or code in medications:
            raise ValueError(f"Invalid/duplicate SÚKL code: {code}")
        ingredients = []
        for substance in row["LL"].split(",") if row["LL"] else []:
            if substance not in substances:
                raise ValueError(f"Unknown SÚKL substance: {substance}")
            key = f"{substance}|{row['CESTA']}"
            if key not in matched_substances:
                matched_substances[key] = {"substanceCode": substance, "route": row["CESTA"],
                    "nameEn": substances[substance]["NAZEV_EN"], **mapper.match(substance, row["CESTA"])}
            ingredients.append(key)
        matched = sum("ddinterId" in matched_substances[key] for key in ingredients)
        status = "mapped" if ingredients and matched == len(ingredients) else "partial" if matched else "unmapped"
        outcomes[status] += 1
        medications[code] = {"name": row["NAZEV"], "route": row["CESTA"], "dosageForm": row["FORMA"],
            "ingredients": ingredients, "coverage": status}
    source_metadata = read_json(sukl_directory / "metadata.json")
    if source_metadata.get("recordCount") != len(medications):
        raise ValueError("SÚKL CSV count differs from metadata.json")
    inputs.extend(ddinter_directory / f"{code}.csv" for code in ATC_CODES)
    hashes = {str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name:
        hashlib.sha256(path.read_bytes()).hexdigest() for path in inputs}
    metadata = {
        "schemaVersion": 1,
        "snapshotId": hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest(),
        "sourceHashes": hashes, "suklPublishedAt": source_metadata.get("publishedAt"),
        "license": "CC-BY-NC-SA-4.0", "licenseUrl": f"{BASE_URL}/terms/",
        "downloadUrl": f"{BASE_URL}/download/", "suklSource": source_metadata.get("sourceArchive"),
        "counts": {"medications": len(medications), "coverage": dict(outcomes),
            "ddinterEntities": len(drugs), "interactions": len(interactions),
            "mappingMethods": dict(Counter(value.get("method", "unmapped") for value in matched_substances.values())),
            "unmappedReasons": dict(Counter(value["reason"] for value in matched_substances.values() if "reason" in value))},
        "limitations": ["Partial source export", "No clinical validation", "Descriptions fetched separately",
            "No general salt/ester equivalence", "Only explicitly supported routes/formulations"],
    }
    return {"metadata": metadata, "drugs": drugs, "substances": matched_substances,
        "medications": medications, "interactions": interactions}


class DetailParser(HTMLParser):
    """Read labelled table cells, not arbitrary mentions elsewhere on the page."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows, self.cells, self.text = [], [], None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.cells = []
        elif tag == "td":
            self.text = []
        elif tag in {"br", "span", "p"} and self.text is not None:
            self.text.append(" ")

    def handle_data(self, data):
        if self.text is not None:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.text is not None:
            self.cells.append(" ".join("".join(self.text).split()))
            self.text = None
        elif tag == "tr" and len(self.cells) == 2:
            self.rows.append(tuple(self.cells))


def parse_detail(html, first, second):
    parser = DetailParser()
    parser.feed(html)
    fields = dict(parser.rows)
    ids = re.findall(r"DDInter\d+", fields.get("ID", ""))
    if sorted(ids) != sorted([first, second]):
        raise ValueError("Interaction detail belongs to a different drug pair")
    if not fields.get("Interaction"):
        raise ValueError("Interaction detail has no description")
    return {"popis": fields["Interaction"], "management": fields.get("Management") or None,
        "references": fields.get("References") or None, "language": "en"}


class DDInterClient:
    def __init__(self, cache_directory):
        self.cache = cache_directory
        self.opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.last_request = 0

    def request(self, path, data=None, referer=None):
        time.sleep(max(0, 1 - (time.monotonic() - self.last_request)))
        headers = {"User-Agent": "PillGaze-research/0.1 (non-commercial prototype)"}
        if referer:
            headers["Referer"] = BASE_URL + referer
        request = Request(BASE_URL + path, data=urlencode(data).encode() if data is not None else None, headers=headers)
        try:
            with self.opener.open(request, timeout=30) as response:
                return response.read().decode("utf-8-sig")
        finally:
            self.last_request = time.monotonic()

    def index(self, drug):
        path = self.cache / "indexes" / f"{drug}.json"
        if path.exists():
            return read_json(path)
        page = f"/server/drug-detail/{drug}/"
        html = self.request(page)
        token = re.search(r"csrfmiddlewaretoken\s*:\s*['\"]([A-Za-z0-9]+)['\"]", html)
        if not token:
            raise ValueError("DDInter CSRF token not found; website may have changed")
        entries, start, seen = {}, 0, set()
        while True:
            payload = json.loads(self.request(f"/server/interact-with/{drug}/", {
                "csrfmiddlewaretoken": token[1], "draw": 1, "start": start, "length": 10000,
                "severity": "", "mechanism": "", "search[value]": "",
            }, page))
            rows = payload["data"]
            total = payload["recordsFiltered"]
            if type(total) is not int or total < 0 or total > 10000 or not isinstance(rows, list):
                raise ValueError("Invalid DDInter interaction index")
            if start + len(rows) > total:
                raise ValueError("DDInter index count is inconsistent")
            for row in rows:
                other, identifier = row["drug_id"], row["interaction_id"]
                if not re.fullmatch(r"DDInter\d+", other) or type(identifier) is not int or identifier <= 0:
                    raise ValueError("Invalid DDInter interaction index entry")
                if identifier in seen:
                    raise ValueError("Duplicate/pagination conflict in DDInter interaction index")
                seen.add(identifier)
                level = {0: "Unknown", 1: "Minor", 2: "Moderate", 3: "Major"}.get(row["level"])
                if level is None:
                    raise ValueError("Invalid DDInter index severity")
                entries.setdefault(other, []).append({"id": identifier, "level": level})
            start += len(rows)
            if start >= total:
                break
            if not rows:
                raise ValueError("Incomplete DDInter pagination")
        write_json(path, entries)
        return entries

    def detail(self, key):
        path = self.cache / "details" / f"{key}.json"
        if path.exists():
            return read_json(path)
        first, second = key.split("|")
        records = self.index(first).get(second)
        if not records:
            raise ValueError(f"CSV pair missing from DDInter website: {key}")
        details, urls = [], []
        for record in sorted(records, key=lambda value: value["id"]):
            url = f"/server/interact/{record['id']}/"
            details.append(parse_detail(self.request(url), first, second))
            urls.append(BASE_URL + url)
        detail = {field: "\n\n".join(dict.fromkeys(value[field] for value in details if value[field])) or None
            for field in ["popis", "management", "references"]}
        detail.update({"language": "en", "zdroje": urls,
            "sourceLevels": sorted({record["level"] for record in records}),
            "fetchedAt": datetime.now(timezone.utc).isoformat()})
        write_json(path, detail)
        return detail


def check_medications(dataset, codes, cache_directory, fetch=False):
    codes = sorted(set(codes))
    medications, substances = dataset["medications"], dataset["substances"]
    for code in codes:
        if not re.fullmatch(r"\d{7}", code) or code not in medications:
            raise ValueError(f"Unknown SÚKL code (keep all seven digits): {code}")
    client = DDInterClient(cache_directory)
    result = {"map": {code: [] for code in codes}, "coverage": {}, "errors": {},
        "snapshotId": dataset["metadata"]["snapshotId"], "absenceMeansSafe": False}
    resolved = {}
    for code in codes:
        medication = medications[code]
        matches = [substances[key] for key in medication["ingredients"]]
        resolved[code] = {value["ddinterId"] for value in matches if "ddinterId" in value}
        result["coverage"][code] = {**medication, "ingredients": matches}
    for first, second in itertools.combinations(codes, 2):
        keys = sorted({pair_key(a, b) for a in resolved[first] for b in resolved[second]})
        for key in keys:
            level = dataset["interactions"].get(key)
            if level is None:
                continue
            detail_path = cache_directory / "details" / f"{key}.json"
            detail = read_json(detail_path) if detail_path.exists() else {}
            if fetch and not detail and key not in result["errors"]:
                try:
                    detail = client.detail(key)
                except (OSError, ValueError, KeyError, TypeError) as error:
                    result["errors"][key] = str(error)
            entry = {"popis": None, "descriptionStatus": "missing", "zavaznost": level,
                "ddinterIds": key.split("|"), "zdroje": [], **detail}
            if detail:
                entry["descriptionStatus"] = "available"
                entry["levelConflict"] = detail.get("sourceLevels", [level]) != [level]
            result["map"][first].append({"suklKod": second, **entry})
            result["map"][second].append({"suklKod": first, **entry})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    build = subcommands.add_parser("build", help="Generate normalized mapping and interaction tables")
    build.add_argument("--download", action="store_true", help="Download missing public CSVs")
    check = subcommands.add_parser("check", help="Return SÚKL → {suklKod, popis, ...}[] for supplied medications")
    check.add_argument("codes", nargs="+")
    check.add_argument("--fetch-details", action="store_true", help="Fetch and cache missing English descriptions")
    args = parser.parse_args()
    try:
        if args.command == "build":
            if args.download:
                client = DDInterClient(CACHE)
                CACHE.mkdir(parents=True, exist_ok=True)
                for code in ATC_CODES:
                    path = CACHE / f"{code}.csv"
                    if not path.exists():
                        content = client.request(f"/static/media/download/ddinter_downloads_code_{code}.csv")
                        temporary = path.with_suffix(".csv.tmp")
                        temporary.write_text(content, encoding="utf-8")
                        list(csv_rows(temporary, {"DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"}, "utf-8-sig", ","))
                        temporary.replace(path)
            dataset = build_dataset(ROOT / "data/sukl", CACHE, ROOT / "data/interactions/aliases.json")
            write_json(OUTPUT / "dataset.json", dataset)
            write_json(OUTPUT / "coverage.json", dataset["metadata"])
            print(json.dumps(dataset["metadata"]["counts"], ensure_ascii=False, indent=2))
        else:
            result = check_medications(read_json(OUTPUT / "dataset.json"), args.codes, CACHE, args.fetch_details)
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 2 if result["errors"] else 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
