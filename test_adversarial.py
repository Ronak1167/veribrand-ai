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

# Test 12: Comprehensive Cross-Category Rewrite Safety & Semantic Invariant Suite
# Audits generated rewrites across ALL categories (terminology, pricing, SLA, customers, ARR, turnaround, tone, visual)
# Rejects alternatives that introduce unsupported facts, fake badges, or unverified compliance claims.
# Strictly enforces metric-category preservation (e.g. annual revenue cannot become ARR).
rewrite_corpus = [
    ("TERMINOLOGY", "Our team uses inkloom and our magic algorithm to review copy."),
    ("PRICING", "You can purchase our plan for $49/mo or $99/mo today."),
    ("SLA UPTIME", "We guarantee 99.999% uptime for all users."),
    ("CUSTOMERS", "We support 100 enterprise customers across regions."),
    ("ARR / REVENUE", "We reached $50M in ARR and $50M in annual revenue."),
    ("TARGET TURNAROUND", "Our platform review turnaround reduction of up to 75%."),
    ("TONE SUPERLATIVES", "We built the world's most revolutionary governance platform with zero risk."),
    ("VISUAL HEX", "Use header background color #ff0033.")
]

prohibited_rewrite_tokens = [
    '(verified)',
    'enterprise standard',
    'with full enterprise compliance',
    'industry-leading',
    'industry-verified',
    'rock-solid',
    'guaranteed 99.9%',
    "world's",
    'revolutionary',
    'zero risk',
]

total_rewrites_audited = 0
for cat_name, test_text in rewrite_corpus:
    res = test_payload(f"TEST 12 [{cat_name}]: REWRITE SAFETY & SEMANTIC AUDIT", test_text)
    for f in res['findings']:
        if 'rewrites' in f and f['rewrites']:
            assert all(tone in f['rewrites'] for tone in ['direct', 'punchy', 'conservative']), f"Missing tone variant in {f['guidelineTitle']}"
            for tone, rw in f['rewrites'].items():
                total_rewrites_audited += 1
                for token in prohibited_rewrite_tokens:
                    assert token not in rw.lower(), f"Unsafe token '{token}' found in {cat_name} [{tone}] rewrite: '{rw}'"

            # Semantic Invariant & Metric-Category Preservation Checks:
            title = f.get('guidelineTitle', '')
            for tone, rw in f['rewrites'].items():
                rw_lower = rw.lower()

                # 1. Annual revenue cannot be rewritten as ARR
                if title == 'Unverified Annual Revenue Metric':
                    assert 'arr' not in rw_lower and 'recurring' not in rw_lower, \
                        f"Metric category mismatch: Annual revenue rewritten as ARR in [{tone}]: '{rw}'"

                # 2. ARR cannot be rewritten as total revenue
                if title == 'False ARR Financial Disclosure':
                    assert 'annual revenue' not in rw_lower and 'total revenue' not in rw_lower, \
                        f"Metric category mismatch: ARR rewritten as general annual revenue in [{tone}]: '{rw}'"

                # 3. Customer account counts cannot silently become a brand count
                if 'Customer Count' in title:
                    assert 'brand' not in rw_lower and 'brands' not in rw_lower, \
                        f"Entity category mismatch: Customer accounts rewritten as brands in [{tone}]: '{rw}'"

                # 4. Projected target cannot become a historical performance claim
                if title == 'Unqualified Operational Target':
                    assert any(term in rw_lower for term in ['target', 'projected']), \
                        f"Target framing lost in [{tone}]: '{rw}'"
                    assert not any(past in rw_lower for past in ['achieved', 'delivered', 'guaranteed']), \
                        f"Historical performance claimed in [{tone}]: '{rw}'"

                # 5. SLA cannot become a broader unconditional guarantee or uncontracted scope expansion
                if 'SLA' in title:
                    assert 'sla' in rw_lower, f"Contractual SLA qualification missing in [{tone}]: '{rw}'"
                    for unapproved in ['guarantee', 'guaranteeing', 'guaranteed', 'unconditional', '100%', 'zero downtime', 'for all users']:
                        assert unapproved not in rw_lower, \
                            f"SLA transformed into broader guarantee or scope expansion ('{unapproved}') in [{tone}]: '{rw}'"

