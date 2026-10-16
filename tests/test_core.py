import csv
import io
import json
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

import numpy as np

from analysis import ALPHA, RIDGE, analyze, fit_predict, group_outliers
from app import Workspace, csv_cell, export_csv
from data import covered_days, load_data, patient_features


def synthetic_tables(n=32):
    tables = {"patients": [], "episodes": [], "labs": [], "fingerprint": "synthetic"}
    for i in range(n):
        patient_id = f"P{i + 1:04d}"
        dx = "C91" if i % 2 else "C71"
        tables["patients"].append({"patient_id": patient_id, "tumor_id": 1, "dx_icd10": dx,
                                   "age_group": "0-5" if i % 3 else "6-8", "sex": "M" if i % 4 else "F"})
        for j, (start, end, code) in enumerate([(0, 20, "Z38"), (100, 105 + i * 2, dx), (500, 500, dx)], 1):
            tables["episodes"].append({"patient_id": patient_id, "episode_id": f"{patient_id}-E{j:03d}",
                                       "day_start": start, "day_end": end, "dx_main": code})
    return tables


def write_fixture(directory, tables):
    schema = json.loads((Path(__file__).resolve().parents[1] / "assets/datapackage.json").read_text())
    (directory / "datapackage.json").write_text(json.dumps(schema))
    for resource in schema["resources"]:
        name = resource["name"]
        fields = [f["name"] for f in resource["schema"]["fields"]]
        with (directory / f"{name}.csv").open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for original in tables[name]:
                row = {**original}
                if name == "patients":
                    row["deceased"] = "0"
                writer.writerow(row)


class EndpointTests(unittest.TestCase):
    def test_union_clips_and_does_not_double_count(self):
        episodes = [{"day_start": a, "day_end": b} for a, b in [(-5, 5), (3, 8), (8, 12), (18, 30), (10, 10), (11, None)]]
        self.assertEqual(covered_days(episodes, 0, 20), 14)

    def test_index_ignores_pre_cancer_care(self):
        row = patient_features(synthetic_tables())[0]
        self.assertEqual(row["anchor"], 100)
        self.assertEqual(row["observed"], 5)
        self.assertTrue(row["eligible"])
        self.assertEqual(row["labs_count"], 0)
        self.assertEqual(row["labs_with_reference"], 0)

    def test_missing_discharge_followup_and_anchor_are_excluded(self):
        tables = synthetic_tables()
        tables["episodes"][1]["day_end"] = None
        tables["episodes"][5]["day_end"] = 465
        tables["episodes"][5]["day_start"] = 465
        tables["episodes"][7]["dx_main"] = "Z00"
        tables["episodes"][8]["dx_main"] = "Z00"
        rows = patient_features(tables)
        self.assertFalse(rows[0]["eligible"])
        self.assertFalse(rows[1]["eligible"])
        self.assertIsNone(rows[2]["observed"])
        self.assertFalse(rows[2]["eligible"])

    def test_multiple_tumors_are_not_duplicate_people(self):
        tables = synthetic_tables()
        tables["patients"].append({**tables["patients"][0], "tumor_id": 2})
        rows = patient_features(tables)
        self.assertEqual(len(rows), 32)
        self.assertFalse(rows[0]["eligible"])

    def test_input_validation_rejects_wrong_episode_patient(self):
        with tempfile.TemporaryDirectory() as temp:
            tables = synthetic_tables()
            tables["episodes"][0]["patient_id"] = "P9999"
            write_fixture(Path(temp), tables)
            with self.assertRaisesRegex(ValueError, "vazba pacienta"):
                load_data(temp)

    def test_input_validation_preserves_lab_codes_rejects_nonfinite(self):
        with tempfile.TemporaryDirectory() as temp:
            tables = synthetic_tables()
            lab = {"patient_id": "P0001", "episode_id": "P0001-E002", "day": 101,
                   "test_code": "00123", "panel": "blood_count", "value": 1.2,
                   "unit": "x10 9/l", "ref_low": 1, "ref_high": 2, "flag": "N"}
            tables["labs"] = [lab]
            write_fixture(Path(temp), tables)
            self.assertEqual(load_data(temp)["labs"][0]["test_code"], "00123")
            lab["value"] = "nan"
            write_fixture(Path(temp), tables)
            with self.assertRaisesRegex(ValueError, "neplatné číslo"):
                load_data(temp)


