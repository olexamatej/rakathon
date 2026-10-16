"""Rebuild SÚKL links from preserved visual labels; standard library only."""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
MAPPING = ROOT / 'data/ground-truth/image-mapping.json'


def name_key(value):
    value = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]', '', value.lower())


# Spelling/branding normalization only; never substitute another medicine.
NAME_ALIASES = {
    name_key('Helicid 20 Zentiva'): 'HELICID',
    name_key('Helicid Zentiva'): 'HELICID',
    name_key('Desloratadin Teva'): 'DESLORATADINE TEVA',
}
# Suggestions remain review-only: these labels omit a manufacturer/qualifier,
# contain a typo, or use an alternative name on the same handwritten row.
REVIEW_NAMES = {
    name_key('Baclofen'): ['BACLOFEN POLPHARMA'],
    name_key('Hydrochlorothiazid'): ['HYDROCHLOROTHIAZID LÉČIVA'],
    name_key('Kalium chloratum'): ['KALIUM CHLORATUM BIOMEDICA'],
    name_key('Preductal'): ['PREDUCTAL MR'],
    name_key('Cavinton'): ['CAVINTON FORTE'],
    name_key('Byofenac'): ['BIOFENAC'],
    name_key('Vessel Due'): ['VESSEL DUE F'],
    name_key('Magnesii lactici'): ['MAGNESII LACTICI 0,5 TBL. MEDICAMENTA'],
}
GENERIC_PREFIX_NAMES = {'febuxostat', 'omeprazol', 'gabapentin'}
SUPPLEMENTS = {name_key(n) for n in ['Pyridoxin', 'Pyridoxin Generica', 'Probiolact']}
MASS = {'g': Decimal('1000000'), 'mg': Decimal('1000'), 'ug': Decimal('1')}


def strength_text(value):
    value = (value or '').lower().replace('μ', 'u').replace('µ', 'u')
    value = value.replace('mikrogramů/hodinu', 'ug/h').replace('mikrogramů', 'ug').replace('mcg', 'ug')
    return re.sub(r'\s+', '', value.replace(',', '.'))


def quantity(number, unit):
    amount = Decimal(number)
    return (format((amount * MASS[unit]).normalize(), 'f'), 'ug') if unit in MASS else (format(amount.normalize(), 'f'), unit)


def strength_key(value):
    """Mass conversion preserves component order and concentration denominators."""
    text = strength_text(value)
    if not text:
        return None
    # Concentrations/rates must never be treated as combination strengths.
    concentration = re.fullmatch(r'(\d+(?:\.\d+)?)(g|mg|ug|iu|u|su|lsu)/(\d+(?:\.\d+)?)?(ml|l|h)', text)
    if concentration:
        number, unit, denominator, denominator_unit = concentration.groups()
        return ('rate', quantity(number, unit), str(Decimal(denominator or '1')), denominator_unit)
    parts = re.split(r'([/+])', text)
    quantities = parts[::2]
    parsed = [re.fullmatch(r'(\d+(?:\.\d+)?)(g|mg|ug|iu|u|su|lsu)?', part) for part in quantities]
    if all(parsed):
        last_unit = parsed[-1].group(2)
        if not last_unit:
            return None
        values = tuple(quantity(m.group(1), m.group(2) or last_unit) for m in parsed)
        return ('components', tuple(parts[1::2]), values)
    return ('literal', text)


def pack_key(value):
    # Preserve pack qualifiers: 30 I is not silently collapsed to 30.
    return re.sub(r'\s+', '', (value or '').upper().replace('×', 'X'))


