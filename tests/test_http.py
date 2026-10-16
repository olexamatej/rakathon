import csv
import http.client
import io
import json
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

from app import Workspace, handler_for
from test_core import synthetic_tables, write_fixture


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        root = Path(cls.temp.name)
        write_fixture(root, synthetic_tables())
        cls.workspace = Workspace(root, root / "state")
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler_for(cls.workspace))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, method="GET", body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=5)
        connection.request(method, path, body=body, headers=headers or {})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_routes_keep_files_private_and_disable_caching(self):
        status, headers, body = self.request("/api/analysis")
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["summary"]["patients"], 32)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.assertNotIn("Access-Control-Allow-Origin", headers)
        for path in ["/assets/patients.csv", "/.git/config", "/../app.py", "/reviews.sqlite3"]:
            self.assertEqual(self.request(path)[0], 404)
        for path in ["/", "/app.js", "/style.css", "/api/patients/P0001"]:
            self.assertEqual(self.request(path)[0], 200)

    def test_bad_origin_and_host_cannot_read_or_write(self):
        self.assertEqual(self.request("/api/analysis", headers={"Host": "attacker.invalid"})[0], 403)
        self.assertEqual(self.request("/api/analysis", headers={"Origin": "https://attacker.invalid"})[0], 403)
        payload = json.dumps({"patient_id": "P0001", "status": "relevant", "note": "bad origin"})
        self.assertEqual(self.request("/api/reviews", "POST", payload,
                                     {"Origin": "null", "Content-Type": "application/json"})[0], 403)
        self.assertEqual(self.request("/api/reviews", "POST", payload,
                                     {"Content-Type": "text/plain"})[0], 415)

    def test_review_export_and_conflict(self):
        payload = json.dumps({"patient_id": "P0002", "status": "relevant", "note": "=1+1\nkomentář",
                              "concerns": ["endpoint"], "previous_updated_at": None})
        headers = {"Content-Type": "application/json", "Origin": f"http://127.0.0.1:{self.server.server_port}"}
        self.assertEqual(self.request("/api/reviews", "POST", payload, headers)[0], 200)
        self.assertEqual(self.request("/api/reviews", "POST", payload, headers)[0], 409)
        status, response_headers, body = self.request("/api/export.csv")
        self.assertEqual(status, 200)
        self.assertIn("attachment", response_headers["Content-Disposition"])
        rows = list(csv.DictReader(io.StringIO(body.decode("utf-8-sig"))))
        self.assertEqual(len(rows), 32)
        reviewed = next(r for r in rows if r["patient_id"] == "P0002")
        self.assertEqual(reviewed["review_note"], "'=1+1\nkomentář")
        self.assertEqual(reviewed["concerns"], "endpoint")

    def test_invalid_json_and_unknown_patient(self):
        headers = {"Content-Type": "application/json"}
        for payload in ["[", "null", "[]", '{"patient_id":"P9999"}']:
            self.assertEqual(self.request("/api/reviews", "POST", payload, headers)[0], 400)
        self.assertEqual(self.request("/api/patients/P9999")[0], 404)


if __name__ == "__main__":
    unittest.main()
