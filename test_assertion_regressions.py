# VeriBrand AI — Assertion Polarity & Regression Test Suite
# Tests questions, lapsed certs, disclaimers, competitor claims, and double negations.

import sys
import os
import requests

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from engine import audit_document

CASES = [
    {
        "id": "CASE-1-Q-SOC2",
        "text": "Do we have SOC 2 Type II certification?",
        "expected_verdict": "UNVERIFIED",
        "max_score": 95,
        "desc": "Question about security certification must yield UNVERIFIED, not 100",
    },
    {
        "id": "CASE-2-Q-UPTIME",
        "text": "Are we at 99.9% uptime?",
        "expected_verdict": "UNVERIFIED",
        "max_score": 95,
        "desc": "Question about uptime SLA must yield UNVERIFIED, not 100",
    },
    {
        "id": "CASE-3-DOUBLE-NEGATION",
        "text": "We are not only not SOC 2 Type II certified.",
        "expected_verdict": "CONFLICT",
        "max_score": 85,
        "desc": "Double negation 'not only not certified' must be caught as CONFLICT",
    },
    {
        "id": "CASE-4-LAPSED-CERT",
        "text": "Our SOC 2 Type II certification has not been renewed.",
        "expected_verdict": "CONFLICT",
        "max_score": 85,
        "desc": "Lapsed/unrenewed certification must be caught as CONFLICT",
    },
    {
        "id": "CASE-5-DISCLAIMED-SLA",
        "text": "We have 99.9% uptime but do not guarantee it.",
        "expected_verdict": "UNVERIFIED",
        "max_score": 95,
        "desc": "Disclaimed SLA guarantee must yield UNVERIFIED, not 100",
    },
    {
        "id": "CASE-6-COMPETITOR-CLAIM",
        "text": "Competitor claims 99.999% uptime.",
        "expected_verdict": "SUGGESTION",
        "max_score": 98,
        "desc": "Competitor metric assertion must be classified as SUGGESTION, not CONFLICT",
    },
    {
        "id": "CASE-7-NEGATED-METRIC",
        "text": "We do not have 17 regional offices.",
        "expected_score": 100,
        "desc": "Negated unsupported metric must be safely ignored and score 100",
    },
    {
        "id": "CASE-8-AFFIRMATIVE-IDIOM",
        "text": "We are not only SOC 2 Type II certified, but also enterprise-ready.",
        "expected_verdict": "VERIFIED",
        "expected_score": 100,
        "desc": "Affirmative idiom 'not only X but also Y' must remain VERIFIED at 100",
    },
    {
        "id": "CASE-9-INDEPENDENT-CLAUSE",
        "text": "We do not sell product X, but we provide 99.9% uptime.",
        "expected_verdict": "VERIFIED",
        "expected_score": 100,
        "desc": "Negation in preceding independent clause must not contaminate valid SLA claim",
    },
]

def run_tests():
    print("=" * 65)
    print("  VERIBRAND AI — ASSERTION POLARITY & REGRESSION SUITE")
    print("=" * 65)

    passed_count = 0
    total_count = len(CASES)

    for case in CASES:
        print(f"\n[{case['id']}] {case['desc']}")
        print(f"  Input: \"{case['text']}\"")
        res = audit_document(case['text'], "website")
        score = res['compliance_score']
        findings = res['findings']

        # Check verdict if expected
        if "expected_verdict" in case:
            verdicts = [f.get('verdict') for f in findings]
            assert case['expected_verdict'] in verdicts, f"Expected verdict {case['expected_verdict']} in {verdicts}"
            print(f"  -> Verdict check PASSED: Found {case['expected_verdict']}")

        # Check score constraints
        if "max_score" in case:
            assert score <= case['max_score'], f"Expected score <= {case['max_score']}, got {score}"
            print(f"  -> Score check PASSED: Score {score}/100 <= {case['max_score']}")

        if "expected_score" in case:
            assert score == case['expected_score'], f"Expected score {case['expected_score']}, got {score}"
            print(f"  -> Score check PASSED: Score exactly {score}/100")

        passed_count += 1

    print("\n" + "=" * 65)
    print(f"  ALL ASSERTION REGRESSION TESTS PASSED ({passed_count}/{total_count})")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()
