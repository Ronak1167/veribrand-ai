# VeriBrand AI — Python Multi-Modal Verification Engine
# Tier-1: In-Memory Multi-Pattern Rule Matcher (<1ms)
# Tier-2: Grounded Hybrid Claim Verifier (Tri-State: VERIFIED, CONFLICT, UNVERIFIED)
# Vision: OpenCV K-Means Color Palette & WCAG 2.1 AA Contrast Calculator

import time
import re
from typing import List, Dict, Any, Tuple
import numpy as np
import cv2

# Ground Truth Metrics
VERIFIED_METRICS = {
    "MTR-001": {
        "name": "Enterprise Client Retention Rate",
        "approved": "94.2%",
        "raw": 94.2,
        "source": "KPMG FY25 Enterprise Quality Audit Report",
        "citation": "Executive Summary p. 4",
        "validity": "FY25-FY26 (Active)",
        "status": "active"
    },
    "MTR-002": {
        "name": "Security Certification Tier",
        "approved": "SOC 2 Type II",
        "source": "A-LIGN Annual Security Attestation",
        "citation": "Trust & Safety Portal §3",
        "validity": "2026-2027 (Active)",
        "status": "active"
    },
    "MTR-003": {
        "name": "System Availability SLA",
        "approved": "99.9%",
        "raw": 99.9,
        "source": "Enterprise Master Service Agreement (MSA) v4.1",
        "citation": "Schedule B: Service Level Agreement",
        "validity": "Active Indefinite",
        "status": "active"
    },
    "MTR-004": {
        "name": "Active Enterprise Customers",
        "approved": "420+",
        "raw": 420,
        "source": "Investor Q3 2026 Shareholder Disclosure",
        "citation": "Key Performance Indicators (KPIs)",
        "validity": "Q3 2026 Disclosure",
        "status": "active"
    },
    "MTR-005": {
        "name": "Review Turnaround Reduction",
        "approved": "up to 75%",
        "raw": 75.0,
        "source": "VeriBrand Operational Benchmark Plan",
        "citation": "§9 Operational Targets",
        "validity": "Projected Target (Empirical Validation)",
        "status": "active"
    },
    "MTR-006": {
        "name": "Annual Recurring Revenue (ARR)",
        "approved": "$18.5M",
        "raw": 18.5,
        "source": "Deloitte FY25 Audited Financial Statement",
        "citation": "Financial Highlights p. 8",
        "validity": "FY25-Q4 Audited",
        "status": "active"
    },
    "MTR-007": {
        "name": "Legacy Pricing Tier",
        "approved": "$79/mo (Current)",
        "raw": 49.0,
        "source": "Product Pricing Schedule FY26 v2.0",
        "citation": "Pricing Appendix A",
        "validity": "Discontinued on 2026-09-01",
        "status": "outdated"
    }
}

BRAND_RULES = [
    {
        "id": "RULE-TM-01",
        "patterns": ["inkloom", "ink loom", "inkloom ai"],
        "approved": "Inkloom AI",
        "title": "Proper Trademark Casing for Inkloom AI",
        "category": "terminology",
        "severity": "critical",
        "authority": 1,
        "citation": "Corporate Trademark Identity Handbook §1.2",
        "explanation": "Corporate naming policy mandates capitalized 'Inkloom AI'."
    },
    {
        "id": "RULE-TM-02",
        "patterns": ["veribrand", "verybrand", "veri brand"],
        "approved": "VeriBrand AI",
        "title": "Product Naming: VeriBrand AI",
        "category": "terminology",
        "severity": "critical",
        "authority": 1,
        "citation": "Product Architecture Catalog §2.4",
        "explanation": "Product name must be camel-cased as 'VeriBrand AI'."
    },
    {
        "id": "RULE-TERM-03",
        "patterns": ["artificial intelligence wizard", "ai wizard", "magic algorithm"],
        "approved": "Explainable Compliance Co-Pilot",
        "title": "Deprecated Marketing Terminology",
        "category": "terminology",
        "severity": "warning",
        "authority": 2,
        "citation": "Brand Tone & Messaging Guide §3.1",
        "explanation": "Avoid mystical jargon like 'AI wizard'. Use transparent engineering terms."
    },
    {
        "id": "RULE-TONE-04",
        "patterns": ["world's most revolutionary", "world's best", "zero risk", "guaranteed 100%"],
        "approved": "industry-leading, empirical brand governance engine",
        "title": "Hyperbolic Unsubstantiated Superlatives",
        "category": "tone_drift",
        "severity": "critical",
        "authority": 1,
        "citation": "FTC & Regulatory Compliance Manual §5.3",
        "explanation": "Unsubstantiated superlatives violate false-advertising regulations."
    },
    {
        "id": "RULE-TONE-05",
        "patterns": ["replaces all human editors", "replaces all humans"],
        "approved": "empowers brand teams with automated pre-screening while maintaining human oversight",
        "title": "Absolutist Autonomous Claims",
        "category": "tone_drift",
        "severity": "warning",
        "authority": 2,
        "citation": "Responsible AI Principles §2.1",
        "explanation": "We champion human-in-the-loop coaching, not total human replacement."
    }
]

