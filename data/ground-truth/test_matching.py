"""Synthetic regression cases for identity matching; no patient data or images."""
import unittest
from refine_matching import Matcher, refine, strength_key, equivalent_pack_key


def row(code, name, strength, pack='30'):
    return {'suklCode': code, 'name': name, 'strength': strength, 'packSize': pack}


def observation(name, strength, pack=None, uncertain=False):
    return {'name': name, 'strength': strength, 'packSize': pack,
            'uncertainFields': ['strength'] if uncertain else []}


class StrengthTests(unittest.TestCase):
    def test_equivalent_mass_units(self):
        self.assertEqual(strength_key('175 mg/175 mg'), strength_key('0,175G/0,175G'))
        self.assertEqual(strength_key('0.5 g'), strength_key('500MG'))
        self.assertEqual(strength_key('100 mikrogramů'), strength_key('0.1MG'))

    def test_shared_unit(self):
        self.assertEqual(strength_key('75/25 mg'), strength_key('75MG/25MG'))

    def test_order_and_operator_preserved(self):
        self.assertNotEqual(strength_key('10mg/20mg'), strength_key('20mg/10mg'))
        self.assertNotEqual(strength_key('10mg+20mg'), strength_key('10mg/20mg'))

    def test_concentration_not_combination(self):
        self.assertNotEqual(strength_key('10mg/ml'), strength_key('10mg'))
        self.assertNotEqual(strength_key('10mg/2ml'), strength_key('10mg/ml'))

    def test_missing_units_not_assumed(self):
        self.assertIsNone(strength_key('25 000'))
        self.assertIsNone(strength_key(None))
        self.assertNotEqual(strength_key('600/400 IU'), strength_key('600mg/400IU'))

    def test_unit_error_not_corrected(self):
        self.assertNotEqual(strength_key('0.5mg'), strength_key('0.5g'))
        self.assertNotEqual(strength_key('250LSU'), strength_key('250SU'))


class PromotionTests(unittest.TestCase):
    def test_only_unique_packages_promoted(self):
        package = observation('Example', '5mg', '30')
        printed = observation('Example', '5mg', '30')
        data = {'annotationPolicy': {}, 'images': {
            'package.jpg': {'kind': 'medication_package', 'humanReviewed': False,
                            'observations': [package]},
            'list.jpg': {'kind': 'medication_list', 'regions': {
                'printed': {'observations': [printed]}}},
        }}
        refine(data, [row('01', 'Example', '5MG')])
        self.assertEqual(package['sukl']['selectedCode'], '01')
        self.assertEqual(package['sukl']['selectionMethod'], 'automatic_unique_metadata_candidate')
        self.assertFalse(data['images']['package.jpg']['humanReviewed'])
        self.assertIsNone(printed['sukl']['selectedCode'])

    def test_ambiguous_partial_and_pack_mismatch_not_promoted(self):
        cases = [observation('Example', '5mg', '30'),
                 observation('Example', '5mg', '90'),
                 observation('Example', '5mg', uncertain=True),
                 observation('Lagosa', None, '30'),
                 observation('Kreon', '25000', '30')]
        data = {'annotationPolicy': {}, 'images': {
            str(i): {'kind': 'medication_package', 'observations': [item]}
            for i, item in enumerate(cases)}}
        refine(data, [row('01', 'Example', '5MG'), row('02', 'Example', '5MG'),
                      row('03', 'Lagosa', None), row('04', 'Kreon', '25000U')])
        self.assertTrue(all(item['sukl']['selectedCode'] is None for item in cases))


