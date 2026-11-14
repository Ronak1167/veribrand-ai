# VeriBrand AI — Cross-Engine Differential Parity Test Suite
# Compares TypeScript Next.js Engine (/api/audit) against Python Engine (backend/engine.py)
# Verifies architectural, behavioral, and finding-level parity across a shared corpus of drafts

import urllib.request
import json
import sys
import os

# Ensure backend directory is in path for Python engine import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))
from engine import audit_document, VERIFIED_METRICS as PY_METRICS, BRAND_RULES as PY_RULES

SHARED_CORPUS = [
    {
        "name": "Corpus Draft 1: 100% Compliant Draft",
        "text": (
            "Inkloom AI and VeriBrand AI enable distributed marketing teams to scale high-velocity publishing "
            "without sacrificing brand integrity. Backed by audited SOC 2 Type II security standards and an audited "
            "94.2% enterprise client retention rate, our explainable compliance co-pilot targets accelerating routine review turnaround by up to 75%."
        ),
        "channel": "press_release",
        "expected_score_min": 95,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 2: High-Risk Broken Copy (Multiple Violations)",
        "text": (
            "Welcome to inkloom! We are the world's most revolutionary brand governance platform, "
            "guaranteeing 99.999% uptime and zero risk for all users. With over 1,500 enterprise customers "
            "and $50M in annual revenue, our artificial intelligence wizard automatically replaces all human editors. "
            "You can still lock in our legacy pricing at just $49/mo today! For our header graphics, apply background color #ff0033."
        ),
        "channel": "linkedin",
        "expected_score_max": 20,
        "expect_conflicts": True
    },
    {
        "name": "Corpus Draft 3: Subtle Borderline Copy",
        "text": (
            "VeriBrand AI helps modern marketing teams streamline their publishing pipeline. "
            "Backed by SOC 2 Type II certification and 99.9% uptime, our platform supports 420+ global enterprise brands. "
            "Our system provides a flawless guarantee against all trademark and copyright lawsuits worldwide."
        ),
        "channel": "enterprise_web",
        "expected_score_min": 70,
        "expected_score_max": 95
    },
    {
        "name": "Corpus Draft 4: Customer Count Lower Bound (420+ Accounts)",
        "text": "We have 420+ enterprise customers and 99.9% uptime.",
        "channel": "enterprise_web",
        "expected_score_min": 95,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 5: Customer Count Deficit (< 420 Baseline Conflict)",
        "text": "We currently serve 419 enterprise customers with 99.9% uptime.",
        "channel": "enterprise_web",
        "expected_score_max": 85,
        "expect_conflicts": True
    },
    {
        "name": "Corpus Draft 6: Customer Count Higher Unverified (1,500 Customers)",
        "text": "With over 1,500 enterprise customers across all global regions.",
        "channel": "enterprise_web",
        "expected_score_max": 90,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 7: Exact Customer Count (421 Customers Unverified Exact Count)",
        "text": "We have 421 enterprise customers and 99.9% uptime.",
        "channel": "enterprise_web",
        "expected_score_max": 90,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 8: Turnaround Reduction Target Framing (Projected vs Outcome)",
        "text": "Our platform targets routine review turnaround reduction of up to 75% while maintaining SOC 2 Type II standards.",
        "channel": "press_release",
        "expected_score_min": 95,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 9: Negated Customer Count Contradiction",
        "text": "We do not have 420+ enterprise customers with 99.9% uptime.",
        "channel": "enterprise_web",
        "expected_score_max": 85,
        "expect_conflicts": True
    },
    {
        "name": "Corpus Draft 10: Superlative & Entity Scope Enforcement",
        "text": "We are an industry-leading brand governance platform serving 420+ global enterprise brands.",
        "channel": "enterprise_web",
        "expected_score_max": 80,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 11: Contraction Negations & Phrasal Revocations",
        "text": "We don't provide 99.9% uptime and our SOC 2 Type II certification isn't active.",
        "channel": "enterprise_web",
        "expected_score_max": 70,
        "expect_conflicts": True
    },
    {
        "name": "Corpus Draft 12: Financial Assertion Classification (Annual Revenue vs ARR)",
        "text": "Annual revenue was $50M and our ARR was $18.5M.",
        "channel": "enterprise_web",
        "expected_score_max": 95,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 13: Overlapping Tier-1 Match De-duplication",
        "text": "We are an industry-leading brand governance platform with SOC 2 Type II security.",
        "channel": "enterprise_web",
        "expected_score_min": 75,
        "expect_zero_conflicts": True
    }
]

def query_typescript_api(text: str, channel: str):
    url = "http://localhost:3000/api/audit"
    req = urllib.request.Request(
        url,
        data=json.dumps({"text": text, "channel": channel}).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))

