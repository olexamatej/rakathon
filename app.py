"""Single-user, loopback-only dashboard. No external services or telemetry."""

import argparse
import csv
import io
import json
import os
from pathlib import Path
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import RLock
from urllib.parse import urlsplit

# Tiny matrices are faster without a large BLAS thread pool.
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

from analysis import analyze  # noqa: E402
from data import load_data  # noqa: E402

ROOT = Path(__file__).resolve().parent
STATUSES = {"unreviewed", "relevant", "not_relevant", "data_issue"}
CONCERNS = {"index", "followup", "diagnosis", "age", "sex", "endpoint"}


def csv_cell(value):
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def export_csv(analysis):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["patient_id", "diagnosis", "age_group", "sex", "assessable", "quality", "index_day",
                     "followup_days", "observed_days", "expected_days", "residual_days", "interval_low", "interval_high",
                     "surprise_score", "percentile", "candidate", "confidence", "diagnosis_peers", "stable_at_3_days",
                     "cluster", "baseline_days", "contributions_json", "review_status", "review_note", "concerns",
                     "review_updated_at", "dataset", "model", "window_days"])
    for row in analysis["patients"]:
        writer.writerow([csv_cell(v) for v in [row["patient_id"], row["diagnosis"], row["age"], row["sex"], row["assessable"],
            "; ".join(row["quality"]), row["anchor"], row["followup"], row["observed"], row["expected"], row["residual"],
            *row["interval"], row["score"], row["percentile"], row["candidate"], row["confidence"], row["support"],
            row["stable"], row["cluster"], row["baseline"], json.dumps(row["contributions"], ensure_ascii=False),
            row["review"]["status"], row["review"]["note"], ";".join(row["review"].get("concerns", [])),
            row["review"]["updated_at"], analysis["summary"]["fingerprint"], analysis["summary"]["model_version"], 365]])
    return ("\ufeff" + output.getvalue()).encode("utf-8")


class Workspace:
    def __init__(self, data_dir, state_dir):
        self.tables = load_data(data_dir)
        self.state_dir = Path(state_dir)
        self.state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        self.database = self.state_dir / "reviews.sqlite3"
        self.lock = RLock()
        with closing(sqlite3.connect(self.database)) as db, db:
            db.execute("CREATE TABLE IF NOT EXISTS reviews (dataset TEXT, patient_id TEXT, status TEXT, note TEXT, "
                       "concerns TEXT, updated_at TEXT, PRIMARY KEY(dataset, patient_id))")
        self.database.chmod(0o600)
        self.reviews = self.read_reviews()
        self.analysis = analyze(self.tables, self.reviews)

    def read_reviews(self):
        with closing(sqlite3.connect(self.database)) as db:
            return {p: {"status": s, "note": n, "concerns": json.loads(c), "updated_at": t}
                    for p, s, n, c, t in db.execute("SELECT patient_id,status,note,concerns,updated_at FROM reviews WHERE dataset=?",
                                                   (self.tables["fingerprint"],))}

    def save_review(self, payload):
        if not isinstance(payload, dict):
            raise ValueError("Neplatné hodnocení")
        patient_id, status, note = (payload.get(k) for k in ("patient_id", "status", "note"))
        concerns = payload.get("concerns", [])
        if not isinstance(patient_id, str) or patient_id not in {p["patient_id"] for p in self.analysis["patients"]}:
            raise ValueError("Neznámý pacient")
        if not isinstance(status, str) or status not in STATUSES or not isinstance(note, str) or len(note) > 4000:
            raise ValueError("Neplatný stav nebo komentář delší než 4000 znaků")
        if not isinstance(concerns, list) or any(not isinstance(c, str) or c not in CONCERNS for c in concerns):
            raise ValueError("Neplatný zpochybněný údaj")
        review = {"status": status, "note": note, "concerns": sorted(set(concerns)),
                  "updated_at": datetime.now(timezone.utc).isoformat(timespec="microseconds")}
        with self.lock:
            previous = self.reviews.get(patient_id, {}).get("updated_at")
            if payload.get("previous_updated_at") != previous:
                raise FileExistsError("Hodnocení se mezitím změnilo. Obnovte stránku před další úpravou.")
            updated = {**self.reviews, patient_id: review}
            analysis = analyze(self.tables, updated)
            with closing(sqlite3.connect(self.database)) as db, db:
                db.execute("INSERT OR REPLACE INTO reviews VALUES (?,?,?,?,?,?)",
                           (self.tables["fingerprint"], patient_id, status, note, json.dumps(review["concerns"]), review["updated_at"]))
            self.reviews, self.analysis = updated, analysis
        return review