class MatcherTests(unittest.TestCase):
    def test_equivalent_pack_notation(self):
        m = Matcher([row('01', 'Example', '5MG', '20(2X10)')])
        result = m.match(observation('Example', '5mg', '20'))
        self.assertEqual(result['resolution'], 'unique_metadata_candidate')
        self.assertEqual(result['packTextMatchingCodes'], [])
        self.assertEqual(result['packEquivalentMatchingCodes'], ['01'])
        self.assertIn('equivalent_pack_notation', result['matchBasis'])
        self.assertEqual(equivalent_pack_key('1 x 1 + 1 x 2'), equivalent_pack_key('1+2'))

    def test_pack_variants_remain_ambiguous(self):
        m = Matcher([row('01', 'Example', '5MG', '60(3X20)'),
                     row('02', 'Example', '5MG', '60(6X10)')])
        self.assertEqual(m.match(observation('Example', '5mg', '60'))['resolution'],
                         'multiple_metadata_candidates')
        self.assertEqual(m.match(observation('Example', '5mg', '60(3X20)'))['preferredCandidateCodes'],
                         ['01'])
        # Even an exact textual candidate cannot hide an equivalent alternative.
        m = Matcher([row('01', 'Example', '5MG', '60'),
                     row('02', 'Example', '5MG', '60(6X10)')])
        self.assertEqual(m.match(observation('Example', '5mg', '60'))['preferredCandidateCodes'],
                         ['01', '02'])

    def test_pack_qualifiers_and_unit_dose_preserved(self):
        for value in ['20 I', '20 II', '20X1', '20(2X11)', '20(20X1)']:
            self.assertNotEqual(equivalent_pack_key(value), equivalent_pack_key('20'))
        self.assertNotEqual(equivalent_pack_key('1+2'), equivalent_pack_key('2+1'))

    def test_helicid_alias(self):
        m = Matcher([row('01', 'HELICID', '20MG')])
        result = m.match(observation('Helicid 20 Zentiva', '20mg', '30'))
        self.assertEqual(result['candidateCodes'], ['01'])
        self.assertEqual(result['resolution'], 'unique_metadata_candidate')
        self.assertIsNone(result['selectedCode'])

    def test_pack_narrows_but_does_not_select(self):
        m = Matcher([row('01', 'Example', '5MG'), row('02', 'Example', '5MG', '60')])
        result = m.match(observation('Example', '5mg', '60'))
        self.assertEqual(result['candidateCodes'], ['01', '02'])
        self.assertEqual(result['preferredCandidateCodes'], ['02'])
        self.assertIsNone(result['selectedCode'])

    def test_ambiguous_and_missing_pack(self):
        m = Matcher([row('01', 'Example', '5MG'), row('02', 'Example', '5MG')])
        self.assertEqual(m.match(observation('Example', '5mg', '30'))['resolution'], 'multiple_metadata_candidates')
        self.assertEqual(m.match(observation('Example', '5mg', '90'))['resolution'], 'pack_mismatch')

    def test_missing_source_strength_is_partial(self):
        m = Matcher([row('01', 'Example', None)])
        self.assertEqual(m.match(observation('Example', '5mg'))['status'], 'name_only_candidates')

    def test_uncertain_strength_is_excluded(self):
        m = Matcher([row('01', 'Example', '5MG')])
        result = m.match(observation('Example', '5g', uncertain=True))
        self.assertEqual(result['candidateCodes'], [])
        self.assertEqual(result['nameCandidateCodes'], ['01'])
        self.assertEqual(result['status'], 'excluded_uncertain_strength')

    def test_generic_names_require_review(self):
        m = Matcher([row('01', 'GABAPENTIN EXAMPLE', '300MG')])
        self.assertEqual(m.match(observation('Gabapentin', '300mg'))['status'], 'review_candidates')

    def test_qualifier_suggestion_requires_review(self):
        m = Matcher([row('01', 'CAVINTON', '5MG'), row('02', 'CAVINTON FORTE', '10MG')])
        result = m.match(observation('Cavinton', '10mg'))
        self.assertEqual(result['candidateCodes'], ['02'])
        self.assertEqual(result['status'], 'review_candidates')

    def test_supplement_not_mapped_to_another_product(self):
        m = Matcher([row('01', 'PYRIDOXIN LÉČIVA', '20MG')])
        result = m.match(observation('Pyridoxin Generica', '20mg'))
        self.assertEqual(result['status'], 'not_in_local_dataset')
        self.assertEqual(result['candidateCodes'], [])

    def test_unsupported_strength_stays_unmatched(self):
        m = Matcher([row('01', 'Example', '75MG')])
        self.assertEqual(m.match(observation('Example', '45mg'))['status'], 'strength_mismatch')

    def test_kreon_missing_unit_and_vessel_notation_need_review(self):
        m = Matcher([row('01', 'KREON', '25000U'), row('02', 'VESSEL DUE F', '250SU')])
        self.assertEqual(m.match(observation('Kreon', '25 000'))['status'], 'review_candidates')
        self.assertEqual(m.match(observation('Vessel Due F', '250LSU'))['status'], 'review_candidates')


if __name__ == '__main__':
    unittest.main()