class ModelTests(unittest.TestCase):
    def test_analytic_jackknife_matches_actual_refits(self):
        rng = np.random.default_rng(42)
        x = np.column_stack([np.ones(30), rng.normal(size=(30, 3))])
        y = rng.uniform(0, 150, size=30)
        target = np.array([1, 0.2, -0.8, 0.5])
        _, prediction, interval = fit_predict(x, y, target)
        penalty = np.diag([0, RIDGE, RIDGE, RIDGE])
        beta = np.linalg.solve(x.T @ x + penalty, x.T @ y)
        self.assertAlmostEqual(prediction, np.clip(target @ beta, 0, 365))
        lower, upper = [], []
        for j in range(len(y)):
            tx, ty = np.delete(x, j, axis=0), np.delete(y, j)
            beta = np.linalg.solve(tx.T @ tx + penalty, tx.T @ ty)
            residual = abs(y[j] - np.clip(x[j] @ beta, 0, 365))
            center = np.clip(target @ beta, 0, 365)
            lower.append(center - residual)
            upper.append(center + residual)
        import math
        expected = [np.clip(sorted(lower)[math.floor(ALPHA * 31) - 1], 0, 365),
                    np.clip(sorted(upper)[math.ceil((1 - ALPHA) * 31) - 1], 0, 365)]
        np.testing.assert_allclose(interval, expected, atol=1e-9)

    def test_own_outcome_cannot_change_own_prediction_or_interval(self):
        tables = synthetic_tables()
        before = next(r for r in analyze(tables)["patients"] if r["patient_id"] == "P0001")
        tables["episodes"][1]["day_end"] = 300
        after = next(r for r in analyze(tables)["patients"] if r["patient_id"] == "P0001")
        self.assertEqual(before["expected"], after["expected"])
        self.assertEqual(before["interval"], after["interval"])
        self.assertNotEqual(before["residual"], after["residual"])

    def test_explanation_is_exact_and_all_values_finite(self):
        result = analyze(synthetic_tables())
        for row in result["patients"]:
            self.assertAlmostEqual(row["baseline"] + sum(c["days"] for c in row["contributions"]), row["expected"])
            self.assertLessEqual(row["interval"][0], row["interval"][1])
        json.dumps(result, allow_nan=False)

    def test_feedback_excludes_bad_data_from_training(self):
        tables = synthetic_tables()
        review = {"P0001": {"status": "data_issue", "note": "chybný konec", "updated_at": None}}
        before = analyze(tables, review)
        tables["episodes"][1]["day_end"] = 400
        after = analyze(tables, review)
        self.assertEqual(before["summary"]["eligible"], 31)
        for row, changed in zip(before["patients"], after["patients"]):
            self.assertEqual(row["expected"], changed["expected"])
        excluded = next(r for r in after["patients"] if r["patient_id"] == "P0001")
        self.assertFalse(excluded["candidate"])
        self.assertIsNone(excluded["score"])

    def test_only_active_candidates_are_clustered(self):
        result = analyze(synthetic_tables())
        candidate = next(r for r in result["patients"] if r["candidate"])
        candidate["review"]["status"] = "not_relevant"
        groups = group_outliers(result["patients"])
        members = {p for g in groups for p in g["members"]}
        expected = {r["patient_id"] for r in result["patients"] if r["candidate"] and r["review"]["status"] == "unreviewed"}
        self.assertEqual(members, expected)
        self.assertNotIn(candidate["patient_id"], members)

    def test_identical_outcomes_are_not_outliers(self):
        tables = synthetic_tables()
        for e in tables["episodes"]:
            if e["day_start"] == 100:
                e["day_end"] = 110
        result = analyze(tables)
        self.assertEqual(result["summary"]["candidates"], 0)
        self.assertEqual(result["summary"]["outside_interval"], 0)
        self.assertEqual(result["groups"], [])


class PersistenceTests(unittest.TestCase):
    def test_database_connections_are_closed_after_each_operation(self):
        connections = []
        connect = sqlite3.connect

        def track_connection(*args, **kwargs):
            connection = connect(*args, **kwargs)
            connections.append(connection)
            return connection

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_fixture(root, synthetic_tables())
            with patch("app.sqlite3.connect", side_effect=track_connection):
                workspace = Workspace(root, root / "state")
                workspace.save_review({"patient_id": "P0001", "status": "relevant", "note": ""})
                workspace.read_reviews()
            self.assertEqual(len(connections), 4)
            for connection in connections:
                with self.assertRaises(sqlite3.ProgrammingError):
                    connection.execute("SELECT 1")

    def test_roundtrip_conflict_and_safe_export(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_fixture(root, synthetic_tables())
            workspace = Workspace(root, root / "state")
            payload = {"patient_id": "P0001", "status": "relevant", "note": '=HYPERLINK("bad")\nčeský komentář',
                       "concerns": ["index", "diagnosis"], "previous_updated_at": None}
            workspace.save_review(payload)
            with self.assertRaises(FileExistsError):
                workspace.save_review(payload)
            reloaded = Workspace(root, root / "state")
            self.assertEqual(reloaded.reviews["P0001"]["note"], payload["note"])
            output = export_csv(reloaded.analysis).decode("utf-8-sig")
            rows = list(csv.DictReader(io.StringIO(output)))
            row = next(r for r in rows if r["patient_id"] == "P0001")
            self.assertEqual(len(rows), 32)
            self.assertEqual(row["review_note"], "'" + payload["note"])
            self.assertEqual(row["review_status"], "relevant")
            payload["previous_updated_at"] = reloaded.reviews["P0001"]["updated_at"]
            payload["status"] = "unreviewed"
            reloaded.save_review(payload)
            self.assertEqual(reloaded.analysis["summary"]["reviewed"], 0)

    def test_invalid_review_does_not_mutate(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            write_fixture(root, synthetic_tables())
            workspace = Workspace(root, root / "state")
            for payload in [[], {"patient_id": []}, {"patient_id": "P0001", "status": [], "note": ""},
                            {"patient_id": "P0001", "status": "relevant", "note": "", "concerns": [{}]}]:
                with self.assertRaises(ValueError):
                    workspace.save_review(payload)
            self.assertEqual(workspace.read_reviews(), {})

    def test_spreadsheet_formula_defense_preserves_numbers(self):
        self.assertEqual(csv_cell(-1.5), -1.5)
        self.assertEqual(csv_cell(' \t=1+1'), "' \t=1+1")


if __name__ == "__main__":
    unittest.main()
