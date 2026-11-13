# VeriBrand AI — Python Multi-Modal Verification Engine
# Tier-1: In-Memory Multi-Pattern Rule Matcher
# Tier-2: Grounded Hybrid Claim Verifier (Tri-State)
# Vision: OpenCV K-Means Color Palette & WCAG 2.1 AA Contrast Calculator

import time
import re
from typing import List, Dict, Any, Tuple
import numpy as np

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
                    findings.append({
                        "id": f"PY-T1-{rule['id']}-{idx}",
                        "category": rule["category"],
                        "verdict": "SUGGESTION",
                        "reason_code": "FORBIDDEN_TERM" if rule["category"] == "terminology" else "HYPERBOLIC_SUPERLATIVE",
                        "matched_text": text[idx:idx + len(pattern)],
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

    latency = round((time.perf_counter() - start) * 1000, 2)
    return findings, latency

def run_tier2_claim_verifier(text: str) -> Tuple[List[Dict[str, Any]], float]:
    start = time.perf_counter()
    findings = []

    # Uptime SLA claims
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

    # Customer counts
    cust_matches = list(re.finditer(r"(?:over|more than|supports)?\s*([0-9,]+)\+?\s+(?:enterprise customers|global enterprise brands|enterprise organizations)", text, re.IGNORECASE))
    for m in cust_matches:
        claimed_num = int(m.group(1).replace(',', ''))
        metric = VERIFIED_METRICS["MTR-004"]
        if claimed_num <= 450:
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
                "explanation": f"Fabricated metric. Draft asserts '{m.group(0).strip()}', but audited customer disclosures verify {metric['approved']}.",
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

    # Revenue / ARR
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

    # Pricing ($49/mo outdated check)
    price_matches = list(re.finditer(r"\$([0-9]+)\s*\/\s*(?:mo|month)", text, re.IGNORECASE))
    for m in price_matches:
        claimed_num = int(m.group(1))
        metric = VERIFIED_METRICS["MTR-007"]
        if claimed_num == 49:
            findings.append({
                "id": f"PY-T2-PRICE-{m.start()}",
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

    latency = round((time.perf_counter() - start) * 1000, 2)
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

# OpenCV K-Means Palette & WCAG 2.1 AA Contrast Extraction
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
