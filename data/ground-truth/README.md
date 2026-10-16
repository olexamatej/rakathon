# Visual image reference labels

`image-mapping.json` maps every source photo by its repository-relative path.
It contains **AI visual annotations pending human review**, not independently
adjudicated clinical ground truth. No mobile-model predictions or OCR output were
used to label the images.

## Contents

- 307 package photos: visible name, strength and pack size.
- 28 list photos: visually identified sample-patient reference, printed medication
  rows, and separately transcribed handwritten rows and crossed-out names.
- Catalogue row links, including duplicate rows and missing/partial matches.
- Local SÚKL name/strength candidate codes, with pack-text matches separately.
- Source/image SHA-256 hashes and grouping keys for dataset splits.

List entries also link to `relatedPackageImageIds` where the catalogue name and
strength match. This does not imply matching pack size or a shared prescription.

`catalogueRows` contains the supplied workbook's reference values. These are not
image-derived labels. `excelRow` locates each record in the original workbook.
The other reference files are identified in `sources`, including their hashes.
Oncology regimens and interaction resources have no corresponding image collection
here and are not image-label targets.

## Use for calibration

Read `images[path].observations` for a package, or
`images[path].regions.printed.observations` / `.handwritten.observations` for a list.
Names retain visible brand qualifiers; strengths and schedules are strings.
This is field-level extraction data, not an exhaustive character-level transcript.
Spacing, case and punctuation are lightly normalized. No bounding boxes are supplied.

`null` means absent/not confidently transcribed, not zero. Package `schedule` is
always null: manufacturer directions and incidental handwriting were not treated
as patient prescriptions. Do not fill missing visual fields from the catalogue.

Handwritten `uncertainFields` must be excluded from strict scoring;
`strictScoringFields` enumerates the other available fields. A tentative value
remains in the record for review. Missing units stay missing. Clear disagreements
with printed text stay as written (e.g. Trittico 45 versus 75 mg, magnesium 0.5 mg
versus 0.5 g). The printed and handwritten lists are **two observations of one
list**, not a combined regimen.

`catalogue.rowIds` contains name-and-strength matches only. `nameOnlyRowIds`
requires review. Duplicate catalogue rows are preserved rather than arbitrarily
choosing one. SÚKL codes are **candidates**, not adjudicated product identifiers;
`selectedCode` is deliberately null. Do not treat source aliases, handwriting
substitutions, or name-only matches as evidence of therapeutic equivalence.

Before a locked evaluation, review the labels against the images and mark
`humanReviewed` only after actual review. Keep all regions of an image and all
members of a `splitGroup` in the same split. For unseen-product evaluation, also
keep product-linked list rows and package images together. No train/test split
has been assigned, so calibration data cannot silently become a held-out test set.

## Integrity check

From the repository root, run:

```sh
python3 data/ground-truth/validate.py
```

The check verifies complete image coverage, hashes, unique IDs, catalogue and
SÚKL references, patient-source row links, and exclusion of ambiguous handwriting
from strict scoring. It cannot establish visual transcription accuracy.