print(f"-> TEST 12 PASSED: Cross-category rewrite safety & semantic invariant suite audited {total_rewrites_audited} rewrite variants across all 8 categories with zero unverified compliance claims, fake badges, hyperbolic modifiers, or metric-category mismatches!")

# Test 13: Edge Case Claim & Governance Invariants Suite
# 13a: Retention rate numeric comparison against 94.2% (94.9% and 95% must trigger CONFLICT)
ret_949_text = "Backed by 94.9% enterprise client retention."
d13a1 = test_payload("TEST 13a1: RETENTION NUMERIC MISMATCH 94.9%", ret_949_text)
assert any(f['verdict'] == 'CONFLICT' and 'retention' in f['guidelineTitle'].lower() for f in d13a1['findings']), "Expected CONFLICT on 94.9% retention"

ret_95_text = "Backed by 95% enterprise retention."
d13a2 = test_payload("TEST 13a2: RETENTION NUMERIC MISMATCH 95%", ret_95_text)
assert any(f['verdict'] == 'CONFLICT' and 'retention' in f['guidelineTitle'].lower() for f in d13a2['findings']), "Expected CONFLICT on 95% retention"

# 13b: Bidirectional Uptime SLA Negation & Revocation
uptime_neg_text = "We do not provide 99.9% uptime."
d13b = test_payload("TEST 13b: UPTIME NEGATION CONTRADICTION", uptime_neg_text)
assert any(f['verdict'] == 'CONFLICT' and 'sla' in f['guidelineTitle'].lower() for f in d13b['findings']), "Expected CONFLICT on negated uptime"

# 13c: Flexible SLA Phrasing & Unit Variations
uptime_alt_text = "Our uptime of 99.999% is guaranteed."
d13c1 = test_payload("TEST 13c1: ALTERNATIVE UPTIME WORD ORDER", uptime_alt_text)
assert any(f['verdict'] == 'CONFLICT' and 'sla' in f['guidelineTitle'].lower() for f in d13c1['findings']), "Expected CONFLICT on alternative uptime word order"

uptime_percent_text = "Holding a 99.999 percent uptime standard."
d13c2 = test_payload("TEST 13c2: PERCENT WORD VARIANT IN SLA", uptime_percent_text)
assert any(f['verdict'] == 'CONFLICT' and 'sla' in f['guidelineTitle'].lower() for f in d13c2['findings']), "Expected CONFLICT on 'percent' word SLA"

# 13d: Subsequent Security Revocation
sec_rev_text = "SOC 2 Type II is no longer active."
d13d = test_payload("TEST 13d: SUBSEQUENT SECURITY REVOCATION", sec_rev_text)
assert any(f['verdict'] == 'CONFLICT' and 'security' in f['guidelineTitle'].lower() for f in d13d['findings']), "Expected CONFLICT on revoked security cert"

# 13e: Context-Aware Financial Classification (Funding & Valuation Ignored)
fund_text = "We closed an $18.5M funding round with top venture investors."
d13e1 = test_payload("TEST 13e1: FUNDING ROUND CONTEXT", fund_text)
assert not any('revenue' in f['guidelineTitle'].lower() for f in d13e1['findings']), "Funding round falsely flagged as unverified revenue"
assert d13e1['complianceScore'] == 100, f"Expected 100, got {d13e1['complianceScore']}"

val_text = "Our current valuation is $18.5M."
d13e2 = test_payload("TEST 13e2: VALUATION CONTEXT", val_text)
assert not any('revenue' in f['guidelineTitle'].lower() for f in d13e2['findings']), "Valuation falsely flagged as unverified revenue"
assert d13e2['complianceScore'] == 100, f"Expected 100, got {d13e2['complianceScore']}"

