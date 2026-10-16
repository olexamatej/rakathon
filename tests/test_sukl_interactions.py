import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sukl_interactions as interactions


class MappingTests(unittest.TestCase):
    def mapper(self, drugs=None, aliases=None):
        substances = {
            "1": {"NAZEV_EN": "WARFARIN"},
            "2": {"NAZEV_EN": "WARFARIN SODIUM"},
            "3": {"NAZEV_EN": "DICLOFENAC"},
            "4": {"NAZEV_EN": "DEXIBUPROFEN"},
            "5": {"NAZEV_EN": "IBUPROFEN"},
            "6": {"NAZEV_EN": "TRASTUZUMAB DERUXTECAN"},
            "7": {"NAZEV_EN": "TRASTUZUMAB"},
            "8": {"NAZEV_EN": "SUFENTANIL CITRATE"},
            "9": {"NAZEV_EN": "SUFENTANIL"},
            "10": {"NAZEV_EN": "FENTANYL"},
            "11": {"NAZEV_EN": "PARACETAMOL"},
            "12": {"NAZEV_EN": "PACLITAXEL"},
        }
        default_drugs = {
            "DDInter1": "Warfarin", "DDInter3": "Diclofenac",
            "DDInter4": "Diclofenac (topical)", "DDInter5": "Diclofenac (ophthalmic)",
            "DDInter6": "Ibuprofen", "DDInter7": "Trastuzumab",
            "DDInter9": "Sufentanil", "DDInter10": "Fentanyl",
            "DDInter11": "Acetaminophen", "DDInter12": "Paclitaxel",
            "DDInter13": "Paclitaxel (protein-bound)",
        }
        return interactions.Mapper(substances, {"2": "1", "4": "5", "6": "7", "8": "9", "9": "10"},
            drugs or default_drugs, aliases or {}, {"11": {"103-90-2"}})

    def test_exact_salt_and_route_selection(self):
        mapper = self.mapper()
        self.assertEqual(mapper.match("2", "POR"), {"ddinterId": "DDInter1", "method": "salt_name_and_parent"})
        self.assertEqual(mapper.match("3", "POR")["ddinterId"], "DDInter3")
        self.assertEqual(mapper.match("3", "DRM")["ddinterId"], "DDInter4")
        self.assertEqual(mapper.match("3", "OPH")["ddinterId"], "DDInter5")
        self.assertEqual(mapper.match("3", "IMS/IVN")["ddinterId"], "DDInter3")

    def test_no_generic_fallback_for_topical_or_unknown_routes(self):
        self.assertIn("reason", self.mapper().match("5", "DRM"))
        self.assertIn("reason", self.mapper().match("3", "INH"))
        self.assertIn("reason", self.mapper().match("3", ""))
        self.assertEqual(self.mapper().match("3", "POR/OPH")["reason"], "ambiguous_route")

    def test_derivatives_are_not_equivalent_and_parent_walk_is_not_transitive(self):
        mapper = self.mapper()
        self.assertIn("reason", mapper.match("4", "POR"))
        self.assertIn("reason", mapper.match("6", "IVN"))
        self.assertEqual(mapper.match("8", "IVN")["ddinterId"], "DDInter9")
        self.assertIn("reason", self.mapper({"DDInter10": "Fentanyl"}).match("8", "IVN"))

    def test_formulation_variants_require_review(self):
        self.assertEqual(self.mapper().match("12", "IVN")["reason"], "formulation_requires_review")

    def test_alias_checks_expected_names_identifiers_and_cas(self):
        alias = {"11": {"sourceName": "PARACETAMOL", "targetId": "DDInter11",
            "targetName": "Acetaminophen", "cas": "103-90-2", "source": "https://example.test/source"}}
        self.assertEqual(self.mapper(aliases=alias).match("11", "POR")["ddinterId"], "DDInter11")
        alias["11"]["cas"] = "wrong"
        with self.assertRaisesRegex(ValueError, "CAS mismatch"):
            self.mapper(aliases=alias)

    def test_only_closed_counterion_list_is_accepted(self):
        self.assertTrue(interactions.salt_name_matches("ATORVASTATIN CALCIUM TRIHYDRATE", "ATORVASTATIN"))
        self.assertTrue(interactions.salt_name_matches("AMOXICILLIN TRIHYDRATE", "AMOXICILLIN"))
        for name, parent in [("ABIRATERONE ACETATE", "ABIRATERONE"), ("DEXIBUPROFEN", "IBUPROFEN"),
                ("FLUTICASONE PROPIONATE", "FLUTICASONE"), ("FOSNETUPITANT", "NETUPITANT")]:
            self.assertFalse(interactions.salt_name_matches(name, parent))


class DatasetTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.sukl, self.ddinter = self.root / "sukl", self.root / "ddinter"
        (self.sukl / "dlp").mkdir(parents=True)
        self.ddinter.mkdir()
        self.aliases = self.root / "aliases.json"
        interactions.write_json(self.aliases, {})
        interactions.write_json(self.sukl / "metadata.json", {"recordCount": 4, "publishedAt": "2026-01-01"})
        self.write_csv(self.sukl / "dlp/dlp_latky.csv", ["KOD_LATKY", "NAZEV_EN"],
            [["1", "ALPHA"], ["2", "BETA"], ["3", "UNLISTED"]])
        self.write_csv(self.sukl / "dlp/dlp_soli.csv", ["KOD_LATKY", "KOD_SOLI"], [])
        self.write_csv(self.sukl / "dlp/dlp_synonyma.csv", ["KOD_LATKY", "ZDROJ", "NAZEV"], [])
        self.write_csv(self.sukl / "dlp/dlp_lecivepripravky.csv", ["KOD_SUKL", "NAZEV", "LL", "CESTA", "FORMA"],
            [["0000001", "SYNTHETIC, ALPHA", "1", "POR", "TBL NOB"],
             ["0000002", "SYNTHETIC BETA", "2", "POR", "TBL NOB"],
             ["0000003", "SYNTHETIC COMBINATION", "1,3", "POR", "TBL NOB"],
             ["0000004", "SYNTHETIC EMPTY", "", "POR", "TBL NOB"]])
        self.columns = ["DDInterID_A", "Drug_A", "DDInterID_B", "Drug_B", "Level"]
        for code in interactions.ATC_CODES:
            self.write_csv(self.ddinter / f"{code}.csv", self.columns, [], ",")
        for code in "AB":
            row = ["DDInter1", "Alpha", "DDInter2", "Beta", "Unknown"]
            if code == "B":
                row = ["DDInter2", "Beta", "DDInter1", "Alpha", "Unknown"]
            self.write_csv(self.ddinter / f"{code}.csv", self.columns, [row], ",")

    def write_csv(self, path, columns, rows, delimiter=";"):
        with path.open("w", encoding="cp1250" if delimiter == ";" else "utf-8", newline="") as handle:
            writer = csv.writer(handle, delimiter=delimiter)
            writer.writerow(columns)
            writer.writerows(rows)

    def build(self):
        return interactions.build_dataset(self.sukl, self.ddinter, self.aliases)

    def test_deduplication_partial_coverage_and_reproducible_build(self):
        dataset = self.build()
        self.assertEqual(dataset, self.build())
        self.assertEqual(len(dataset["interactions"]), 1)
        self.assertEqual(dataset["medications"]["0000003"]["coverage"], "partial")
        self.assertEqual(dataset["medications"]["0000004"]["coverage"], "unmapped")
        result = interactions.check_medications(dataset, ["0000003", "0000002", "0000001"], self.root)
        self.assertEqual(result["map"]["0000003"][0]["suklKod"], "0000002")
        self.assertEqual(result["map"]["0000001"][0]["zavaznost"], "Unknown")
        self.assertIsNone(result["map"]["0000001"][0]["popis"])
        self.assertFalse(result["absenceMeansSafe"])
        with self.assertRaisesRegex(ValueError, "Unknown SÚKL"):
            interactions.check_medications(dataset, ["1"], self.root)

    def test_conflicting_csv_severity_and_missing_file_fail(self):
        self.write_csv(self.ddinter / "B.csv", self.columns,
            [["DDInter2", "Beta", "DDInter1", "Alpha", "Major"]], ",")
        with self.assertRaisesRegex(ValueError, "severity"):
            self.build()
        (self.ddinter / "A.csv").unlink()
        with self.assertRaises(FileNotFoundError):
            self.build()

    def test_cached_description_is_shared_both_directions_without_network(self):
        interactions.write_json(self.root / "details/DDInter1|DDInter2.json",
            {"popis": "Synthetic description", "zdroje": ["https://example.test/detail"], "sourceLevels": ["Unknown"]})
        with patch.object(interactions.DDInterClient, "request", side_effect=AssertionError("Unexpected network")):
            result = interactions.check_medications(self.build(), ["0000002", "0000001"], self.root)
        for code in result["map"]:
            self.assertEqual(result["map"][code][0]["popis"], "Synthetic description")
            self.assertEqual(result["map"][code][0]["descriptionStatus"], "available")

    def test_fetch_failure_preserves_positive_finding_and_missing_description(self):
        with patch.object(interactions.DDInterClient, "detail", side_effect=OSError("Network unavailable")):
            result = interactions.check_medications(self.build(), ["0000001", "0000002"], self.root, True)
        self.assertTrue(result["errors"])
        self.assertEqual(result["map"]["0000001"][0]["descriptionStatus"], "missing")
        self.assertIsNone(result["map"]["0000001"][0]["popis"])


