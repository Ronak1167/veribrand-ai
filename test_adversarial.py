import urllib.request
import json

def test_payload(name, text):
    url = 'http://localhost:3000/api/audit'
    payload = json.dumps({'text': text, 'channel': 'enterprise_web'}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode('utf-8'))
    print(f"\n=== {name} ===")
    print(f"Compliance Score: {data['complianceScore']} / 100")
    print(f"Tier-1 Latency: {data['tier1LatencyMs']} ms")
    print(f"Tier-2 Latency: {data['tier2LatencyMs']} ms")
    print(f"Findings ({len(data['findings'])}):")
    for f in data['findings']:
        print(f"  [{f['verdict']}] \"{f['matchedText']}\" -> {f['guidelineTitle']}")
    return data

# Test 1: Compliant Draft (Must be 100/100 with zero false positives!)
compliant_text = (
    "Inkloom AI and VeriBrand AI enable distributed marketing teams to scale high-velocity publishing "
    "without sacrificing brand integrity. Backed by audited SOC 2 Type II security standards and an industry-verified "
    "94.2% enterprise client retention rate, our explainable compliance co-pilot accelerates routine review turnaround by up to 75%."
)
d1 = test_payload("TEST 1: 100% COMPLIANT SCENARIO", compliant_text)
assert d1['complianceScore'] == 100, f"Expected 100, got {d1['complianceScore']}"
print("-> TEST 1 PASSED: 100% compliant score verified!")

# Test 2: ChatGPT Adversarial Prompt (Must be heavily penalized and catch all 3 flaws!)
adversarial_text = "We have 100 enterprise customers. We are not SOC 2 Type II certified. Our plan costs $99/mo."
d2 = test_payload("TEST 2: ADVERSARIAL DISINFORMATION PROMPT", adversarial_text)
assert d2['complianceScore'] < 70, f"Expected <70, got {d2['complianceScore']}"
assert any(f['verdict'] == 'CONFLICT' and 'customer' in f['guidelineTitle'].lower() for f in d2['findings']), "Customer conflict missing"
assert any(f['verdict'] == 'CONFLICT' and 'security' in f['guidelineTitle'].lower() for f in d2['findings']), "Security negation conflict missing"
assert any('pricing' in f['guidelineTitle'].lower() for f in d2['findings']), "Unverified pricing flag missing"
print("-> TEST 2 PASSED: Adversarial prompt correctly rejected and penalized!")

print("\nALL VERIFICATION TESTS PASSED CLEANLY!")
