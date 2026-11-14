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
    "without sacrificing brand integrity. Backed by audited SOC 2 Type II security standards and an audited "
    "94.2% enterprise client retention rate, our explainable compliance co-pilot targets accelerating routine review turnaround by up to 75%."
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

# Test 7: Customer Count Lower-Bound Verification ("420+ enterprise customers", "at least 420 enterprise customer accounts")
cust_420_text = "We have 420+ enterprise customers and serve at least 420 enterprise customer accounts."
d7 = test_payload("TEST 7: CUSTOMER COUNT 420+ LOWER BOUND VERIFICATION", cust_420_text)
assert any(f['verdict'] == 'VERIFIED' and 'customer' in f['guidelineTitle'].lower() for f in d7['findings']), "Expected VERIFIED on 420+ customers"
assert not any(f['verdict'] == 'CONFLICT' for f in d7['findings']), "False CONFLICT on 420+ customers"
print("-> TEST 7 PASSED: 420+ and at least 420 enterprise customers verified under audited lower bound!")

# Test 8: Exact Counts (421, 501, 600) vs Deficit (419) vs Exaggeration (1,500)
# 8a: Exact count 421 lacks audit proof -> UNVERIFIED (not CONFLICT, but requires audit certification)
cust_421_text = "We have 421 enterprise customers."
d8a = test_payload("TEST 8a: EXACT CUSTOMER COUNT 421 (UNVERIFIED EXACT COUNT)", cust_421_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'exact customer count' in f['guidelineTitle'].lower() for f in d8a['findings']), "Expected UNVERIFIED for exact 421 count"
assert not any(f['verdict'] == 'CONFLICT' for f in d8a['findings']), "False CONFLICT on exact 421 count"

# 8b: Exact count 600 lacks audit proof -> UNVERIFIED
cust_600_text = "We have 600 enterprise customers."
d8b = test_payload("TEST 8b: EXACT CUSTOMER COUNT 600 (UNVERIFIED EXACT COUNT)", cust_600_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'exact customer count' in f['guidelineTitle'].lower() for f in d8b['findings']), "Expected UNVERIFIED for exact 600 count"
assert not any(f['verdict'] == 'CONFLICT' for f in d8b['findings']), "False CONFLICT on exact 600 count"

# 8c: Deficit count 419 understates 420+ baseline -> CONFLICT
cust_419_text = "We have 419 enterprise customers."
d8c = test_payload("TEST 8c: DEFICIT CUSTOMER COUNT 419 (< 420 LOWER BOUND CONFLICT)", cust_419_text)
assert any(f['verdict'] == 'CONFLICT' and 'customer count discrepancy' in f['guidelineTitle'].lower() for f in d8c['findings']), "Expected CONFLICT on 419 deficit"

# 8d: Unverified higher count 1,500 -> UNVERIFIED
cust_1500_text = "With over 1,500 enterprise customers across the globe."
d8d = test_payload("TEST 8d: HIGHER CUSTOMER COUNT 1,500 (>= 1,000 UNVERIFIED)", cust_1500_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'higher customer count' in f['guidelineTitle'].lower() for f in d8d['findings']), "Expected UNVERIFIED on 1,500 customers"

# 8e: Negated 420+ count: "We do not have 420+ enterprise customers." -> CONFLICT (Customer Count Contradiction)
cust_neg_text = "We do not have 420+ enterprise customers."
d8e = test_payload("TEST 8e: NEGATED CUSTOMER COUNT (CUSTOMER CONTRADICTION)", cust_neg_text)
assert any(f['verdict'] == 'CONFLICT' and 'contradiction' in f['guidelineTitle'].lower() for f in d8e['findings']), "Expected CONFLICT on negated 420+ customers"

# 8f: Exact 420 count: "We have exactly 420 enterprise customers." -> UNVERIFIED (Unverified Exact Customer Count)
cust_exact420_text = "We have exactly 420 enterprise customers."
d8f = test_payload("TEST 8f: EXPLICIT EXACT CUSTOMER COUNT 420 (UNVERIFIED EXACT COUNT)", cust_exact420_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'exact customer count' in f['guidelineTitle'].lower() for f in d8f['findings']), "Expected UNVERIFIED on exactly 420"
assert not any(f['verdict'] == 'CONFLICT' for f in d8f['findings']), "False CONFLICT on exactly 420"

