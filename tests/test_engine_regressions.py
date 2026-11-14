import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))
from engine import audit_document


def result(text):
    return audit_document(text, "website")


def verdicts(data):
    return [finding.get("verdict") for finding in data.get("findings", [])]


def test_question_about_soc2_is_not_approved():
    data = result("Do we have SOC 2 Type II certification?")
    assert "UNVERIFIED" in verdicts(data)
    assert data["compliance_score"] < 100


def test_question_about_uptime_is_not_approved():
    data = result("Are we at 99.9% uptime?")
    assert "UNVERIFIED" in verdicts(data)
    assert data["compliance_score"] < 100


def test_double_negation_is_conflict():
    data = result("We are not only not SOC 2 Type II certified.")
    assert "CONFLICT" in verdicts(data)


def test_unrenewed_certification_is_conflict():
    data = result("Our SOC 2 Type II certification has not been renewed.")
    assert "CONFLICT" in verdicts(data)


def test_disclaimed_uptime_is_not_verified():
    data = result("We have 99.9% uptime but do not guarantee it.")
    assert "UNVERIFIED" in verdicts(data)
    assert data["compliance_score"] < 100


def test_competitor_claim_is_not_attributed_to_brand():
    data = result("Competitor claims 99.999% uptime.")
    assert "SUGGESTION" in verdicts(data)
    assert "CONFLICT" not in verdicts(data)


def test_negated_unsupported_metric_is_not_treated_as_claim():
    data = result("We do not have 17 regional offices.")
    assert data["compliance_score"] == 100


def test_not_only_affirmative_idiom_remains_verified():
    data = result("We are not only SOC 2 Type II certified, but also enterprise-ready.")
    assert "VERIFIED" in verdicts(data)
    assert data["compliance_score"] == 100


def test_negation_in_prior_clause_does_not_contaminate_sla():
    data = result("We do not sell product X, but we provide 99.9% uptime.")
    assert "VERIFIED" in verdicts(data)
    assert data["compliance_score"] == 100
