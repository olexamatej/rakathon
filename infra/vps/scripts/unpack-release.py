#!/usr/bin/env python3
"""Strictly extract an image-only CI bundle; never unpack caller paths as root."""
import json
import pathlib
import re
import tarfile

LIMIT = 750 * 1024 * 1024


def unpack(root):
    root = pathlib.Path(root)
    if (root / 'bundle.tgz').stat().st_size > LIMIT:
        raise ValueError('Bundle exceeds size limit')
    with tarfile.open(root / 'bundle.tgz', 'r:gz') as archive:
        members = []
        for member in archive:
            members.append(member)
            if len(members) > 3 or not member.isfile() or member.size > LIMIT:
                raise ValueError('Invalid bundle members/types/size')
        if {m.name for m in members} != {'api.tar', 'web.tar', 'release.json'} or len(members) != 3:
            raise ValueError('Invalid bundle members')
        if any(not m.isfile() or m.size > LIMIT for m in members) or sum(m.size for m in members) > LIMIT:
            raise ValueError('Invalid bundle types/size')
        for member in members:
            with archive.extractfile(member) as source, (root / member.name).open('wb') as dest:
                while chunk := source.read(1024 * 1024):
                    dest.write(chunk)
    if (root / 'release.json').stat().st_size > 4096:
        raise ValueError('Oversized release metadata')
    meta = json.loads((root / 'release.json').read_text())
    if set(meta) != {'release', 'revision'} or not re.fullmatch(r'[a-f0-9]{40}-[0-9]+-[0-9]+', meta['release']):
        raise ValueError('Invalid release metadata')
    if meta['revision'] != meta['release'].split('-')[0]:
        raise ValueError('Revision mismatch')
    for name in ('api', 'web'):
        with tarfile.open(root / f'{name}.tar') as image:
            if image.getmember('manifest.json').size > 1024 * 1024:
                raise ValueError('Oversized image manifest')
            manifest = json.load(image.extractfile('manifest.json'))
            if len(manifest) != 1 or manifest[0]['RepoTags'] != [f'rakathon-{name}:{meta["release"]}']:
                raise ValueError('Unexpected image tag')
            if image.getmember(manifest[0]['Config']).size > 1024 * 1024:
                raise ValueError('Oversized image config')
            config = json.load(image.extractfile(manifest[0]['Config']))
            if config.get('architecture') != 'arm64' or config.get('os') != 'linux':
                raise ValueError('Only Linux ARM64 releases are accepted')
    return meta


if __name__ == '__main__':
    import signal
    import sys
    signal.alarm(120)
    try:
        unpack(sys.argv[1])
    except Exception:
        raise SystemExit('Invalid release bundle; nothing deployed.')