# 13f: Twitter Channel Length Policy
twitter_long_text = "Inkloom AI and VeriBrand AI enable distributed marketing teams to scale high-velocity publishing without sacrificing brand integrity. " * 3
url_tw = 'http://localhost:3000/api/audit'
payload_tw = json.dumps({'text': twitter_long_text, 'channel': 'twitter'}).encode('utf-8')
req_tw = urllib.request.Request(url_tw, data=payload_tw, headers={'Content-Type': 'application/json'})
resp_tw = urllib.request.urlopen(req_tw)
data_tw = json.loads(resp_tw.read().decode('utf-8'))
assert any('character limit' in f['guidelineTitle'].lower() for f in data_tw['findings']), "Expected Twitter character limit finding"

# 13g: Press Release Regulatory Elevation
pr_text = "We are an industry-leading governance platform."
payload_pr = json.dumps({'text': pr_text, 'channel': 'press_release'}).encode('utf-8')
req_pr = urllib.request.Request(url_tw, data=payload_pr, headers={'Content-Type': 'application/json'})
resp_pr = urllib.request.urlopen(req_pr)
data_pr = json.loads(resp_pr.read().decode('utf-8'))
assert any(f['severity'] == 'critical' and 'press release policy' in f['explanation'].lower() for f in data_pr['findings']), "Expected critical severity elevation for press release"

print("-> TEST 13 PASSED: Edge case claim & governance invariants verified (retention numerical comparison, bidirectional negation, flexible SLA phrasing, funding/valuation context awareness, channel-specific Twitter/PR policies)!")

# Test 14: Contraction Negations & Phrasal Revocations
# 14a: "don't provide 99.9% uptime" -> CONFLICT
d14a = test_payload("TEST 14a: CONTRACTION NEGATION UPTIME ('don't provide 99.9% uptime')", "We don't provide 99.9% uptime.")
assert any(f['verdict'] == 'CONFLICT' and 'sla' in f['guidelineTitle'].lower() for f in d14a['findings']), "Expected CONFLICT on 'don't provide 99.9% uptime'"

# 14b: "don't have SOC 2 Type II" -> CONFLICT
d14b = test_payload("TEST 14b: CONTRACTION NEGATION SECURITY ('don't have SOC 2')", "We don't have SOC 2 Type II certification.")
assert any(f['verdict'] == 'CONFLICT' and 'security' in f['guidelineTitle'].lower() for f in d14b['findings']), "Expected CONFLICT on 'don't have SOC 2'"

# 14c: "certification isn't active" -> CONFLICT
d14c = test_payload("TEST 14c: SUBSEQUENT CONTRACTION REVOCATION ('isn't active')", "Our SOC 2 Type II certification isn't active.")
assert any(f['verdict'] == 'CONFLICT' and 'security' in f['guidelineTitle'].lower() for f in d14c['findings']), "Expected CONFLICT on 'isn't active'"

# 14d: "don't have 94.2% retention" -> CONFLICT
d14d = test_payload("TEST 14d: CONTRACTION NEGATION RETENTION ('don't have 94.2% retention')", "We don't have 94.2% enterprise client retention.")
assert any(f['verdict'] == 'CONFLICT' and 'retention' in f['guidelineTitle'].lower() for f in d14d['findings']), "Expected CONFLICT on 'don't have 94.2% retention'"

# 14e: "retention rate is no longer 94.2%" -> CONFLICT
d14e = test_payload("TEST 14e: PHRASAL RETENTION REVOCATION ('is no longer 94.2%')", "Our retention rate is no longer 94.2%.")
assert any(f['verdict'] == 'CONFLICT' and 'retention' in f['guidelineTitle'].lower() for f in d14e['findings']), "Expected CONFLICT on 'is no longer 94.2%'"

print("-> TEST 14 PASSED: Contractions & phrasal revocations correctly detected as critical CONFLICTs!")

# Test 15: Financial Assertion Phrasing & Classification Invariants
# 15a: "Annual revenue was $50M" -> UNVERIFIED
d15a = test_payload("TEST 15a: NOUN-FIRST ANNUAL REVENUE ('Annual revenue was $50M')", "Annual revenue was $50M.")
assert any(f['verdict'] == 'UNVERIFIED' and 'annual revenue' in f['guidelineTitle'].lower() for f in d15a['findings']), "Expected UNVERIFIED for 'Annual revenue was $50M'"

