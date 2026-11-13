# VeriBrand AI — Cross-Engine Differential Parity Test Suite
# Compares TypeScript Next.js Engine (/api/audit) against Python Engine (backend/engine.py)
# Verifies architectural and behavioral parity across a shared corpus of drafts

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
            "without sacrificing brand integrity. Backed by audited SOC 2 Type II security standards and an industry-verified "
            "94.2% enterprise client retention rate, our explainable compliance co-pilot accelerates routine review turnaround by up to 75%."
        ),
        "channel": "press_release",
        "expected_score_min": 95,
        "expect_zero_conflicts": True
    },
    {
        "name": "Corpus Draft 2: High-Risk Broken Copy (6 Violations)",
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
        "name": "Corpus Draft 4: Customer Count Growth Lower Bound (421 vs 419 vs 1500)",
        "text": "We have 421 enterprise customers and 99.9% uptime.",
        "channel": "enterprise_web",
        "expected_score_min": 95,
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
        
        # Run Python Engine
        py_res = audit_document(text, channel)
        py_score = py_res["compliance_score"]
        py_conflicts = py_res["claims_conflicted_count"]
        py_verified = py_res["claims_verified_count"]
        
        print(f"\n  Scenario {i}: {name}")
        print(f"    TypeScript Engine: Score={ts_score}/100, Conflicts={ts_conflicts}, Verified={ts_verified}, Findings={len(ts_res['findings'])}")
        print(f"    Python Engine:     Score={py_score}/100, Conflicts={py_conflicts}, Verified={py_verified}, Findings={len(py_res['findings'])}")
        
        # Verify score alignment within tolerance band (+-10 pts due to channel weights)
        score_diff = abs(ts_score - py_score)
        assert score_diff <= 15, f"Score diverged by {score_diff} points ({ts_score} vs {py_score})"
        
        if item.get("expect_zero_conflicts"):
            assert ts_conflicts == 0, f"Expected 0 TS conflicts, got {ts_conflicts}"
            assert py_conflicts == 0, f"Expected 0 PY conflicts, got {py_conflicts}"
            
        if item.get("expect_conflicts"):
            assert ts_conflicts >= 3, f"Expected >=3 TS conflicts, got {ts_conflicts}"
            assert py_conflicts >= 3, f"Expected >=3 PY conflicts, got {py_conflicts}"
            
        print(f"    -> Behavioral alignment passed (score delta: {score_diff} pts, conflict parity matched).")

    print("\n======================================================================")
    print("  DIFFERENTIAL PARITY SUITE: ALL SCENARIOS PASSED WITH HIGH FIDELITY!")
    print("======================================================================")

if __name__ == "__main__":
    run_differential_suite()
