#!/usr/bin/env python3
"""Reduce data/solid-tumors-regimens.json to what the apps use: regimen names and their drugs.

Only type "Regimen" is kept (synthetic regimens are per-biosimilar copies of real ones).
Usage: python3 scripts/slim_regimens.py
"""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / "data" / "solid-tumors-regimens.json"
target = root / "data" / "regimens.json"

regimens = json.loads(source.read_text(encoding="utf-8"))["regimens"]
seen = {}
for regimen in regimens:
    if regimen["type"] == "Regimen":
        seen.setdefault(regimen["name"], regimen.get("drugs", []))
slim = [{"name": name, "drugs": seen[name]} for name in sorted(seen)]
target.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
print(f"{len(slim)} regimens -> {target.relative_to(root)} ({target.stat().st_size // 1024} kB)")