# 8g: Bare 420 count: "We have 420 enterprise customers." -> UNVERIFIED (Unverified Exact Customer Count)
cust_bare420_text = "We have 420 enterprise customers."
d8g = test_payload("TEST 8g: BARE CUSTOMER COUNT 420 (UNVERIFIED EXACT COUNT)", cust_bare420_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'exact customer count' in f['guidelineTitle'].lower() for f in d8g['findings']), "Expected UNVERIFIED on bare 420"
assert not any(f['verdict'] == 'CONFLICT' for f in d8g['findings']), "False CONFLICT on bare 420"

print("-> TEST 8 PASSED: Customer count semantics strictly enforced (420+ VERIFIED, 421/600 exact UNVERIFIED, 419 deficit CONFLICT, 1,500 unverified higher count UNVERIFIED, negated CONFLICT, exactly/bare 420 UNVERIFIED)!")

# Test 9: Turnaround Reduction Framing (Projected / Target Qualified vs Unqualified Outcome Assertion)
# 9a: Qualified target -> VERIFIED
turn_qualified = "Inkloom AI targets routine review turnaround reduction of up to 75%."
d9a = test_payload("TEST 9a: QUALIFIED TURNAROUND REDUCTION TARGET", turn_qualified)
assert any(f['verdict'] == 'VERIFIED' and 'turnaround' in f['guidelineTitle'].lower() for f in d9a['findings']), "Expected VERIFIED for qualified turnaround target"

# 9b: Unqualified assertion -> UNVERIFIED
turn_unqualified = "Inkloom AI delivers review turnaround reduction of up to 75% across all campaigns."
d9b = test_payload("TEST 9b: UNQUALIFIED TURNAROUND OUTCOME ASSERTION", turn_unqualified)
assert any(f['verdict'] == 'UNVERIFIED' and 'unqualified operational target' in f['guidelineTitle'].lower() for f in d9b['findings']), "Expected UNVERIFIED for unqualified turnaround claim"
print("-> TEST 9 PASSED: Turnaround reduction phrasing & qualified target framing verified!")

# Test 10: Entity Scope Enforcement (Customer Account Evidence vs Brands / Organizations)
# 10a: Brands entity is NOT covered by customer accounts evidence -> UNVERIFIED
entity_brands_text = "Our platform serves 420+ global enterprise brands."
d10a = test_payload("TEST 10a: ENTITY SCOPE 'BRANDS' (UNVERIFIED ENTITY METRIC)", entity_brands_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'entity' in f['guidelineTitle'].lower() for f in d10a['findings']), "Expected UNVERIFIED for brands entity"
assert not any(f['verdict'] == 'VERIFIED' for f in d10a['findings']), "False VERIFIED on brands entity"

# 10b: Organizations entity is NOT covered by customer accounts evidence -> UNVERIFIED
entity_orgs_text = "Our platform supports 420+ enterprise organizations."
d10b = test_payload("TEST 10b: ENTITY SCOPE 'ORGANIZATIONS' (UNVERIFIED ENTITY METRIC)", entity_orgs_text)
assert any(f['verdict'] == 'UNVERIFIED' and 'entity' in f['guidelineTitle'].lower() for f in d10b['findings']), "Expected UNVERIFIED for organizations entity"
assert not any(f['verdict'] == 'VERIFIED' for f in d10b['findings']), "False VERIFIED on organizations entity"

# 10c: Customers entity IS covered by customer accounts evidence -> VERIFIED
entity_cust_text = "Our platform serves 420+ active enterprise customer accounts."
d10c = test_payload("TEST 10c: ENTITY SCOPE 'CUSTOMER ACCOUNTS' (VERIFIED)", entity_cust_text)
assert any(f['verdict'] == 'VERIFIED' and 'customer' in f['guidelineTitle'].lower() for f in d10c['findings']), "Expected VERIFIED for customer accounts"
print("-> TEST 10 PASSED: Entity scope strictly enforced (brands/orgs UNVERIFIED, customer accounts VERIFIED)!")

