import json
import os
import urllib.error
import urllib.request
from pathlib import Path

BASE_URL = os.environ.get('VERIBRAND_URL', 'http://localhost:3000')
env = {}
for line in Path('.env.test.local').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
login = urllib.request.Request(
    f'{BASE_URL}/api/auth/login',
    data=json.dumps({
        'email': env.get('VERIBRAND_TEST_ADMIN_EMAIL'),
        'password': env.get('VERIBRAND_TEST_ADMIN_PASSWORD'),
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
)
with urllib.request.urlopen(login) as response:
    COOKIE = response.headers.get('Set-Cookie', '').split(';', 1)[0]
if not COOKIE.startswith('veribrand_session='):
    raise RuntimeError('Test login did not issue a session cookie.')

tests = [
    ('Null body', 'null', 400),
    ('Array body', '[]', 400),
    ('String body', '"just a string"', 400),
    ('Missing text', json.dumps({'channel': 'linkedin'}), 400),
    ('Empty text', json.dumps({'text': '   '}), 400),
    ('Numeric channel', json.dumps({'text': 'test', 'channel': 123}), 400),
    ('Null channel', json.dumps({'text': 'test', 'channel': None}), 400),
    ('Empty channel', json.dumps({'text': 'test', 'channel': ''}), 400),
    ('Invalid string channel', json.dumps({'text': 'test', 'channel': 'fake_channel'}), 400),
    ('Valid channel', json.dumps({'text': 'test content', 'channel': 'linkedin'}), 200),
    ('Omitted channel', json.dumps({'text': 'test content'}), 200),
]

all_passed = True
for name, payload, expected in tests:
    req = urllib.request.Request(
        f'{BASE_URL}/api/audit',
        data=payload.encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Cookie': COOKIE},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
    except urllib.error.HTTPError as error:
        status = error.code

    if status == expected:
        print(f'PASS: {name} -> {status}')
    else:
        print(f'FAIL: {name} -> Got {status}, expected {expected}')
        all_passed = False

if all_passed:
    print('\nALL BOUNDARY TESTS PASSED PERFECTLY!')
else:
    raise SystemExit(1)
