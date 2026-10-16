import pathlib
import unittest
import yaml

ROOT = pathlib.Path(__file__).parents[3]


class StaticTests(unittest.TestCase):
    def test_master_release_trigger_without_path_filter(self):
        workflow = yaml.safe_load((ROOT / '.github/workflows/vps-deploy.yml').read_text())
        trigger = workflow.get('on', workflow.get(True))
        self.assertEqual(trigger['push']['branches'], ['master'])
        self.assertNotIn('paths', trigger['push'])
        jobs = workflow['jobs']
        self.assertEqual(jobs['build']['needs'], ['checks', 'validate'])
        self.assertEqual(jobs['deploy']['needs'], 'build')
        self.assertEqual(jobs['deploy']['environment'], 'vps-production')

    def test_both_image_builds(self):
        workflow = (ROOT / '.github/workflows/vps-deploy.yml').read_text()
        self.assertIn('file: services/transfer-api/Dockerfile', workflow)
        self.assertIn('file: infra/vps/web.Dockerfile', workflow)
        self.assertEqual(workflow.count('outputs: type=docker,dest=bundle/'), 2)

    def test_no_active_azure_workflow(self):
        self.assertFalse((ROOT / '.github/workflows/container-deploy.yml').exists())

    def test_private_control_plane(self):
        source = (ROOT / 'infra/vps/scripts/bootstrap.sh').read_text()
        config = yaml.safe_load(source.split('<<YAML\n', 1)[1].split('\nYAML', 1)[0])
        self.assertEqual(config['bind-address'], '172.20.0.1')
        self.assertEqual(config['advertise-address'], '172.20.0.1')
        self.assertIn('nodeport-addresses=172.20.0.1/32', config['kube-proxy-arg'])
        self.assertIn('address=172.20.0.1', config['kubelet-arg'])
        self.assertIn('traefik', config['disable'])
        self.assertIn('servicelb', config['disable'])
        self.assertTrue(config['secrets-encryption'])

    def test_persistence_outside_helm(self):
        resources = list(yaml.safe_load_all((ROOT / 'infra/vps/persistence.yaml').read_text()))
        pv = next(obj for obj in resources if obj['kind'] == 'PersistentVolume')
        self.assertEqual(pv['spec']['persistentVolumeReclaimPolicy'], 'Retain')
        self.assertEqual(pv['spec']['local']['path'], '/var/lib/rakathon/data')

    def test_api_embedded_demo_in_build_context(self):
        source = (ROOT / 'services/transfer-api/Dockerfile').read_text()
        self.assertIn('COPY apps/transfer-demo /build/apps/transfer-demo', source)
