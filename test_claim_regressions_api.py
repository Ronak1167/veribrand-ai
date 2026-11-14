import json
import os
import urllib.request

BASE_URL = os.environ.get("VERIBRAND_API_URL", "http://localhost:3000").rstrip("/")


def audit(text):
    payload = json.dumps({"text": text, "channel": "enterprise_web"}).encode("utf-8")
    request = urllib.request.Request(
        BASE_URL + "/api/audit",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode("utf-8"))


def expect(result, title, verdict):
    assert any(
        title.lower() in finding["guidelineTitle"].lower()
        and finding["verdict"] == verdict
        for finding in result["findings"]
    ), (title, verdict, result["findings"])


def run():
    cases = [
        (
            "We are not only SOC 2 Type II certified, but we do not provide 99.9% uptime.",
            [("Security Compliance", "VERIFIED"), ("SLA Availability", "CONFLICT")],
        ),
        (
            "We do not sell product X, but we provide 99.9% uptime.",
            [("SLA Availability", "VERIFIED")],
        ),
        (
            "We provide uptime, but it is not 99.9%.",
            [("SLA Availability", "CONFLICT")],
        ),
        (
            "We do not, under any circumstances, provide 99.9% uptime.",
            [("SLA Availability", "CONFLICT")],
        ),
        (
            "Our uptime is not 99.9%.",
            [("SLA Availability", "CONFLICT")],
        ),
        ("Revenue is $18.5M ARR.", [("ARR", "VERIFIED")]),
        ("Revenue is $50M ARR.", [("ARR", "CONFLICT")]),
        (
            "We are not only SOC 2 Type II certified, but also enterprise-ready.",
            [("Security Compliance", "VERIFIED")],
        ),
    ]
    for text, expected in cases:
        result = audit(text)
        for title, verdict in expected:
            expect(result, title, verdict)
        if text.startswith("We do not sell product"):
            assert not any(f["verdict"] == "CONFLICT" for f in result["findings"])
        if text.startswith("We are not only SOC 2") and "do not provide" not in text:
            assert not any(f["verdict"] == "CONFLICT" for f in result["findings"])
    print(f"PASS: {len(cases)} API regression scenarios with independent expected verdicts.")


if __name__ == "__main__":
    run()
