import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "backend"))
from engine import audit_document


def findings_for(text):
    return audit_document(text)["findings"]


def require_verdict(text, title_fragment, verdict):
    findings = findings_for(text)
    matches = [
        item for item in findings
        if title_fragment.lower() in item["guideline_title"].lower()
    ]
    assert matches, f"Missing {title_fragment!r} finding for: {text!r}; got {findings!r}"
    assert any(item["verdict"] == verdict for item in matches), (
        f"Expected {verdict} for {title_fragment!r}, got "
        f"{[(item['verdict'], item['matched_text']) for item in matches]!r}"
    )


def forbid_verdict(text, verdict):
    findings = findings_for(text)
    assert not any(item["verdict"] == verdict for item in findings), (
        f"Unexpected {verdict} for {text!r}: {findings!r}"
    )


def run():
    # Independent expected outcomes: these assertions do not merely compare engines.
    require_verdict(
        "We are not only SOC 2 Type II certified, but we do not provide 99.9% uptime.",
        "Security Compliance", "VERIFIED"
    )
    require_verdict(
        "We are not only SOC 2 Type II certified, but we do not provide 99.9% uptime.",
        "SLA Availability", "CONFLICT"
    )
    require_verdict(
        "We do not sell product X, but we provide 99.9% uptime.",
        "SLA Availability", "VERIFIED"
    )
    forbid_verdict(
        "We do not sell product X, but we provide 99.9% uptime.",
        "CONFLICT"
    )
    require_verdict(
        "We provide uptime, but it is not 99.9%.",
        "SLA Availability", "CONFLICT"
    )
    require_verdict(
        "We do not, under any circumstances, provide 99.9% uptime.",
        "SLA Availability", "CONFLICT"
    )
    require_verdict(
        "Our uptime is not 99.9%.",
        "SLA Availability", "CONFLICT"
    )
    require_verdict(
        "Revenue is $18.5M ARR.",
        "ARR", "VERIFIED"
    )
    require_verdict(
        "Revenue is $50M ARR.",
        "ARR", "CONFLICT"
    )
    require_verdict(
        "We are not only SOC 2 Type II certified, but also enterprise-ready.",
        "Security Compliance", "VERIFIED"
    )
    forbid_verdict(
        "We are not only SOC 2 Type II certified, but also enterprise-ready.",
        "CONFLICT"
    )
    print("PASS: 10 independent claim polarity and ARR classification assertions.")


if __name__ == "__main__":
    run()
