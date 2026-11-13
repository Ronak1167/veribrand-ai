# VeriBrand AI — Automated Engine Test Suite

from engine import audit_document, calculate_wcag_contrast

SAMPLE_BROKEN = (
    "Welcome to inkloom! We are the world's most revolutionary brand governance platform, "
    "guaranteeing 99.999% uptime and zero risk for all users. With over 1,500 enterprise customers "
    "and $50M in annual revenue, our artificial intelligence wizard automatically replaces all human editors. "
    "You can still lock in our legacy pricing at just $49/mo today! Use color #ff0033."
)

SAMPLE_COMPLIANT = (
    "Inkloom AI and VeriBrand AI enable distributed marketing teams to scale high-velocity publishing "
    "without sacrificing brand integrity. Backed by SOC 2 Type II security standards and an industry-verified "
    "94.2% enterprise retention rate, our explainable compliance co-pilot targets accelerating routine review turnaround by up to 75%."
)

def run_tests():
    print("==================================================")
    print("  VERIBRAND AI — AUTOMATED VERIFICATION SUITE")
    print("==================================================")

    # Test 1: Broken Copy
    res1 = audit_document(SAMPLE_BROKEN)
    print(f"\n[Test 1] Broken Copy Analysis:")
    print(f"  Score: {res1['compliance_score']}/100")
    print(f"  Tier-1 Latency: {res1['tier1_latency_ms']} ms")
    print(f"  Tier-2 Latency: {res1['tier2_latency_ms']} ms")
    print(f"  Total Findings: {len(res1['findings'])}")
    print(f"  Conflicts: {res1['claims_conflicted_count']}")
    print(f"  Unverified: {res1['claims_unverified_count']}")

    assert res1['claims_conflicted_count'] >= 1, "Expected SLA uptime conflict"
    assert res1['claims_unverified_count'] >= 3, "Expected unverified claims (higher customers, unverified annual revenue, outdated pricing)"
    print("  -> TEST 1 PASSED: Correctly caught conflicts and unverified claims.")

    # Test 1b: Deficit Customer Count (<420) & False ARR Contradiction
    res_def = audit_document("We support 100 enterprise customers and $50M in ARR.")
    assert res_def['claims_conflicted_count'] == 2, "Expected 2 conflicts (deficit customers and false ARR)"
    print("  -> TEST 1b PASSED: Deficit customer count (100 < 420) and false ARR ($50M != $18.5M) correctly flagged as CONFLICT.")

    # Test 2: Compliant Copy
    res2 = audit_document(SAMPLE_COMPLIANT)
    print(f"\n[Test 2] Compliant Copy Analysis:")
    print(f"  Score: {res2['compliance_score']}/100")
    print(f"  Verified Claims: {res2['claims_verified_count']}")
    print(f"  Conflicts: {res2['claims_conflicted_count']}")
    assert res2['claims_conflicted_count'] == 0, "Expected zero conflicts on compliant draft"
    assert res2['compliance_score'] == 100, "Expected 100/100 score on compliant draft"
    print("  -> TEST 2 PASSED: 100% compliant draft validated.")

    # Test 3: WCAG Contrast
    contrast = calculate_wcag_contrast("#4F46E5", "#FFFFFF")
    print(f"\n[Test 3] Brand Indigo (#4F46E5) on White Contrast:")
    print(f"  Contrast Ratio: {contrast}:1")
    assert contrast >= 4.5, "Expected WCAG 2.1 AA compliance (>= 4.5:1)"
    print("  -> TEST 3 PASSED: WCAG 2.1 AA luminance verified.")

    print("\n==================================================")
    print("  ALL TESTS PASSED EMPIRICALLY (3/3)")
    print("==================================================")

if __name__ == "__main__":
    run_tests()