class Matcher:
    def __init__(self, rows):
        self.by_name = defaultdict(list)
        for row in rows:
            self.by_name[name_key(row['name'])].append(row)

    def match(self, observation):
        name, strength = observation['name'], observation['strength']
        reasons = []
        normalized = NAME_ALIASES.get(name_key(name), name)
        if normalized != name:
            reasons.append('explicit_brand_or_spelling_alias')
        rows = self.by_name.get(name_key(normalized), [])
        review_name = False
        if not rows:
            suggestions = REVIEW_NAMES.get(name_key(name), [])
            if ' / ' in name:
                suggestions += name.split(' / ')
            rows = [row for candidate in suggestions for row in self.by_name.get(name_key(candidate), [])]
            review_name = bool(rows)
            if rows:
                reasons.append('incomplete_or_alternative_name_requires_review')
        if not rows and name.lower() in GENERIC_PREFIX_NAMES:
            rows = [row for group in self.by_name.values() for row in group
                    if row['name'].lower().startswith(name.lower() + ' ')]
            review_name = bool(rows)
            if rows:
                reasons.append('generic_name_matches_multiple_branded_names_requires_review')
        # The supplied labels sometimes include a strength suffix in a brand.
        if not rows:
            stripped = re.sub(r'\s+\d[\d ,.]*\s*(?:mg)?$', '', normalized, flags=re.I)
            if stripped != normalized:
                rows = self.by_name.get(name_key(stripped), [])
                if rows:
                    reasons.append('removed_strength_suffix_from_name')
        rows = list({r['suklCode']: r for r in rows}.values())
        base = {
            'status': None,
            'candidateCodes': [],
            'preferredCandidateCodes': [],
            'packTextMatchingCodes': [],
            'selectedCode': None,
            'nameCandidateCodes': sorted(r['suklCode'] for r in rows),
            'normalizedName': normalized,
            'matchBasis': [],
            'reviewReasons': reasons,
            'resolution': 'unresolved',
        }
        if 'strength' in observation['uncertainFields']:
            base['status'] = 'excluded_uncertain_strength'
            base['reviewReasons'].append('visual_strength_or_unit_uncertain')
            return base
        if not rows:
            base['status'] = 'not_in_local_dataset' if name_key(name) in SUPPLEMENTS else 'name_not_found'
            base['reviewReasons'].append('supplement_name_absent_from_local_sukl' if name_key(name) in SUPPLEMENTS else 'no_supported_name_match')
            return base
        key = strength_key(strength)
        exact = [r for r in rows if key is not None and strength_key(r['strength']) == key]
        if not exact:
            alternatives = [row for candidate in REVIEW_NAMES.get(name_key(name), [])
                            for row in self.by_name.get(name_key(candidate), [])
                            if key is not None and strength_key(row['strength']) == key]
            if alternatives:
                exact = alternatives
                base['nameCandidateCodes'] = sorted(set(base['nameCandidateCodes']) | {r['suklCode'] for r in alternatives})
                review_name = True
                reasons.append('different_name_qualifier_requires_review')
        candidates = exact
        if exact:
            base['status'] = 'review_candidates' if review_name else 'candidates'
            base['matchBasis'] = ['review_name' if review_name else 'normalized_name', 'normalized_strength']
        else:
            # Keep name-only evidence for records without structured strength.
            missing = [r for r in rows if not r['strength']]
            if name_key(name) == name_key('Kreon') and strength_text(strength).isdigit():
                candidates = [r for r in rows if strength_text(r['strength']) == strength_text(strength) + 'u']
                base['status'] = 'review_candidates'
                base['matchBasis'] = ['normalized_name', 'numeric_strength_only']
                base['reviewReasons'].append('U_unit_present_in_sukl_but_absent_from_visual_label')
            elif key is None or missing:
                candidates = missing or rows
                base['status'] = 'name_only_candidates'
                base['matchBasis'] = ['review_name' if review_name else 'normalized_name']
                base['reviewReasons'].append('source_strength_missing' if missing else 'visual_strength_or_unit_missing')
            elif name_key(name) == name_key('Vessel Due F'):
                candidates = [r for r in rows if strength_text(r['strength']) == strength_text(strength).replace('lsu', 'su')]
                base['status'] = 'review_candidates'
                base['matchBasis'] = ['normalized_name', 'product_specific_strength_notation']
                base['reviewReasons'].append('LSU_vs_SU_notation_requires_review')
            else:
                base['status'] = 'strength_mismatch'
                base['reviewReasons'].append('no_matching_strength_for_name')
        base['candidateCodes'] = sorted(r['suklCode'] for r in candidates)
        pack = observation['packSize']
        base['packTextMatchingCodes'] = sorted(r['suklCode'] for r in candidates if pack and pack_key(r['packSize']) == pack_key(pack))
        narrowed = base['packTextMatchingCodes'] if pack else base['candidateCodes']
        if pack and candidates and not narrowed:
            base['resolution'] = 'pack_mismatch'
            base['reviewReasons'].append('no_candidate_with_matching_pack_text')
        elif base['status'] == 'candidates' and len(narrowed) == 1:
            base['resolution'] = 'unique_metadata_candidate'
        elif base['status'] == 'candidates' and narrowed:
            base['resolution'] = 'multiple_metadata_candidates'
        elif candidates:
            base['resolution'] = 'needs_review'
        base['preferredCandidateCodes'] = narrowed
        # Selection is reserved for adjudication; metadata uniqueness is not review.
        return base


def observations(record):
    if record['kind'] == 'medication_package':
        yield 'package', record['observations']
    else:
        for region, content in record['regions'].items():
            yield region, content['observations']


def refine(data, rows):
    matcher = Matcher(rows)
    counts = defaultdict(Counter)
    for record in data['images'].values():
        for region, items in observations(record):
            for item in items:
                item['sukl'] = matcher.match(item)
                counts[region][item['sukl']['status']] += 1
    data['schemaVersion'] = '1.1.0'
    data['annotationPolicy']['suklMatching'] = (
        'Rebuilt by data/ground-truth/refine_matching.py. Explicit branding/spelling aliases; '
        'mass conversion and shared trailing units supported. Component order and concentration '
        'denominators preserved. No substitution of active substances or printed values for visual labels. '
        'Name-only and inferred-notation candidates require review. Pack-text matching narrows candidates; '
        'dosage form is not inferred from the reference catalogue. selectedCode remains null pending adjudication.'
    )
    data['suklMatchingSummary'] = {group: dict(counts[group]) for group in sorted(counts)}
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify saved matching is reproducible without writing.')
    args = parser.parse_args()
    data = json.loads(MAPPING.read_text())
    source = ROOT / 'data/sukl/medications.json'
    expected_hash = next(s['sha256'] for s in data['sources'] if s['path'] == 'data/sukl/medications.json')
    if hashlib.sha256(source.read_bytes()).hexdigest() != expected_hash:
        raise ValueError('SÚKL source changed; review the source version before rebuilding links.')
    updated = refine(json.loads(json.dumps(data)), json.loads(source.read_text()))
    if args.check:
        if updated != data:
            raise ValueError('Saved matching differs from the reproducible matcher output.')
    else:
        MAPPING.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(updated['suklMatchingSummary'], indent=2))


if __name__ == '__main__':
    main()
