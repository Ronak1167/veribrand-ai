# VeriBrand AI — Appeal Revision Security Test Suite
# Empirically proves that appeals accepted on Revision 1 CANNOT authorize approval of Revision 2.

import sys
import os
import requests
import json

BASE_URL = os.environ.get("VERIBRAND_URL", "http://localhost:3000")

def run_tests():
    print("=" * 65)
    print("  VERIBRAND AI — APPEAL REVISION SCOPE SECURITY TEST")
    print("=" * 65)

    session = requests.Session()

    # Step 1: Login as Creator and create a submission with a critical violation
    print("\n[Step 1] Creating Submission with SLA Contradiction (99.999% uptime)...")
    res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "creator@inkloom.ai",
        "password": "Password123!"
    })
    assert res.status_code == 200, f"Creator login failed: {res.text}"

    create_res = session.post(f"{BASE_URL}/api/submissions", json={
        "title": "Revision Security Test Press Release",
        "channel": "press_release",
        "originalText": "Inkloom guarantees 99.999% uptime across all enterprise clusters.",
        "creatorName": "Elena Rostova"
    })
    assert create_res.status_code == 201, f"Create submission failed: {create_res.text}"
    sub_data = create_res.json()["submission"]
    sub_id = sub_data["id"]
    current_rev = sub_data["currentRevisionId"]
    assert "REV-1" in current_rev, f"Expected currentRevisionId to contain REV-1, got {current_rev}"
    print(f"  -> Created Submission {sub_id} with Revision {current_rev}")

    # Step 2: Login as Reviewer
    print("\n[Step 2] Authenticating as Reviewer...")
    login_rev = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "reviewer@inkloom.ai",
        "password": "Password123!"
    })
    assert login_rev.status_code == 200, f"Reviewer login failed: {login_rev.text}"

    # Step 3: Attempting standard approval on REV-1 without appeal must fail (409)
    print("\n[Step 3] Attempting standard approval on REV-1 without appeal...")
    app_fail = session.post(f"{BASE_URL}/api/submissions/{sub_id}/review", json={
        "action": "approve",
        "approvalMode": "standard",
        "reviewerName": "Marcus Vance"
    })
    assert app_fail.status_code in [400, 409], f"Expected 400 or 409, got {app_fail.status_code}: {app_fail.text}"
    print("  -> PASSED: Unresolved critical finding blocked un-appealed approval.")

    # Step 4: Adjudicate appeal accepting all critical findings on REV-1
    print("\n[Step 4] Accepting appeals for critical findings on REV-1...")
    critical_findings = [f for f in sub_data["auditResult"]["findings"] if f["severity"] == "critical"]
    assert len(critical_findings) > 0, "Expected at least 1 critical finding"

    for f in critical_findings:
        appeal_res = session.post(f"{BASE_URL}/api/submissions/{sub_id}/appeal", json={
            "revisionId": current_rev,
            "findingId": f["id"],
            "decision": "accepted",
            "rationale": "Testing approval gate on REV-1",
            "reviewerName": "Marcus Vance"
        })
        assert appeal_res.status_code in [200, 201], f"Appeal submission failed: {appeal_res.text}"
    print(f"  -> PASSED: Appeals successfully accepted for {current_rev}.")

    # Step 4b: Standard approval on REV-1 must now succeed
    print("\n[Step 4b] Testing standard approval on fully-appealed REV-1...")
    app_rev1 = session.post(f"{BASE_URL}/api/submissions/{sub_id}/review", json={
        "action": "approve",
        "approvalMode": "standard",
        "reviewerName": "Marcus Vance"
    })
    assert app_rev1.status_code == 200, f"Expected 200 for appealed approval on REV-1, got {app_rev1.status_code}: {app_rev1.text}"
    print("  -> PASSED: REV-1 successfully approved with all accepted appeals.")

    # Step 5: Now request changes to move submission to 'changes_requested' so creator can revise
    print("\n[Step 5] Requesting changes on submission...")
    req_changes = session.post(f"{BASE_URL}/api/submissions/{sub_id}/review", json={
        "action": "request_changes",
        "commentText": "Please adjust wording for general release."
    })
    assert req_changes.status_code == 200, f"Request changes failed: {req_changes.text}"

    # Step 6: Creator resubmits Revision 2 STILL containing 99.999% uptime
    print("\n[Step 6] Creator resubmits revision with persistent critical finding...")
    resubmit_res = session.post(f"{BASE_URL}/api/submissions/{sub_id}/resubmit", json={
        "revisedText": "Inkloom proudly guarantees 99.999% uptime in Revision 2.",
        "creatorName": "Elena Rostova"
    })
    assert resubmit_res.status_code == 200, f"Resubmission failed: {resubmit_res.text}"
    updated_sub = resubmit_res.json()
    new_rev = updated_sub["currentRevisionId"]
    assert "REV-2" in new_rev, f"Expected currentRevisionId containing REV-2, got {new_rev}"
    print(f"  -> Successfully resubmitted as {new_rev}")

    # Step 7: CRITICAL SECURITY CHECK:
    # Attempting to approve Revision 2 using standard mode MUST FAIL because the appeal belonged to REV-1!
    print("\n[Step 7] SECURITY GATE: Attempting standard approval on REV-2...")
    rev2_app = session.post(f"{BASE_URL}/api/submissions/{sub_id}/review", json={
        "action": "approve",
        "approvalMode": "standard",
        "reviewerName": "Marcus Vance"
    })
    assert rev2_app.status_code in [400, 409], f"SECURITY FAILURE! REV-2 was approved using REV-1's appeal! Status: {rev2_app.status_code}, Body: {rev2_app.text}"
    err_msg = rev2_app.json().get("error", "")
    assert "critical unresolved findings" in err_msg.lower(), f"Unexpected error message: {err_msg}"
    print("  -> PASSED: Server strictly rejected REV-2 approval despite REV-1 accepted appeal!")

    # Step 8: Resubmit clean Revision 3 (with compliant 99.9% uptime and proper Inkloom AI trademark)
    print("\n[Step 8] Creator resubmits compliant Revision 3 (99.9% uptime)...")
    resubmit_clean = session.post(f"{BASE_URL}/api/submissions/{sub_id}/resubmit", json={
        "revisedText": "Inkloom AI delivers 99.9% uptime backed by SOC 2 Type II compliance.",
        "creatorName": "Elena Rostova"
    })
    assert resubmit_clean.status_code == 200, f"Resubmit clean failed: {resubmit_clean.text}"
    clean_sub = resubmit_clean.json()
    assert "REV-3" in clean_sub["currentRevisionId"]

    # Step 9: Standard approval on clean Revision 3 MUST SUCCEED
    print("\n[Step 9] Approving compliant Revision 3...")
    approve_clean = session.post(f"{BASE_URL}/api/submissions/{sub_id}/review", json={
        "action": "approve",
        "approvalMode": "standard",
        "reviewerName": "Marcus Vance"
    })
    assert approve_clean.status_code == 200, f"Expected 200 for clean approval, got {approve_clean.status_code}: {approve_clean.text}"
    final_sub = approve_clean.json()
    assert final_sub["status"] == "approved"
    assert final_sub["sha256Hash"] is not None and len(final_sub["sha256Hash"]) == 64
    print(f"  -> PASSED: Revision 3 successfully approved with SHA-256 hash: {final_sub['sha256Hash'][:24]}...")

    print("\n" + "=" * 65)
    print("  ALL APPEAL REVISION SECURITY TESTS PASSED (100%)")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()