# 15b: "Total revenue is $50M" -> UNVERIFIED
d15b = test_payload("TEST 15b: TOTAL REVENUE ('Total revenue is $50M')", "Total revenue is $50M.")
assert any(f['verdict'] == 'UNVERIFIED' and 'annual revenue' in f['guidelineTitle'].lower() for f in d15b['findings']), "Expected UNVERIFIED for 'Total revenue is $50M'"

# 15c: "Revenue reached $50M" -> UNVERIFIED
d15c = test_payload("TEST 15c: REVENUE REACHED ('Revenue reached $50M')", "Revenue reached $50M.")
assert any(f['verdict'] == 'UNVERIFIED' and 'annual revenue' in f['guidelineTitle'].lower() for f in d15c['findings']), "Expected UNVERIFIED for 'Revenue reached $50M'"

# 15d: "Our annual recurring revenue was $50M" -> CONFLICT
d15d = test_payload("TEST 15d: FULL PHRASE ARR MISMATCH ('annual recurring revenue was $50M')", "Our annual recurring revenue was $50M.")
assert any(f['verdict'] == 'CONFLICT' and 'arr' in f['guidelineTitle'].lower() for f in d15d['findings']), "Expected CONFLICT for 'annual recurring revenue was $50M'"

# 15e: Clause with 'investor' mention without clause-crossing suppression
d15e = test_payload("TEST 15e: ANNUAL REVENUE NOT SUPPRESSED BY INVESTOR IN NEXT CLAUSE", "Annual revenue was $50M; we later met investors.")
assert any(f['verdict'] == 'UNVERIFIED' and 'annual revenue' in f['guidelineTitle'].lower() for f in d15e['findings']), "Expected UNVERIFIED for 'Annual revenue was $50M' despite investor in next clause"

# 15f: "Our total revenue was $18.5M" -> UNVERIFIED (Total revenue is unverified even if $18.5M, because Brand Vault only audits ARR)
d15f = test_payload("TEST 15f: TOTAL REVENUE OF $18.5M (UNVERIFIED TOTAL REVENUE)", "Our total revenue was $18.5M.")
assert any(f['verdict'] == 'UNVERIFIED' and 'annual revenue' in f['guidelineTitle'].lower() for f in d15f['findings']), "Expected UNVERIFIED for total revenue $18.5M"

# 15g: "Our ARR was $18.5M" -> VERIFIED
d15g = test_payload("TEST 15g: VERIFIED AUDITED ARR ('Our ARR was $18.5M')", "Our ARR was $18.5M.")
assert any(f['verdict'] == 'VERIFIED' and 'arr' in f['guidelineTitle'].lower() for f in d15g['findings']), "Expected VERIFIED for 'Our ARR was $18.5M'"

print("-> TEST 15 PASSED: Financial assertions strictly classified (dual-form regex, ARR vs total revenue, no broad clause-crossing suppression)!")

# Test 16: Overlapping Aho-Corasick Priority De-duplication
# 16a: "We are an industry-leading brand governance platform." -> Exactly 1 finding for "industry-leading"
d16a = test_payload("TEST 16a: OVERLAPPING MATCH ('industry-leading brand')", "We are an industry-leading brand governance platform.")
tone_findings = [f for f in d16a['findings'] if f.get('category') == 'tone_drift']
assert len(tone_findings) == 1, f"Expected exactly 1 tone finding, got {len(tone_findings)}: {[f['matchedText'] for f in tone_findings]}"
assert tone_findings[0]['matchedText'].lower() == 'industry-leading', f"Expected 'industry-leading', got {tone_findings[0]['matchedText']}"

# 16b: "We are the leading enterprise platform." -> Exactly 1 finding
d16b = test_payload("TEST 16b: OVERLAPPING MATCH ('the leading enterprise')", "We are the leading enterprise platform.")
tone_findings_b = [f for f in d16b['findings'] if f.get('category') == 'tone_drift']
assert len(tone_findings_b) == 1, f"Expected exactly 1 tone finding, got {len(tone_findings_b)}: {[f['matchedText'] for f in tone_findings_b]}"

print("-> TEST 16 PASSED: Overlapping Tier-1 match interval priority de-duplication verified!")

print("\nALL 16 VERIFICATION TESTS PASSED CLEANLY!")
