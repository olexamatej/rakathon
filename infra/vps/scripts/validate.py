#!/usr/bin/env python3
"""Semantic deployment assertions, not fragile grep over YAML indentation."""
import sys
import yaml

objects = list(yaml.safe_load_all(open(sys.argv[1])))
deployments = {o['metadata']['name']: o for o in objects if o['kind'] == 'Deployment'}
assert set(deployments) == {'rakathon-api', 'rakathon-web'}
assert not any(o['kind'] in {'Secret', 'PersistentVolume', 'PersistentVolumeClaim'} for o in objects)
for obj in deployments.values():
    spec = obj['spec']['template']['spec']
    assert obj['spec']['replicas'] == 1
    assert spec['automountServiceAccountToken'] is False
    assert not spec.get('hostNetwork') and not spec.get('hostPID')
    assert not any('hostPath' in volume for volume in spec['volumes'])
    assert spec['nodeSelector']['kubernetes.io/arch'] == 'arm64'
    assert spec['securityContext']['runAsNonRoot'] is True
    assert spec['securityContext']['seccompProfile']['type'] == 'RuntimeDefault'
    for container in spec['containers']:
        security = container['securityContext']
        assert security['readOnlyRootFilesystem'] is True
        assert security['allowPrivilegeEscalation'] is False
        assert security['capabilities']['drop'] == ['ALL']
        assert container['imagePullPolicy'] == 'Never'
        assert container['resources']['limits']['memory']
        assert container['readinessProbe'] and container['livenessProbe']
api = deployments['rakathon-api']
assert api['spec']['strategy']['type'] == 'Recreate'
env = api['spec']['template']['spec']['containers'][0]['env']
hmac = next(e for e in env if e['name'] == 'TRANSFER_HMAC_SECRET')
assert 'value' not in hmac and hmac['valueFrom']['secretKeyRef']['name'] == 'rakathon-hmac'
services = [o for o in objects if o['kind'] == 'Service']
assert next(o for o in services if o['metadata']['name'] == 'rakathon-api')['spec'].get('type', 'ClusterIP') == 'ClusterIP'
assert next(o for o in services if o['metadata']['name'] == 'rakathon-web')['spec']['ports'][0]['nodePort'] == 30080
assert len([o for o in objects if o['kind'] == 'NetworkPolicy']) == 2
print('Deployment invariants passed: isolation, persistence separation, hardening, probes and private API.')
