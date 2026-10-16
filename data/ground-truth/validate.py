"""Validate dataset integrity without third-party dependencies."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    return hashlib.sha256((ROOT / path).read_bytes()).hexdigest()


def main():
    data = json.loads((ROOT / "data/ground-truth/image-mapping.json").read_text())
    images = data["images"]
    expected = {
        str(p.relative_to(ROOT))
        for folder in ("Leky_foto", "Seznamy_foto")
        for p in (ROOT / "assets/Data" / folder).glob("*.jpg")
    }
    assert set(images) == expected, "Missing or unexpected image records"
    assert len({v["id"] for v in images.values()}) == len(images)
    package_ids = {
        v["id"] for v in images.values() if v["kind"] == "medication_package"
    }
    catalogue = {r["id"] for r in data["catalogueRows"]}
    sukl = {
        r["suklCode"]
        for r in json.loads((ROOT / "data/sukl/medications.json").read_text())
    }
    source_lines = (ROOT / "assets/Data/50_Pacientu.md").read_text().splitlines()
    counts = {"medication_package": 0, "medication_list": 0}
    printed_count = handwritten_count = uncertain_count = 0
    for source in data["sources"]:
        assert digest(source["path"]) == source["sha256"], source["path"]
    for path, record in images.items():
        assert digest(path) == record["sha256"], path
        assert record["splitGroup"]
        counts[record["kind"]] += 1
        if record["kind"] == "medication_package":
            observations = record["observations"]
            assert len(observations) == 1
            assert observations[0]["schedule"] is None
        else:
            printed = record["regions"]["printed"]["observations"]
            handwritten = record["regions"]["handwritten"]["observations"]
            printed_count += len(printed)
            handwritten_count += len(handwritten)
            for item in printed:
                assert source_lines[item["sourceLine"] - 1] == item["sourceText"]
                preceding = source_lines[:item["sourceLine"]]
                heading = [line for line in preceding if line.startswith("Pacient ")][-1]
                assert int(heading.split()[1]) == record["patientReference"]["patientNumber"]
            for item in handwritten:
                assert 1 <= item["correspondingPrintedRow"] <= len(printed)
                assert not set(item["uncertainFields"]) & set(item["strictScoringFields"])
                assert all(item[field] is not None for field in item["strictScoringFields"])
                uncertain_count += len(item["uncertainFields"])
                if "strength" in item["uncertainFields"]:
                    assert not item["sukl"]["candidateCodes"]
            observations = printed + handwritten
        for item in observations:
            assert item["name"]
            assert set(item.get("relatedPackageImageIds", [])) <= package_ids
            assert set(item["catalogue"]["rowIds"]) <= catalogue
            assert set(item["catalogue"]["nameOnlyRowIds"]) <= catalogue
            assert set(item["sukl"]["candidateCodes"]) <= sukl
            assert set(item["sukl"]["nameCandidateCodes"]) <= sukl
            assert set(item["sukl"]["preferredCandidateCodes"]) <= set(item["sukl"]["candidateCodes"])
            assert set(item["sukl"]["packTextMatchingCodes"]) <= set(item["sukl"]["candidateCodes"])
            assert item["sukl"]["selectedCode"] is None
            if item["sukl"]["resolution"] == "unique_metadata_candidate":
                assert item["sukl"]["status"] == "candidates"
                assert len(item["sukl"]["preferredCandidateCodes"]) == 1
    assert counts["medication_package"] == data["summary"]["packageImages"]
    assert counts["medication_list"] == data["summary"]["listImages"]
    assert len(images) == data["summary"]["totalImages"]
    assert printed_count == data["summary"]["printedMedicationRows"]
    assert handwritten_count == data["summary"]["handwrittenMedicationRows"]
    assert uncertain_count == data["summary"]["uncertainHandwrittenFields"]
    print(f"Validated {len(images)} images, {printed_count} printed rows, "
          f"{handwritten_count} handwritten rows; {uncertain_count} uncertain fields excluded.")


if __name__ == "__main__":
    main()