class DetailTests(unittest.TestCase):
    def test_labelled_description_and_pair_identity(self):
        html = """<p>Unrelated interaction text</p><table>
        <tr><td>ID</td><td><a>DDInter1</a> and <a>DDInter2</a></td></tr>
        <tr><td>Interaction</td><td>Synthetic &amp; <b>formatted</b> description.</td></tr>
        <tr><td>Management</td><td>First.<br>Second.</td></tr></table>"""
        detail = interactions.parse_detail(html, "DDInter2", "DDInter1")
        self.assertEqual(detail["popis"], "Synthetic & formatted description.")
        self.assertEqual(detail["management"], "First. Second.")
        with self.assertRaisesRegex(ValueError, "different drug pair"):
            interactions.parse_detail(html, "DDInter1", "DDInter3")
        with self.assertRaisesRegex(ValueError, "no description"):
            interactions.parse_detail(html.replace("Interaction</td>", "Other</td>"), "DDInter1", "DDInter2")

    def test_index_pagination_and_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            client = interactions.DDInterClient(Path(directory))
            responses = ["csrfmiddlewaretoken: 'synthetic123'", json.dumps({"recordsFiltered": 2,
                "data": [{"drug_id": "DDInter2", "interaction_id": 11, "level": 2}]}),
                json.dumps({"recordsFiltered": 2, "data": [{"drug_id": "DDInter2", "interaction_id": 12, "level": 3}]})]
            with patch.object(client, "request", side_effect=responses) as request:
                self.assertEqual(client.index("DDInter1"), {"DDInter2": [
                    {"id": 11, "level": "Moderate"}, {"id": 12, "level": "Major"}]})
                self.assertEqual(request.call_args_list[2].args[1]["start"], 1)
                self.assertEqual(len(client.index("DDInter1")["DDInter2"]), 2)
                self.assertEqual(request.call_count, 3)

    def test_repeated_identical_record_fails_without_caching_partial_index(self):
        with tempfile.TemporaryDirectory() as directory:
            client = interactions.DDInterClient(Path(directory))
            page = json.dumps({"recordsFiltered": 2,
                "data": [{"drug_id": "DDInter2", "interaction_id": 11, "level": 2}]})
            with patch.object(client, "request", side_effect=["csrfmiddlewaretoken: 'synthetic123'", page, page]):
                with self.assertRaisesRegex(ValueError, "pagination conflict"):
                    client.index("DDInter1")
            self.assertFalse((Path(directory) / "indexes/DDInter1.json").exists())

    def test_multiple_source_details_are_preserved_with_distinct_texts_and_levels(self):
        html = """<table><tr><td>ID</td><td>DDInter1 and DDInter2</td></tr>
        <tr><td>Interaction</td><td>{}</td></tr></table>"""
        with tempfile.TemporaryDirectory() as directory:
            client = interactions.DDInterClient(Path(directory))
            index = {"DDInter2": [{"id": 11, "level": "Major"}, {"id": 12, "level": "Moderate"}]}
            with patch.object(client, "index", return_value=index), patch.object(client, "request",
                    side_effect=[html.format("First description"), html.format("Second description")]) as request:
                detail = client.detail("DDInter1|DDInter2")
                self.assertEqual(detail["popis"], "First description\n\nSecond description")
                self.assertEqual(detail["sourceLevels"], ["Major", "Moderate"])
                self.assertEqual(len(detail["zdroje"]), 2)
                self.assertEqual(client.detail("DDInter1|DDInter2"), detail)
                self.assertEqual(request.call_count, 2)


if __name__ == "__main__":
    unittest.main()