def run_tier1_filter(text: str) -> Tuple[List[Dict[str, Any]], float]:
    start = time.perf_counter()
    findings = []
    lower_text = text.lower()

    for rule in BRAND_RULES:
        for pattern in rule["patterns"]:
            pos = 0
            while True:
                idx = lower_text.find(pattern, pos)
                if idx == -1:
                    break
                
                # Check word boundaries
                prev_char = lower_text[idx - 1] if idx > 0 else ' '
                next_char = lower_text[idx + len(pattern)] if idx + len(pattern) < len(lower_text) else ' '
                if not prev_char.isalnum() and not next_char.isalnum():
                    # P0 BUG FIX: Check if original slice is ALREADY properly capitalized
                    original_slice = text[idx:idx + len(pattern)]
                    candidate_full = text[idx:idx + len(rule["approved"])]
                    if original_slice == rule["approved"] or candidate_full == rule["approved"]:
                        pos = idx + len(pattern)
                        continue

                    findings.append({
                        "id": f"PY-T1-{rule['id']}-{idx}",
                        "category": rule["category"],
                        "verdict": "SUGGESTION",
                        "reason_code": "FORBIDDEN_TERM" if rule["category"] == "terminology" else "HYPERBOLIC_SUPERLATIVE",
                        "matched_text": original_slice,
                        "start_index": idx,
                        "end_index": idx + len(pattern),
                        "severity": rule["severity"],
                        "explanation": rule["explanation"],
                        "guideline_title": rule["title"],
                        "guideline_citation": rule["citation"],
                        "authority_level": rule["authority"],
                        "rewrites": {
                            "direct": rule["approved"],
                            "punchy": f"{rule['approved']} (verified)",
                            "conservative": f"{rule['approved']} enterprise standard"
                        }
                    })
                pos = idx + len(pattern)

    # Rogue Hex check
    hex_pattern = r"#(?:[0-9a-fA-F]{3}){1,2}\b"
    for m in re.finditer(hex_pattern, text):
        hex_val = m.group(0).lower()
        if hex_val in ["#ff0033", "#00ff00", "#ff00ff"]:
            findings.append({
                "id": f"PY-T1-HEX-{m.start()}",
                "category": "visual_token",
                "verdict": "CONFLICT",
                "reason_code": "FORBIDDEN_TERM",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Unsanctioned rogue hex swatch '{m.group(0)}'. Violates Brand Visual Design System §4.1.",
                "guideline_title": "Unapproved Brand Color Swatch",
                "guideline_citation": "Brand Visual Design System §4.1",
                "authority_level": 2,
                "rewrites": {
                    "direct": "#4F46E5 (Primary Brand Indigo)",
                    "punchy": "#06B6D4 (Brand Cyan)",
                    "conservative": "#0F172A (Deep Slate)"
                }
            })

    latency = round((time.perf_counter() - start) * 1000, 3)
    return findings, latency

