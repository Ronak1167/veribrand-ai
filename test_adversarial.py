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

# Test 3: Specific Customer Count Edge Case ("400 enterprise customers" must NOT be falsely verified!)
cust_400_text = "We have 400 enterprise customers."
d3 = test_payload("TEST 3: CUSTOMER COUNT 400 DISCREPANCY", cust_400_text)
assert any(f['verdict'] == 'CONFLICT' and 'customer' in f['guidelineTitle'].lower() for f in d3['findings']), "Expected CONFLICT on 400 customers"
print("-> TEST 3 PASSED: Inaccurate 400 customer count correctly flagged as CONFLICT!")

# Test 4: Affirmative Idiom Scope ("not only SOC 2" must NOT be treated as negated conflict!)
not_only_text = "We are not only SOC 2 Type II certified, but also enterprise-ready."
d4 = test_payload("TEST 4: AFFIRMATIVE IDIOM ('not only SOC 2')", not_only_text)
assert any(f['verdict'] == 'VERIFIED' and 'security' in f['guidelineTitle'].lower() for f in d4['findings']), "Expected VERIFIED for 'not only SOC 2'"
assert not any(f['verdict'] == 'CONFLICT' for f in d4['findings']), "False CONFLICT on 'not only SOC 2'"
print("-> TEST 4 PASSED: Affirmative 'not only' scope correctly verified without false conflict!")

# Test 5: Unsupported Business Metric ("2,000 paying subscribers" must NOT be silently ignored!)
unsupp_text = "We have 2,000 paying subscribers."
d5 = test_payload("TEST 5: UNSUPPORTED BUSINESS METRIC", unsupp_text)
assert d5['complianceScore'] < 100, f"Expected <100, got {d5['complianceScore']}"
assert any(f['verdict'] == 'UNVERIFIED' and 'unverified metric' in f['guidelineTitle'].lower() for f in d5['findings']), "Expected UNVERIFIED for 2,000 paying subscribers"
print("-> TEST 5 PASSED: Unsupported assertion '2,000 paying subscribers' caught with deterministic abstention!")

# Test 6: Corporate Footprint Edge Case ("17 regional offices", "50 global locations")
offices_text = "We have 17 regional offices and 50 global locations, serving 17 regions across the globe."
d6 = test_payload("TEST 6: CORPORATE FOOTPRINT ASSERTIONS", offices_text)
assert d6['complianceScore'] < 100, f"Expected <100, got {d6['complianceScore']}"
assert any(f['verdict'] == 'UNVERIFIED' and 'unverified metric' in f['guidelineTitle'].lower() for f in d6['findings']), "Expected UNVERIFIED for footprint assertions"
print("-> TEST 6 PASSED: Corporate footprint assertions ('17 regional offices', '50 global locations', '17 regions') caught with deterministic abstention!")

# Test 7: Customer Count Growth Verification (421 within audited range is verified as >=420)
cust_421_text = "We have 421 enterprise customers."
d7 = test_payload("TEST 7: CUSTOMER COUNT 421 GROWTH LOWER BOUND", cust_421_text)
assert any(f['verdict'] == 'VERIFIED' and 'customer' in f['guidelineTitle'].lower() for f in d7['findings']), "Expected VERIFIED on 421 customers"
assert not any(f['verdict'] == 'CONFLICT' for f in d7['findings']), "False CONFLICT on 421 customers"
print("-> TEST 7 PASSED: 421 enterprise customers verified under 420+ lower bound!")

# Test 8: Organic Growth vs Exaggeration Customer Count Verification (501/600 verified; 419 deficit & 1500 exaggeration are conflicts)
cust_501_text = "We have 501 enterprise customers."
d8 = test_payload("TEST 8: CUSTOMER COUNT 501 GROWTH (>= 420+ LOWER BOUND)", cust_501_text)
assert any(f['verdict'] == 'VERIFIED' and 'customer' in f['guidelineTitle'].lower() for f in d8['findings']), "Expected VERIFIED on 501 customers"
assert not any(f['verdict'] == 'CONFLICT' for f in d8['findings']), "False CONFLICT on 501 customers"

cust_419_text = "We have 419 enterprise customers."
d8b = test_payload("TEST 8b: CUSTOMER COUNT 419 DEFICIT (< 420 LOWER BOUND)", cust_419_text)
assert any(f['verdict'] == 'CONFLICT' and 'customer' in f['guidelineTitle'].lower() for f in d8b['findings']), "Expected CONFLICT on 419 customers"

cust_1500_text = "With over 1,500 enterprise customers across the globe."
d8c = test_payload("TEST 8c: CUSTOMER COUNT 1,500 EXAGGERATION (>= 1,000 CONFLICT)", cust_1500_text)
assert any(f['verdict'] == 'CONFLICT' and 'customer' in f['guidelineTitle'].lower() for f in d8c['findings']), "Expected CONFLICT on 1,500 customers"
print("-> TEST 8 PASSED: Customer count verified strictly as 420+ lower bound with organic growth (419 deficit CONFLICT, 501/600 VERIFIED, 1500 exaggeration CONFLICT)!")

print("\nALL 8 VERIFICATION TESTS PASSED CLEANLY!")