# Test 11: Unsubstantiated Superlative Gap Closure ("industry-leading", "the leading")
# 11a: "industry-leading" -> FLAGGED
sup_ind_text = "We are an industry-leading brand governance platform."
d11a = test_payload("TEST 11a: UNSUBSTANTIATED SUPERLATIVE 'INDUSTRY-LEADING'", sup_ind_text)
assert any('superlative' in f['guidelineTitle'].lower() or 'tone' in f['category'].lower() for f in d11a['findings']), "Expected flag on 'industry-leading'"

# 11b: "the leading" -> FLAGGED
sup_lead_text = "We are the leading enterprise brand governance platform."
d11b = test_payload("TEST 11b: UNSUBSTANTIATED SUPERLATIVE 'THE LEADING'", sup_lead_text)
assert any('superlative' in f['guidelineTitle'].lower() or 'tone' in f['category'].lower() for f in d11b['findings']), "Expected flag on 'the leading'"

# 11c: Grounded objective statement -> 100/100
sup_clean_text = "We provide an enterprise brand governance platform with SOC 2 Type II certification."
d11c = test_payload("TEST 11c: GROUNDED OBJECTIVE PHRASING", sup_clean_text)
assert d11c['complianceScore'] == 100, f"Expected 100, got {d11c['complianceScore']}"

# 11d: Expanded superlatives ("better than every competitor", "the best brand governance platform", "market best") -> FLAGGED
sup_exp_text = "Our platform is better than every competitor and is the best brand governance platform on the market."
d11d = test_payload("TEST 11d: EXPANDED SUPERLATIVES", sup_exp_text)
assert any('superlative' in f['guidelineTitle'].lower() or 'tone' in f['category'].lower() for f in d11d['findings']), "Expected flag on expanded superlatives"

# 11e: Negated superlative ("We are not an industry-leading platform.") -> NOT FLAGGED (Negation awareness eliminates false positives)
sup_neg_text = "We are not an industry-leading platform."
d11e = test_payload("TEST 11e: NEGATED SUPERLATIVE (AVOID FALSE POSITIVE)", sup_neg_text)
assert not any('superlative' in f['guidelineTitle'].lower() for f in d11e['findings']), "Negated superlative falsely flagged"

# 11f: Unsupported modifier ("industry-verified") -> FLAGGED
sup_mod_text = "Our platform is industry-verified and has a 94.2% enterprise client retention rate."
d11f = test_payload("TEST 11f: UNSUPPORTED MODIFIER 'INDUSTRY-VERIFIED'", sup_mod_text)
assert any('industry-verified' in f['matchedText'].lower() for f in d11f['findings']), "Expected flag on 'industry-verified'"
print("-> TEST 11 PASSED: Unsubstantiated superlatives ('industry-leading', 'the leading', expanded, unsupported modifiers) caught; negation false positives eliminated; objective phrasing approved!")

# Test 12: Limited Terminology Rewrite Regression Check (Safety Audit)
# Flagging 'inkloom' and 'magic algorithm' must generate rewrites free of unverified claims, '(verified)', and 'Enterprise Standard'
rewrite_test_text = "Our team uses inkloom and our magic algorithm to review copy."
d12 = test_payload("TEST 12: LIMITED TERMINOLOGY REWRITE REGRESSION CHECK", rewrite_test_text)
for f in d12['findings']:
    if 'rewrites' in f and f['rewrites']:
        for tone, rw in f['rewrites'].items():
            assert '(verified)' not in rw.lower(), f"Unsafe rewrite found '(verified)' in {tone}: {rw}"
            assert 'enterprise standard' not in rw.lower(), f"Unsafe rewrite found 'enterprise standard' in {tone}: {rw}"
            assert 'industry-leading' not in rw.lower(), f"Unsafe rewrite found 'industry-leading' in {tone}: {rw}"
print("-> TEST 12 PASSED: Terminology rewrite regression check passed (verified absence of fake badges and synthetic assertions in tested rewrites).")

print("\nALL 12 VERIFICATION TESTS PASSED CLEANLY!")