def handler_for(workspace):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass  # Patient IDs and review contents do not belong in access logs.

        def respond(self, code, body, content_type="application/json; charset=utf-8", attachment=None):
            if not isinstance(body, bytes):
                body = json.dumps(body, ensure_ascii=False, allow_nan=False).encode()
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
                             "img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
            if attachment:
                self.send_header("Content-Disposition", f'attachment; filename="{attachment}"')
            self.end_headers()
            self.wfile.write(body)

        def local_request(self):
            port = self.server.server_port
            hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
            host = self.headers.get("Host")
            origin = self.headers.get("Origin")
            if host not in hosts or (origin is not None and origin != f"http://{host}"):
                self.respond(403, {"error": "Povolen je pouze přístup ze stejného lokálního rozhraní"})
                return False
            return True

        def do_GET(self):
            if not self.local_request():
                return
            path = urlsplit(self.path).path
            static = {"/": ("index.html", "text/html; charset=utf-8"),
                      "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                      "/style.css": ("style.css", "text/css; charset=utf-8")}
            if path in static:
                name, content_type = static[path]
                return self.respond(200, (ROOT / "web" / name).read_bytes(), content_type)
            with workspace.lock:
                analysis = workspace.analysis
                if path == "/api/analysis":
                    return self.respond(200, {**analysis, "patients": [{k: v for k, v in r.items() if k not in ("timeline", "labs")}
                                                                      for r in analysis["patients"]]})
                if path == "/api/export.csv":
                    return self.respond(200, export_csv(analysis), "text/csv; charset=utf-8", "outlier-review.csv")
                if path.startswith("/api/patients/"):
                    patient = next((r for r in analysis["patients"] if r["patient_id"] == path.rsplit("/", 1)[-1]), None)
                    if patient:
                        return self.respond(200, patient)
            self.respond(404, {"error": "Nenalezeno"})

        def do_POST(self):
            if not self.local_request():
                return
            if self.path != "/api/reviews":
                return self.respond(404, {"error": "Nenalezeno"})
            if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                return self.respond(415, {"error": "Očekává se JSON"})
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 32768:
                    return self.respond(413, {"error": "Neplatná velikost požadavku"})
                payload = json.loads(self.rfile.read(length))
                review = workspace.save_review(payload)
                self.respond(200, review)
            except FileExistsError as exc:
                self.respond(409, {"error": str(exc)})
            except (ValueError, UnicodeError) as exc:
                self.respond(400, {"error": str(exc)})
            except (OSError, sqlite3.Error):
                self.respond(500, {"error": "Hodnocení se nepodařilo uložit. Zkontrolujte lokální úložiště a zkuste to znovu."})
    return Handler


def main():
    parser = argparse.ArgumentParser(description="OUTLIER · lokální klinický průzkumník")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--data-dir", type=Path, default=ROOT / "assets")
    parser.add_argument("--state-dir", type=Path, default=ROOT / ".local")
    parser.add_argument("--export", type=Path, help="Zapsat CSV do zadané cesty a skončit")
    args = parser.parse_args()
    os.umask(0o077)
    workspace = Workspace(args.data_dir, args.state_dir)
    if args.export:
        args.export.parent.mkdir(parents=True, exist_ok=True)
        args.export.write_bytes(export_csv(workspace.analysis))
        print(f"CSV uloženo do {args.export}")
        return
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_for(workspace))
    print(f"OUTLIER → http://localhost:{server.server_port} · data zůstávají lokálně", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
