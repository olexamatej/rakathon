import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('unpack', pathlib.Path(__file__).parents[1] / 'scripts/unpack-release.py')
unpack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(unpack)
REVISION = 'a' * 40
RELEASE = REVISION + '-123-1'


def archive(items, compressed=False):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:gz' if compressed else 'w') as tar:
        for name, data in items:
            member = tarfile.TarInfo(name)
            if data is None:
                member.type = tarfile.SYMTYPE
                member.linkname = '/etc/passwd'
                tar.addfile(member)
            else:
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
    return output.getvalue()


def bundle(architecture='arm64', revision=REVISION, tag=RELEASE):
    images = []
    for name in ('api', 'web'):
        manifest = [{'RepoTags': [f'rakathon-{name}:{tag}'], 'Config': 'config.json'}]
        images.append((f'{name}.tar', archive([
            ('manifest.json', json.dumps(manifest).encode()),
            ('config.json', json.dumps({'architecture': architecture, 'os': 'linux'}).encode())])))
    return images + [('release.json', json.dumps({'release': RELEASE, 'revision': revision}).encode())]


class BundleTests(unittest.TestCase):
    def extract(self, items):
        with tempfile.TemporaryDirectory() as directory:
            pathlib.Path(directory, 'bundle.tgz').write_bytes(archive(items, True))
            return unpack.unpack(directory)

    def test_valid_arm64_pair(self):
        self.assertEqual(self.extract(bundle())['release'], RELEASE)

    def test_path_traversal(self):
        with self.assertRaises(ValueError):
            self.extract(bundle() + [('../../etc/sudoers', b'bad')])

    def test_symlink(self):
        with self.assertRaises(ValueError):
            self.extract([('api.tar', None), *bundle()[1:]])

    def test_duplicate(self):
        with self.assertRaises(ValueError):
            self.extract(bundle() + [('release.json', b'{}')])

    def test_wrong_architecture(self):
        with self.assertRaises(ValueError):
            self.extract(bundle(architecture='amd64'))

    def test_wrong_revision(self):
        with self.assertRaises(ValueError):
            self.extract(bundle(revision='b' * 40))

    def test_wrong_tag(self):
        with self.assertRaises(ValueError):
            self.extract(bundle(tag='latest'))