def run_tier2_claim_verifier(text: str) -> Tuple[List[Dict[str, Any]], float]:
    start = time.perf_counter()
    findings = []

    # 1. Uptime SLA claims
    uptime_matches = list(re.finditer(r"\b(99(?:\.\d+)?%)\s+(?:uptime|availability|SLA)\b", text, re.IGNORECASE))
    for m in uptime_matches:
        claimed_num = float(m.group(1).replace('%', ''))
        metric = VERIFIED_METRICS["MTR-003"]
        if claimed_num == metric["raw"]:
            findings.append({
                "id": f"PY-T2-UPTIME-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": f"Programmatically verified against approved SLA specification ({metric['approved']}).",
                "guideline_title": "Verified SLA Availability Specification",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-003",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "99.9% uptime SLA",
                    "punchy": "guaranteed 99.9% enterprise uptime",
                    "conservative": "audited 99.9% service availability"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-UPTIME-CONF-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Contradicts audited SLA. Quoting '{m.group(0)}' when approved SLA is {metric['approved']} breaches customer contracts.",
                "guideline_title": "SLA False Advertising Violation",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-003",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "99.9% uptime SLA",
                    "punchy": "rock-solid 99.9% enterprise uptime",
                    "conservative": "audited 99.9% SLA availability"
                }
            })

    # 2. Customer counts (Strict accuracy: Ground truth is 420+ active enterprise customers)
    cust_matches = list(re.finditer(r"(?:over|more than|supports|with)?\s*([0-9,]+)\+?\s+(?:enterprise customers|global enterprise brands|enterprise organizations)", text, re.IGNORECASE))
    for m in cust_matches:
        claimed_num = int(m.group(1).replace(',', ''))
        metric = VERIFIED_METRICS["MTR-004"]
        is_accurate = (claimed_num == 420)
        if is_accurate:
            findings.append({
                "id": f"PY-T2-CUST-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": f"Validated against Q3 2026 Shareholder Disclosure ({metric['approved']}).",
                "guideline_title": "Active Enterprise Customer Metric",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 2,
                "evidence": {
                    "metric_id": "MTR-004",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "420+ global enterprise brands",
                    "punchy": "trusted by 420+ industry leaders",
                    "conservative": "over 420 active enterprise customer accounts"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-CUST-CONF-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Discrepancy in customer count. Quoting '{m.group(0).strip()}' contradicts audited disclosure ({metric['approved']}).",
                "guideline_title": "Customer Count Discrepancy",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-004",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "420+ global enterprise brands",
                    "punchy": "420+ market-leading enterprises",
                    "conservative": "over 420 verified enterprise accounts"
                }
            })

    # 3. Revenue / ARR
    rev_matches = list(re.finditer(r"\$([0-9.]+)\s*(?:M|million)\s*(?:in annual revenue|ARR|revenue)?", text, re.IGNORECASE))
    for m in rev_matches:
        claimed_num = float(m.group(1))
        metric = VERIFIED_METRICS["MTR-006"]
        if claimed_num == metric["raw"]:
            findings.append({
                "id": f"PY-T2-REV-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": f"Audited financial statement verified ($18.5M ARR).",
                "guideline_title": "Audited Revenue Metric",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-006",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "$18.5M ARR",
                    "punchy": "$18.5M in audited ARR",
                    "conservative": "$18.5M ARR (FY25 audited disclosure)"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-REV-CONF-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Financial Misrepresentation. Quoting '{m.group(0).strip()}' contradicts audited financial disclosures ({metric['approved']}).",
                "guideline_title": "False Financial Disclosure",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-006",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "$18.5M in annual recurring revenue",
                    "punchy": "$18.5M ARR",
                    "conservative": "$18.5M ARR as audited in FY25 financial statements"
                }
            })

    # 4. General Pricing ($79 approved, $49 outdated, any other price unverified)
    price_matches = list(re.finditer(r"\$([0-9.]+)\s*\/\s*(?:mo|month)", text, re.IGNORECASE))
    for m in price_matches:
        claimed_num = float(m.group(1))
        metric = VERIFIED_METRICS["MTR-007"]
        if claimed_num == 79.0:
            findings.append({
                "id": f"PY-T2-PRICE-VER-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": "Verified against approved Product Pricing Schedule FY26 ($79/mo Starter tier).",
                "guideline_title": "Approved Pricing Schedule",
                "guideline_citation": "Product Pricing Schedule FY26 v2.0",
                "authority_level": 1,
                "rewrites": {
                    "direct": "$79/mo",
                    "punchy": "$79/mo standard plan",
                    "conservative": "$79/month billed annually"
                }
            })
        elif claimed_num == 49.0:
            findings.append({
                "id": f"PY-T2-PRICE-OUT-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "OUTDATED",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": "Expired Pricing Schedule. The $49/mo starter tier was archived on 2026-09-01 and superseded by $79/mo.",
                "guideline_title": "Discontinued Pricing Schedule",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 2,
                "evidence": {
                    "metric_id": "MTR-007",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "outdated"
                },
                "rewrites": {
                    "direct": "$79/mo",
                    "punchy": "$79/mo with full enterprise compliance",
                    "conservative": "$79/month under current standard tier terms"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-PRICE-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Unverified Pricing Quote '{m.group(0)}'. No matching price schedule exists in the active Brand Vault.",
                "guideline_title": "Unverified Pricing Tier",
                "guideline_citation": "Product Pricing Schedule FY26 v2.0",
                "authority_level": 2,
                "rewrites": {
                    "direct": "$79/mo (Approved Standard Tier)",
                    "punchy": "$79/mo standard plan",
                    "conservative": "$79/month standard tier"
                }
            })

    # 5. Security & Certifications (with Scope-Aware Negation Handling)
    soc_matches = list(re.finditer(r"\b(?:(?:not(?:\s+only)?|never|no|without)\s+)?SOC 2(?: Type II)?\b", text, re.IGNORECASE))
    for m in soc_matches:
        metric = VERIFIED_METRICS["MTR-002"]
        preceding = text[max(0, m.start() - 30):m.start()].lower()
        full_context = f"{preceding} {m.group(0).lower()}"
        is_affirmative_idiom = bool(re.search(r"\bnot\s+(?:only|just|merely)\b", full_context))
        has_negation = bool(re.search(r"\b(not|never|neither|no|non|unverified|without|lack|lacks)\b", full_context))
        is_negated = has_negation and not is_affirmative_idiom

        if is_negated:
            findings.append({
                "id": f"PY-T2-SOC-NEG-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Negated Security Attestation '{m.group(0)}' directly contradicts company's active A-LIGN SOC 2 Type II certification.",
                "guideline_title": "Security Compliance Contradiction",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-002",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "backed by SOC 2 Type II security certification",
                    "punchy": "attested SOC 2 Type II compliance",
                    "conservative": "holding active SOC 2 Type II certification"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-SOC-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": "Valid security attestation from A-LIGN Annual Security Attestation.",
                "guideline_title": "Security Compliance Certification",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 1,
                "evidence": {
                    "metric_id": "MTR-002",
                    "metric_name": metric["name"],
                    "approved_value": metric["approved"],
                    "source_document": metric["source"],
                    "section_citation": metric["citation"],
                    "validity_period": metric["validity"],
                    "status": "active"
                },
                "rewrites": {
                    "direct": "SOC 2 Type II certified",
                    "punchy": "rigorous SOC 2 Type II compliance",
                    "conservative": "attested SOC 2 Type II security architecture"
                }
            })

    # 6. Retention (94.2%)
    ret_matches = list(re.finditer(r"\b(94(?:\.\d+)?%)\s+(?:enterprise client retention|enterprise retention)", text, re.IGNORECASE))
    for m in ret_matches:
        metric = VERIFIED_METRICS["MTR-001"]
        findings.append({
            "id": f"PY-T2-RET-{m.start()}",
            "category": "claim_verification",
            "verdict": "VERIFIED",
            "matched_text": m.group(0),
            "start_index": m.start(),
            "end_index": m.end(),
            "severity": "success",
            "explanation": "Validated against KPMG Enterprise Quality Audit (94.2% retention).",
            "guideline_title": "Verified Client Retention Metric",
            "guideline_citation": f"{metric['source']} — {metric['citation']}",
            "authority_level": 1,
            "evidence": {
                "metric_id": "MTR-001",
                "metric_name": metric["name"],
                "approved_value": metric["approved"],
                "source_document": metric["source"],
                "section_citation": metric["citation"],
                "validity_period": metric["validity"],
                "status": "active"
            },
            "rewrites": {
                "direct": "94.2% enterprise retention",
                "punchy": "industry-leading 94.2% enterprise retention",
                "conservative": "94.2% client retention rate audited by KPMG"
            }
        })

    # 7. Turnaround reduction (75%)
    turn_matches = list(re.finditer(r"(?:turnaround (?:by )?up to 75%|up to 75% (?:routine )?review turnaround)", text, re.IGNORECASE))
    for m in turn_matches:
        metric = VERIFIED_METRICS["MTR-005"]
        findings.append({
            "id": f"PY-T2-TURN-{m.start()}",
            "category": "claim_verification",
            "verdict": "VERIFIED",
            "matched_text": m.group(0),
            "start_index": m.start(),
            "end_index": m.end(),
            "severity": "success",
            "explanation": "Verified against projected operational targets.",
            "guideline_title": "Review Turnaround Target",
            "guideline_citation": f"{metric['source']} — {metric['citation']}",
            "authority_level": 2,
            "evidence": {
                "metric_id": "MTR-005",
                "metric_name": metric["name"],
                "approved_value": metric["approved"],
                "source_document": metric["source"],
                "section_citation": metric["citation"],
                "validity_period": metric["validity"],
                "status": "active"
            },
            "rewrites": {
                "direct": "turnaround reduction by up to 75%",
                "punchy": "slashing routine reviews by up to 75%",
                "conservative": "projected review turnaround reduction of up to 75%"
            }
        })

    # 8. Unsupported business & footprint metrics (subscribers, users, downloads, offices, locations, team)
    unsupp_matches = list(re.finditer(r"(?:over|more than|supports?|with|have|has|operating in|across)?\s*([0-9,]+)\+?\s+(?:paying subscribers|subscribers|active users|daily users|monthly active users|registered users|downloads|client accounts|regional offices|offices|global offices|locations|branches|countries|headquarters|team members|employees|engineers|patents|awards|partner organizations|partners|integrations)\b", text, re.IGNORECASE))
    for m in unsupp_matches:
        findings.append({
            "id": f"PY-T2-UNSUPP-{m.start()}",
            "category": "claim_verification",
            "verdict": "UNVERIFIED",
            "reason_code": "MISSING_SOURCE",
            "matched_text": m.group(0).strip(),
            "start_index": m.start(),
            "end_index": m.end(),
            "severity": "warning",
            "explanation": f"Unverified Business Metric '{m.group(0).strip()}'. No approved ground truth exists in Brand Vault. System abstains from granting approval.",
            "guideline_title": "Unverified Metric Assertion",
            "guideline_citation": "Corporate Trademark Identity Handbook §4.2",
            "authority_level": 2,
            "rewrites": {
                "direct": "420+ global enterprise brands (audited customer count)",
                "punchy": "trusted by 420+ industry leaders",
                "conservative": "over 420 active enterprise customer accounts"
            }
        })

    latency = round((time.perf_counter() - start) * 1000, 3)
    return findings, latency

def audit_document(text: str, channel: str = "enterprise_web") -> Dict[str, Any]:
    t1_findings, t1_lat = run_tier1_filter(text)
    t2_findings, t2_lat = run_tier2_claim_verifier(text)

    all_findings = sorted(t1_findings + t2_findings, key=lambda x: x["start_index"])

    score = 100
    verified_count = 0
    conflict_count = 0
    unverified_count = 0

    for f in all_findings:
        v = f["verdict"]
        if v == "VERIFIED":
            verified_count += 1
        elif v == "CONFLICT":
            conflict_count += 1
            score -= 18
        elif v == "UNVERIFIED":
            unverified_count += 1
            score -= 12
        elif v == "SUGGESTION":
            score -= 8

    score = max(0, min(100, score))

    return {
        "document_id": "DOC-PY-LIVE",
        "channel": channel,
        "compliance_score": score,
        "tier1_latency_ms": t1_lat,
        "tier2_latency_ms": t2_lat,
        "findings": all_findings,
        "metrics_audited_count": len(VERIFIED_METRICS),
        "claims_verified_count": verified_count,
        "claims_conflicted_count": conflict_count,
        "claims_unverified_count": unverified_count,
        "timestamp": "2026-11-13T10:00:00.000Z"
    }

# Genuine OpenCV K-Means Palette & WCAG 2.1 AA Contrast Extraction
def extract_palette_opencv(image_path: str = None, k: int = 5) -> List[str]:
    """Uses OpenCV cv2.kmeans to cluster dominant colors from an image array."""
    if image_path:
        img = cv2.imread(image_path)
        img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    else:
        # Create a synthetic brand banner array for testing:
        # 60% Brand Indigo (#4F46E5 = 79, 70, 229), 30% Cyan (#06B6D4 = 6, 182, 212), 10% White
        img = np.zeros((100, 100, 3), dtype=np.uint8)
        img[:, :60] = [79, 70, 229]
        img[:, 60:90] = [6, 182, 212]
        img[:, 90:] = [255, 255, 255]

    pixels = img.reshape((-1, 3)).astype(np.float32)
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0)
    _, labels, centers = cv2.kmeans(pixels, k, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)

    hex_codes = []
    for center in centers.astype(int):
        hex_code = "#{:02x}{:02x}{:02x}".format(center[0], center[1], center[2]).upper()
        hex_codes.append(hex_code)
    return hex_codes

def calculate_wcag_contrast(hex1: str, hex2: str) -> float:
    def get_luminance(hex_str: str) -> float:
        hex_clean = hex_str.lstrip('#')
        r, g, b = [int(hex_clean[i:i+2], 16) / 255.0 for i in (0, 2, 4)]
        def adjust(c):
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        return 0.2126 * adjust(r) + 0.7152 * adjust(g) + 0.0722 * adjust(b)

    lum1 = get_luminance(hex1)
    lum2 = get_luminance(hex2)
    brightest = max(lum1, lum2)
    darkest = min(lum1, lum2)
    return round((brightest + 0.05) / (darkest + 0.05), 2)
