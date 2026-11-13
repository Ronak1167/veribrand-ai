import urllib.request
import json

url = 'http://localhost:3000/api/audit'
payload = json.dumps({
    'text': 'Welcome to inkloom! We guarantee 99.999% uptime and $50M in ARR with legacy price $49/mo.',
    'channel': 'enterprise_web'
}).encode('utf-8')

req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))

print('=== REST API AUDIT ENDPOINT TEST ===')
print('HTTP Status:', resp.status)
print('Compliance Score:', data['complianceScore'], '/ 100')
print('Tier-1 Latency:', data['tier1LatencyMs'], 'ms')
print('Tier-2 Latency:', data['tier2LatencyMs'], 'ms')
print('Findings Count:', len(data['findings']))
for f in data['findings']:
    print(f"  [{f['verdict']}] \"{f['matchedText']}\" -> {f['guidelineTitle']}")
