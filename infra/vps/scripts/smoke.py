#!/usr/bin/env python3
"""Bounded synthetic roundtrip. Never print transfer codes, data or tokens."""
import base64
import json
import os
import sys
import urllib.error
import urllib.request
import uuid


def check(base, release):
    def request(path, method='GET', data=None, headers=None, expected=200):
        req = urllib.request.Request(base.rstrip('/') + path, method=method,
                                     data=None if data is None else json.dumps(data).encode(),
                                     headers={'Content-Type': 'application/json', **(headers or {})})
        with urllib.request.urlopen(req, timeout=15) as response:
            assert response.status == expected, 'Unexpected HTTP status'
            content = response.read(512 * 1024)
            return json.loads(content) if content and response.headers.get_content_type() == 'application/json' else content

    assert request('/release.json')['release'] == release, 'Frontend release mismatch'
    request('/')
    request('/api/health/live')
    request('/api/health/ready')
    encode = lambda value: base64.urlsafe_b64encode(value).decode().rstrip('=')
    envelope = {'format': 'pillgaze.medication-list', 'formatVersion': 1,
                'algorithm': 'A256GCM', 'nonce': encode(os.urandom(12)),
                'ciphertext': encode(os.urandom(32))}
    created = request('/api/v1/transfers', 'POST', {'envelope': envelope, 'expiresInSeconds': 60}, expected=201)
    payload = {'retrievalCode': created['retrievalCode']}
    headers = {'Idempotency-Key': str(uuid.uuid4())}
    redeemed = request('/api/v1/transfers/redeem', 'POST', payload, headers)
    assert redeemed['envelope'] == envelope, 'Roundtrip mismatch'
    assert request('/api/v1/transfers/redeem', 'POST', payload, headers) == redeemed, 'Idempotency mismatch'
    try:
        request('/api/v1/transfers/redeem', 'POST', payload, {'Idempotency-Key': str(uuid.uuid4())})
    except urllib.error.HTTPError as error:
        assert error.code == 404, 'Unexpected reuse status'
    else:
        raise AssertionError('Transfer was redeemed twice')


if __name__ == '__main__':
    try:
        check(sys.argv[1], sys.argv[2])
    except Exception:
        # Do not expose bearer tokens or unexpected server response bodies.
        raise SystemExit('Release smoke test FAILED (health, revision or synthetic roundtrip).')
    print('Release smoke test passed: frontend, API, roundtrip and single-use semantics.')
