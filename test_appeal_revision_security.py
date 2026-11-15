"""Authenticated integration test for revision-bound appeal authorization.

Set VERIBRAND_TEST_CREATOR_EMAIL/PASSWORD and VERIBRAND_TEST_REVIEWER_EMAIL/PASSWORD
to existing test accounts before running. No demo credentials are embedded.
"""
import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get("VERIBRAND_URL", "http://localhost:3000")
CREATOR_EMAIL = os.environ.get("VERIBRAND_TEST_CREATOR_EMAIL")
CREATOR_PASSWORD = os.environ.get("VERIBRAND_TEST_CREATOR_PASSWORD")
REVIEWER_EMAIL = os.environ.get("VERIBRAND_TEST_REVIEWER_EMAIL")
REVIEWER_PASSWORD = os.environ.get("VERIBRAND_TEST_REVIEWER_PASSWORD")

if not (CREATOR_EMAIL and CREATOR_PASSWORD and REVIEWER_EMAIL and REVIEWER_PASSWORD):
    test_env_path = os.path.join(os.path.dirname(__file__), ".env.test.local")
    if os.path.exists(test_env_path):
        with open(test_env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k == "VERIBRAND_TEST_CREATOR_EMAIL" and not CREATOR_EMAIL:
                    CREATOR_EMAIL = v
                elif k == "VERIBRAND_TEST_CREATOR_PASSWORD" and not CREATOR_PASSWORD:
                    CREATOR_PASSWORD = v
                elif k == "VERIBRAND_TEST_REVIEWER_EMAIL" and not REVIEWER_EMAIL:
                    REVIEWER_EMAIL = v
                elif k == "VERIBRAND_TEST_REVIEWER_PASSWORD" and not REVIEWER_PASSWORD:
                    REVIEWER_PASSWORD = v


class ApiClient:
    def __init__(self):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, method, path, body=None):
        headers = {}
        cookie_header = "; ".join(f"{c.name}={c.value}" for c in self.cookies)
        if cookie_header:
            headers["Cookie"] = cookie_header
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        request = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=15) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else {}
        except urllib.error.HTTPError as error:
            raw = error.read()
            try:
                payload = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                payload = {"raw": raw.decode("utf-8", errors="replace")}
            return error.code, payload


def login(email, password):
    client = ApiClient()
    status, data = client.request("POST", "/api/auth/login", {"email": email, "password": password})
    assert status == 200, f"Login failed for {email}: {status} {data}"
    assert "token" not in data, "Session token must not be returned in response JSON."
    return client


def run_tests():
    missing = [name for name, value in {
        "VERIBRAND_TEST_CREATOR_EMAIL": CREATOR_EMAIL,
        "VERIBRAND_TEST_CREATOR_PASSWORD": CREATOR_PASSWORD,
        "VERIBRAND_TEST_REVIEWER_EMAIL": REVIEWER_EMAIL,
        "VERIBRAND_TEST_REVIEWER_PASSWORD": REVIEWER_PASSWORD,
    }.items() if not value]
    if missing:
        print("SKIP: configure test accounts first: " + ", ".join(missing))
        return 2

    creator = login(CREATOR_EMAIL, CREATOR_PASSWORD)
    reviewer = login(REVIEWER_EMAIL, REVIEWER_PASSWORD)

    created_status, created_data = creator.request("POST", "/api/submissions", {
        "title": "Revision-bound appeal integration test",
        "channel": "press_release",
        "text": "We guarantee 99.999% uptime.",
    })
    assert created_status == 201, created_data
    sub = created_data["submission"]
    sub_id = sub["id"]
    rev1 = sub["currentRevisionId"]
    assert rev1 and sub["creatorName"]

    denied_status, denied_data = creator.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "request_changes",
        "commentText": "A creator must not perform reviewer actions.",
    })
    assert denied_status == 403, f"Creator reviewer action was not denied: {denied_status} {denied_data}"

    blocked_status, blocked_data = reviewer.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "approve", "approvalMode": "standard",
    })
    assert blocked_status == 409, f"Critical finding was not blocked: {blocked_status} {blocked_data}"

    critical = [f for f in sub["auditResult"]["findings"] if f.get("severity") == "critical" and f.get("verdict") != "VERIFIED"]
    assert critical, "Expected a critical finding for the test claim."
    finding = critical[0]

    appeal_status, appeal_data = reviewer.request("POST", f"/api/submissions/{sub_id}/appeal", {
        "revisionId": rev1,
        "findingId": finding["id"],
        "decision": "accepted",
        "rationale": "Accepted for revision one only in this automated security test.",
    })
    assert appeal_status == 201, f"Appeal decision failed: {appeal_status} {appeal_data}"

    change_status, change_data = reviewer.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "request_changes",
        "commentText": "Revise the uptime assertion and provide an approved source.",
    })
    assert change_status == 200, change_data

    revision2_status, revision2_data = creator.request("POST", f"/api/submissions/{sub_id}/resubmit", {
        "revisedText": "We guarantee 99.98% uptime.",
    })
    assert revision2_status == 200, revision2_data
    sub2 = revision2_data["submission"]
    rev2 = sub2["currentRevisionId"]
    assert rev2 != rev1 and sub2["status"] == "pending_review"

    stale_status, stale_data = reviewer.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "approve", "approvalMode": "standard",
    })
    assert stale_status == 409, f"Revision 2 inherited revision 1 appeal: {stale_status} {stale_data}"

    requested_status, requested_data = reviewer.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "request_changes",
        "commentText": "Use the currently verified SLA statement.",
    })
    assert requested_status == 200, requested_data

    revision3_status, revision3_data = creator.request("POST", f"/api/submissions/{sub_id}/resubmit", {
        "revisedText": "Inkloom AI provides 99.9% uptime.",
    })
    assert revision3_status == 200, revision3_data
    sub3 = revision3_data["submission"]
    assert sub3["currentRevisionId"] != rev2

    approved_status, approved_data = reviewer.request("POST", f"/api/submissions/{sub_id}/review", {
        "action": "approve", "approvalMode": "standard",
    })
    assert approved_status == 200, f"Clean current revision was not approved: {approved_status} {approved_data}"
    assert approved_data["submission"]["status"] == "approved"

    detail_status, detail = reviewer.request("GET", f"/api/submissions/{sub_id}")
    assert detail_status == 200, detail
    assert detail.get("integrityVerified") is True, "Server-side approval hash verification failed."

    own_status, own_detail = creator.request("GET", f"/api/submissions/{sub_id}")
    assert own_status == 200, own_detail

    print("PASS: creator/reviewer role separation.")
    print("PASS: canonical server-generated submission ID and database persistence.")
    print("PASS: revision-one accepted appeal cannot authorize revision two.")
    print("PASS: new revision requires fresh evaluation and can be approved when clean.")
    print("PASS: server-side approval hash verification returns integrityVerified=true.")
    return 0


if __name__ == "__main__":
    sys.exit(run_tests())
