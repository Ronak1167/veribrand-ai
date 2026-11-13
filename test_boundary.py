import urllib.request
import urllib.error
import json

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
        'http://localhost:3000/api/audit',
        data=payload.encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            status = resp.status
    except urllib.error.HTTPError as e:
        status = e.code
    
    if status == expected:
        print(f"PASS: {name} -> {status}")
    else:
        print(f"FAIL: {name} -> Got {status}, expected {expected}")
        all_passed = False

if all_passed:
    print("\nALL BOUNDARY TESTS PASSED PERFECTLY!")
else:
    raise SystemExit(1)