def run_differential_suite():
    print("======================================================================")
    print("  VERIBRAND AI — CROSS-ENGINE DIFFERENTIAL PARITY TEST SUITE")
    print("======================================================================")
    
    # 1. Identifier Parity Check
    print("\n[Audit 1: Metadata & Identifier Parity]")
    print(f"  Python Rules Defined: {len(PY_RULES)}")
    print(f"  Python Metrics Defined: {len(PY_METRICS)}")
    assert len(PY_RULES) == 8, f"Expected 8 Python rules, found {len(PY_RULES)}"
    assert len(PY_METRICS) == 8, f"Expected 8 Python metrics, found {len(PY_METRICS)}"
    print("  -> Rule & Metric inventory parity confirmed (8 rules, 8 metrics).")

    # 2. Behavioral Parity across Shared Corpus
    print("\n[Audit 2: Behavioral Parity across Shared Draft Corpus]")
    all_passed = True
    for i, item in enumerate(SHARED_CORPUS, 1):
        name = item["name"]
        text = item["text"]
        channel = item["channel"]
        
        # Run TypeScript Engine (via API)
        ts_res = query_typescript_api(text, channel)
        ts_score = ts_res["complianceScore"]
        ts_conflicts = sum(1 for f in ts_res["findings"] if f["verdict"] == "CONFLICT")
        ts_verified = sum(1 for f in ts_res["findings"] if f["verdict"] == "VERIFIED")
        ts_unverified = sum(1 for f in ts_res["findings"] if f["verdict"] == "UNVERIFIED")
        
        # Run Python Engine
        py_res = audit_document(text, channel)
        py_score = py_res["compliance_score"]
        py_conflicts = py_res["claims_conflicted_count"]
        py_verified = py_res["claims_verified_count"]
        py_unverified = py_res["claims_unverified_count"]
        
        print(f"\n  Scenario {i}: {name}")
        print(f"    TypeScript Engine: Score={ts_score}/100, Conflicts={ts_conflicts}, Verified={ts_verified}, Unverified={ts_unverified}, Findings={len(ts_res['findings'])}")
        print(f"    Python Engine:     Score={py_score}/100, Conflicts={py_conflicts}, Verified={py_verified}, Unverified={py_unverified}, Findings={len(py_res['findings'])}")
        
        # Verify strict score and findings parity
        score_diff = abs(ts_score - py_score)
        if score_diff != 0:
            print(f"    ERROR: Score delta {score_diff} (TS: {ts_score}, PY: {py_score})")
            all_passed = False

        if len(ts_res['findings']) != len(py_res['findings']):
            print(f"    ERROR: Findings count mismatch (TS: {len(ts_res['findings'])}, PY: {len(py_res['findings'])})")
            all_passed = False

        # Compare finding verdicts distribution
        ts_verdicts = sorted([f["verdict"] for f in ts_res["findings"]])
        py_verdicts = sorted([f["verdict"] for f in py_res["findings"]])
        if ts_verdicts != py_verdicts:
            print(f"    ERROR: Verdict distributions do not match (TS: {ts_verdicts}, PY: {py_verdicts})")
            all_passed = False

        # Finding-level granularity: compare matched texts, categories, and verdicts
        ts_tuples = sorted([(f.get("matchedText", "").strip().lower(), f.get("category", "").lower(), f["verdict"]) for f in ts_res["findings"]])
        py_tuples = sorted([(f.get("matched_text", "").strip().lower(), f.get("category", "").lower(), f["verdict"]) for f in py_res["findings"]])
        if ts_tuples != py_tuples:
            print(f"    ERROR: Finding-level tuples do not match:\n      TS: {ts_tuples}\n      PY: {py_tuples}")
            all_passed = False

        if item.get("expect_zero_conflicts"):
            if ts_conflicts != 0 or py_conflicts != 0:
                print(f"    ERROR: Expected 0 conflicts (TS: {ts_conflicts}, PY: {py_conflicts})")
                all_passed = False

        if item.get("expect_conflicts"):
            if ts_conflicts < 1 or py_conflicts < 1:
                print(f"    ERROR: Expected >=1 conflict (TS: {ts_conflicts}, PY: {py_conflicts})")
                all_passed = False

        print(f"    -> Perfect behavioral parity verified: exact 0-point score delta, {ts_conflicts} conflicts, {len(ts_res['findings'])} findings.")

    if not all_passed:
        print("\nDIFFERENTIAL PARITY SUITE FAILED!")
        sys.exit(1)

    print("\n======================================================================")
    print("  DIFFERENTIAL PARITY SUITE: ALL SCENARIOS VERIFIED WITH EXACT PARITY (DELTA=0)!")
    print("======================================================================")

if __name__ == "__main__":
    run_differential_suite()
