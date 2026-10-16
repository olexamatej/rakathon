#!/usr/bin/env python3
"""Time actual HTTP requests through the Rust server. No inference tools/search.

Build first: cargo build --release
Run: python3 scripts/benchmark.py --output benchmarks/<run-name>
"""
import argparse
import datetime
import json
import os
import pathlib
import random
import socket
import subprocess
import time
import urllib.error
import urllib.request


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--models", nargs="+", default=["gpt-6-luna", "gpt-5.6-terra", "gpt-6.1-sol"])
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()
    if args.repeats < 1:
        parser.error("--repeats must be positive")
    root = pathlib.Path(__file__).resolve().parents[1]
    binary = root / "target/release/interaction-engine"
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    request = {"drugs": ["warfarin", "ibuprofen", "aspirin", "fluconazole"]}
    configurations = [(model, mode) for model in args.models for mode in ["standard", "fast"]]
    rng = random.Random(args.seed)
    schedule = []
    for repeat in range(1, args.repeats + 1):
        block = configurations.copy()
        rng.shuffle(block)
        schedule.extend((model, mode, repeat) for model, mode in block)
    metadata = {
        "startedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "codexVersion": subprocess.check_output(["codex", "--version"], text=True).strip(),
        "request": request, "reasoningEffort": "low", "repeats": args.repeats,
        "scheduleSeed": args.seed, "sequential": True, "timeoutSeconds": 90,
        "requestedServiceTiers": {"standard": "default", "fast": "priority"},
        "servedServiceTierVerified": False,
        "method": "Real localhost HTTP requests; timing excludes Rust process startup and includes ephemeral Codex startup, inference, validation, and link generation. No separate warm-up. Order randomized within each repetition block. Shared CLI/model prompt caches may affect timings.",
        "schedule": [{"model": model, "mode": mode, "repeat": repeat} for model, mode, repeat in schedule],
    }
    write_json(output / "metadata.json", metadata)
    write_json(output / "request.json", request)
    (output / "prompt.txt").write_text((root / "src/prompt.txt").read_text())
    results = []
    for ordinal, (model, mode, repeat) in enumerate(schedule, 1):
        stem = f"{model}.{mode}.{repeat}"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = os.environ.copy()
        env.update(CODEX_MODEL=model, CODEX_SERVICE_TIER=metadata["requestedServiceTiers"][mode],
                   CODEX_TIMEOUT_SECONDS="90", MAX_CONCURRENT_CHECKS="1", BIND_ADDR=f"127.0.0.1:{port}")
        with (output / f"{stem}.server.log").open("w") as log:
            process = subprocess.Popen([str(binary)], cwd=root, env=env, stdout=log, stderr=log)
            try:
                for _ in range(100):
                    if process.poll() is not None:
                        raise RuntimeError(f"Server exited before readiness: {stem}")
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=1):
                            break
                    except (OSError, urllib.error.URLError):
                        time.sleep(0.05)
                else:
                    raise RuntimeError(f"Server readiness timeout: {stem}")
                http_request = urllib.request.Request(f"http://127.0.0.1:{port}/interaction-checks",
                    data=json.dumps(request).encode(), headers={"Content-Type": "application/json"})
                started = time.perf_counter()
                error = None
                try:
                    response = urllib.request.urlopen(http_request, timeout=100)
                except urllib.error.HTTPError as exc:
                    response = exc
                except (OSError, urllib.error.URLError) as exc:
                    response = None
                    error = str(exc)
                if response is not None:
                    with response:
                        raw = response.read()
                        status, headers = response.status, dict(response.headers)
                    (output / f"{stem}.response.json").write_bytes(raw)
                else:
                    status, headers = None, {}
                elapsed = time.perf_counter() - started
                row = {"model": model, "mode": mode, "repeat": repeat, "ordinal": ordinal,
                    "elapsedSeconds": elapsed, "httpStatus": status, "headers": headers,
                    "responseFile": f"{stem}.response.json" if response is not None else None,
                    "error": error}
                results.append(row)
                write_json(output / "runs.json", results)
                print(json.dumps({"progress": f"{ordinal}/{len(schedule)}", "model": model,
                    "mode": mode, "repeat": repeat, "seconds": round(elapsed, 2), "httpStatus": status}), flush=True)
            finally:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    metadata["finishedAt"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    write_json(output / "metadata.json", metadata)


if __name__ == "__main__":
    main()
