# VeriBrand AI — Python Multi-Modal Verification Engine
# Tier-1: In-Memory Multi-Pattern Rule Matcher (<1ms)
# Tier-2: Grounded Hybrid Claim Verifier (Tri-State: VERIFIED, CONFLICT, UNVERIFIED)
# Vision: OpenCV K-Means Color Palette & WCAG 2.1 AA Contrast Calculator

import time
import re
from datetime import datetime, timezone
from collections import deque
from typing import List, Dict, Any, Tuple, Optional
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
        "name": "Active Enterprise Customer Accounts",
        "approved": "420+",
        "raw": 420,
        "unit": "accounts",
        "source": "Investor Q3 2026 Shareholder Disclosure",
        "citation": "Key Performance Indicators (KPIs)",
        "validity": "Q3 2026 Disclosure",
        "status": "active",
        "tolerance": "Audited ground truth is '420+ active enterprise customer accounts'. Lower-bound verification accepts '420+' or 'at least 420'. Deficits under 420 understate audited accounts (CONFLICT), while exact numbers above 420 or unsubstantiated claims of 1,000+ trigger UNVERIFIED lacking quarterly shareholder filings."
    },
    "MTR-005": {
        "name": "Review Turnaround Reduction",
        "approved": "up to 75%",
        "raw": 75.0,
        "source": "VeriBrand Operational Benchmark Plan",
        "citation": "§9 Operational Targets",
        "validity": "Projected Target (Empirical Validation)",
        "status": "active",
        "tolerance": "Must be framed as a projected engineering target ('projected up to 75%' or 'targets up to 75%'), subject to empirical validation. Unqualified factual claims trigger UNVERIFIED."
    },
    "MTR-006": {
        "name": "Annual Recurring Revenue (ARR)",
        "approved": "$18.5M",
        "raw": 18.5,
        "source": "Deloitte FY25 Audited Financial Statement",
        "citation": "Financial Highlights p. 8",
        "validity": "FY25-Q4 Audited",
        "status": "active",
        "tolerance": "Audited Annual Recurring Revenue (ARR) is $18.5M. Unaudited ARR claims trigger direct CONFLICT. General annual revenue claims trigger UNVERIFIED as total revenue is not certified in audited disclosures."
    },
    "MTR-007": {
        "name": "Legacy Pricing Tier",
        "approved": "$79/mo (Current)",
        "raw": 49.0,
        "source": "Product Pricing Schedule FY26 v2.0",
        "citation": "Pricing Appendix A",
        "validity": "Discontinued on 2026-09-01",
        "status": "outdated"
    },
    "MTR-008": {
        "name": "Stylebook Consultation Frequency Survey",
        "approved": "86% (12 of 14)",
        "raw": 85.71,
        "source": "VeriBrand Practitioner Research Survey (14 Marketers)",
        "citation": "§1 Empirical Problem Evidence",
        "validity": "Active Indefinite",
        "status": "active"
    }
}

BRAND_RULES = [
    {
        "id": "RULE-TM-01",
        "patterns": ["inkloom", "ink loom", "inkloom ai", "inkloom.ai"],
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
        "patterns": ["veribrand", "verybrand", "veri brand", "veribrand.ai"],
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
        "patterns": ["artificial intelligence wizard", "ai wizard", "magic algorithm", "secret sauce"],
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
        "patterns": [
            "world's most revolutionary",
            "world's best",
            "#1 brand in the world",
            "unbeatable platform",
            "flawless guarantee",
            "zero risk",
            "guaranteed 100%",
            "industry-leading",
            "industry leading",
            "the leading",
            "leading enterprise",
            "leading brand",
            "market-leading",
            "market leading",
            "best-in-class",
            "best in class",
            "premier",
            "better than every competitor",
            "the best brand governance platform",
            "market best",
        ],
        "approved": "enterprise brand governance platform",
        "title": "Hyperbolic Unsubstantiated Superlatives",
        "category": "tone_drift",
        "severity": "critical",
        "authority": 1,
        "citation": "FTC & Regulatory Compliance Manual §5.3",
        "explanation": "Unsubstantiated superlatives violate false-advertising regulations."
    },
    {
        "id": "RULE-TONE-05",
        "patterns": [
            "replaces all human editors",
            "replaces all humans",
            "eliminates need for human review",
            "no human oversight required",
        ],
        "approved": "empowers brand teams with automated pre-screening while maintaining human oversight",
        "title": "Absolutist Autonomous Claims",
        "category": "tone_drift",
        "severity": "warning",
        "authority": 2,
        "citation": "Responsible AI Principles §2.1",
        "explanation": "We champion human-in-the-loop coaching, not total human replacement."
    },
    {
        "id": "RULE-CLAIM-03",
        "patterns": [],
        "approved": "99.9% uptime SLA",
        "title": "System Availability & SLA Quoting",
        "category": "claim_verification",
        "severity": "critical",
        "authority": 1,
        "citation": "Enterprise Master Service Agreement (MSA) v4.1 Schedule B",
        "explanation": "System uptime SLA is officially audited at 99.9%. Quoting 99.99% or 99.999% without contractual addenda constitutes false advertising."
    },
    {
        "id": "RULE-PRICE-07",
        "patterns": [],
        "approved": "$79/mo Starter plan",
        "title": "Legacy Pricing Quotes ($49/mo)",
        "category": "claim_verification",
        "severity": "warning",
        "authority": 2,
        "citation": "Product Pricing Schedule FY26 v2.0 (Superseded)",
        "explanation": "The $49/mo legacy starter plan was discontinued on 2026-09-01 and superseded by the $79/mo Starter tier."
    },
    {
        "id": "RULE-VIS-01",
        "patterns": ["#ff0033", "#00ff00", "#ff00ff"],
        "approved": "Brand Indigo (#4F46E5)",
        "title": "Hex Palette & Color Accent Guardrails",
        "category": "visual_token",
        "severity": "warning",
        "authority": 2,
        "citation": "Brand Stylebook v3.2 §4.1 (Color Systems)",
        "explanation": "Marketing graphics and UI designs must strictly adhere to approved brand colors (Brand Indigo #4F46E5, Brand Cyan #06B6D4)."
    }
]

# Genuine In-Memory Aho-Corasick Automaton for O(n + m) Multi-Pattern Scanning
class AhoCorasickNode:
    def __init__(self):
        self.children: Dict[str, AhoCorasickNode] = {}
        self.fail: Optional['AhoCorasickNode'] = None
        self.outputs: List[Tuple[str, Dict[str, Any]]] = []

class PythonAhoCorasick:
    def __init__(self):
        self.root = AhoCorasickNode()

    def add_pattern(self, pattern: str, data: Dict[str, Any]):
        node = self.root
        for char in pattern.lower():
            if char not in node.children:
                node.children[char] = AhoCorasickNode()
            node = node.children[char]
        node.outputs.append((pattern, data))

    def build_failure_links(self):
        queue = deque()
        for char, child in self.root.children.items():
            child.fail = self.root
            queue.append(child)

        while queue:
            curr = queue.popleft()
            for char, child in curr.children.items():
                fail_state = curr.fail
                while fail_state and char not in fail_state.children:
                    fail_state = fail_state.fail
                child.fail = fail_state.children[char] if fail_state else self.root
                child.outputs.extend(child.fail.outputs)
                queue.append(child)

    def search(self, text: str) -> List[Tuple[int, int, str, Dict[str, Any]]]:
        matches = []
        node = self.root
        lower = text.lower()
        for i, char in enumerate(lower):
            while node and char not in node.children:
                node = node.fail
            if not node:
                node = self.root
                continue
            node = node.children[char]
            for pattern, data in node.outputs:
                start_idx = i - len(pattern) + 1
                end_idx = i + 1
                matches.append((start_idx, end_idx, pattern, data))
        return matches

# Pre-build Python Aho-Corasick Automaton
_python_ac = PythonAhoCorasick()
for rule in BRAND_RULES:
    for pattern in rule["patterns"]:
        _python_ac.add_pattern(pattern, rule)
_python_ac.build_failure_links()

def run_tier1_filter(text: str) -> Tuple[List[Dict[str, Any]], float]:
    start = time.perf_counter()
    findings = []
    lower_text = text.lower()

    # O(n + m) single-pass Aho-Corasick automaton search
    ac_matches = _python_ac.search(text)
    seen_spans = set()

    for start_idx, end_idx, pattern, rule in ac_matches:
        span_key = (start_idx, end_idx)
        if span_key in seen_spans:
            continue

        # Word boundary check
        prev_char = lower_text[start_idx - 1] if start_idx > 0 else ' '
        next_char = lower_text[end_idx] if end_idx < len(lower_text) else ' '
        if prev_char.isalnum() or next_char.isalnum():
            continue

        # Case-preservation check: If already properly capitalized, skip
        original_slice = text[start_idx:end_idx]
        candidate_full = text[start_idx:start_idx + len(rule["approved"])]
        if original_slice == rule["approved"] or candidate_full == rule["approved"]:
            continue

        seen_spans.add(span_key)
        matched_lower = original_slice.lower()
        if "inkloom" in matched_lower or "ink loom" in matched_lower:
            rewrites_dict = {"direct": "Inkloom AI", "punchy": "Inkloom AI", "conservative": "Inkloom AI"}
        elif "veribrand" in matched_lower or "verybrand" in matched_lower:
            rewrites_dict = {"direct": "VeriBrand AI", "punchy": "VeriBrand AI", "conservative": "VeriBrand AI"}
        elif any(k in matched_lower for k in ["wizard", "magic", "algorithm", "sauce"]):
            rewrites_dict = {
                "direct": "explainable compliance co-pilot",
                "punchy": "governance co-pilot",
                "conservative": "compliance verification engine"
            }
        elif any(k in matched_lower for k in ["replace", "eliminate", "no human"]):
            rewrites_dict = {
                "direct": "empowers brand teams with automated pre-screening while maintaining human oversight",
                "punchy": "co-pilots brand reviews alongside human editors",
                "conservative": "augments editorial staff with structured pre-publication compliance checks"
            }
        elif rule["category"] == "tone_drift":
            rewrites_dict = {
                "direct": "enterprise brand governance platform",
                "punchy": "purpose-built governance co-pilot",
                "conservative": "pre-publication brand compliance system"
            }
        else:
            rewrites_dict = {
                "direct": rule["approved"],
                "punchy": rule["approved"],
                "conservative": rule["approved"]
            }

        findings.append({
            "id": f"PY-T1-{rule['id']}-{start_idx}",
            "category": rule["category"],
            "verdict": "SUGGESTION",
            "reason_code": "FORBIDDEN_TERM" if rule["category"] == "terminology" else "HYPERBOLIC_SUPERLATIVE",
            "matched_text": original_slice,
            "start_index": start_idx,
            "end_index": end_idx,
            "severity": rule["severity"],
            "explanation": rule["explanation"],
            "guideline_title": rule["title"],
            "guideline_citation": rule["citation"],
            "authority_level": rule["authority"],
            "rewrites": rewrites_dict
        })

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

    # 2. Customer counts (Audited ground truth is 420+ active enterprise customer accounts; lower-bound 420+ verified; negated or <420 is CONFLICT, exact 420/421-999 or >=1000 is UNVERIFIED; brands/organizations trigger UNVERIFIED entity metric)
    cust_matches = list(re.finditer(
        r"(?:(over|more than|at least|exactly|supports?|serves?|with)\s+)?([0-9,]+)(\+?)\s+(?:(?:active\s+)?(?:global\s+)?enterprise\s+(customers|customer\s+accounts|accounts|brands|organizations)|active\s+enterprise\s+(customer\s+accounts))\b",
        text,
        re.IGNORECASE
    ))
    for m in cust_matches:
        prefix = (m.group(1) or '').lower()
        claimed_num = int(m.group(2).replace(',', ''))
        has_plus = bool(m.group(3))
        raw_entity = ((m.group(4) or m.group(5) or '')).lower().strip()
        is_brand_or_org = raw_entity in ['brands', 'organizations']
        preceding = text[max(0, m.start() - 50):m.start()].lower()
        is_negated = bool(re.search(r"\b(?:not|never|no|without|don't|do\s+not|doesn't|does\s+not|did\s+not|didn't|cannot|can't|lack|lacks|lacking)\b", preceding, re.IGNORECASE))
        is_affirmative = bool(re.search(r"\bnot\s+only\b", preceding, re.IGNORECASE))
        true_negated = is_negated and not is_affirmative
        is_lower_bound = (has_plus or prefix in ['over', 'more than', 'at least']) and prefix != 'exactly'

        metric = VERIFIED_METRICS["MTR-004"]

        if is_brand_or_org:
            findings.append({
                "id": f"PY-T2-CUST-ENT-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Unverified Entity Metric. Draft asserts '{m.group(0).strip()}'. Brand Vault metric MTR-004 certifies '{metric['approved']} active enterprise customer accounts', not brands or organizations. The system abstains from transferring customer account verification to distinct corporate entities without separate audit evidence.",
                "guideline_title": "Unverified Entity Metric",
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
                    "direct": "420+ active enterprise customer accounts",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "at least 420 active enterprise customer accounts"
                }
            })
        elif true_negated:
            findings.append({
                "id": f"PY-T2-CUST-CONF-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Negated Customer Disclosure. Draft asserts '{m.group(0).strip()}', denying the audited shareholder disclosure certifying {metric['approved']} active accounts. Falsely denying audited regulatory disclosures violates reporting compliance.",
                "guideline_title": "Customer Count Contradiction",
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
                    "direct": "420+ active enterprise customer accounts",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "at least 420 active enterprise customer accounts"
                }
            })
        elif claimed_num < 420:
            findings.append({
                "id": f"PY-T2-CUST-CONF-{m.start()}",
                "category": "claim_verification",
                "verdict": "CONFLICT",
                "reason_code": "NUMERICAL_MISMATCH",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "critical",
                "explanation": f"Deficit Customer Count. Draft asserts '{m.group(0).strip()}', but audited shareholder disclosure certifies at least {metric['approved']} active accounts. Understating audited customer accounts violates regulatory reporting guidelines.",
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
                    "direct": "420+ active enterprise customer accounts",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "at least 420 active enterprise customer accounts"
                }
            })
        elif claimed_num == 420 and is_lower_bound:
            findings.append({
                "id": f"PY-T2-CUST-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": f"Validated against Q3 2026 Shareholder Disclosure ({metric['approved']} active accounts).",
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
                    "direct": "420+ active enterprise customer accounts",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "at least 420 active enterprise customer accounts"
                }
            })
        elif claimed_num == 420 and not is_lower_bound:
            findings.append({
                "id": f"PY-T2-CUST-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Exact Customer Count Assertion. Draft asserts an exact count of '{m.group(0).strip()}'. The certified ground truth establishes a lower bound of 420+ active enterprise customer accounts, not an exact count. Stating an exact count requires updated audit certification.",
                "guideline_title": "Unverified Exact Customer Count",
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
                    "direct": "420+ active enterprise customer accounts",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "at least 420 active enterprise customer accounts"
                }
            })
        elif claimed_num < 1000:
            findings.append({
                "id": f"PY-T2-CUST-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Exact customer count of {claimed_num} lacks active audit verification. The certified ground truth establishes a lower bound of 420+ active enterprise customer accounts. Stating an exact count requires updated audit certification.",
                "guideline_title": "Unverified Exact Customer Count",
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
                    "direct": "420+ active enterprise customer accounts (audited baseline)",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "over 420 active enterprise customer accounts"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-CUST-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Unverified Higher Customer Count. Draft asserts '{m.group(0).strip()}', but official shareholder disclosure certifies {metric['approved']} active accounts. Customer counts of 1,000+ lack active audit verification and require updated quarterly shareholder filings before publication.",
                "guideline_title": "Unverified Higher Customer Count",
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
                    "direct": "420+ active enterprise customer accounts (audited baseline)",
                    "punchy": "420+ active enterprise customer accounts",
                    "conservative": "over 420 active enterprise customer accounts"
                }
            })

    # 3. Revenue / ARR (distinguish ARR from total annual revenue)
    rev_matches = list(re.finditer(r"\$([0-9.]+)\s*(?:M|million)\s*(?:in\s+)?(annual recurring revenue|ARR|annual revenue|total revenue|revenue)?", text, re.IGNORECASE))
    for m in rev_matches:
        claimed_num = float(m.group(1))
        unit_str = (m.group(2) or '').lower()
        is_arr = 'arr' in unit_str or 'recurring' in unit_str
        metric = VERIFIED_METRICS["MTR-006"]
        if is_arr:
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
                    "guideline_title": "Audited ARR Metric",
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
                        "punchy": "$18.5M in audited annual recurring revenue",
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
                    "explanation": f"False ARR Financial Disclosure. Draft asserts '{m.group(0).strip()}', but Deloitte FY25 audited financial statement certifies {metric['approved']} Annual Recurring Revenue (ARR). Citing unverified ARR violates securities disclosure standards.",
                    "guideline_title": "False ARR Financial Disclosure",
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
                        "punchy": "$18.5M in audited annual recurring revenue",
                        "conservative": "$18.5M ARR (FY25 Deloitte audit)"
                    }
                })
        else:
            # General annual revenue is unverified (only ARR is certified in Brand Vault)
            findings.append({
                "id": f"PY-T2-REV-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0).strip(),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Unverified Financial Metric. Draft asserts '{m.group(0).strip()}', but Deloitte FY25 audited statements certify $18.5M Annual Recurring Revenue (ARR), not total annual revenue. Total annual revenue has not been disclosed in audited brand disclosures.",
                "guideline_title": "Unverified Annual Revenue Metric",
                "guideline_citation": f"{metric['source']} — {metric['citation']}",
                "authority_level": 2,
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
                    "direct": "$18.5M Annual Recurring Revenue (ARR)",
                    "punchy": "$18.5M ARR",
                    "conservative": "$18.5M in audited ARR (Deloitte FY25)"
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
                "punchy": "audited 94.2% enterprise client retention",
                "conservative": "94.2% client retention rate audited by KPMG"
            }
        })

    # 7. Turnaround reduction (75% projected target, e.g. "turnaround by up to 75%", "review turnaround reduction of up to 75%")
    turn_matches = list(re.finditer(r"(?:(?:routine\s+)?(?:review\s+)?turnaround(?:\s+reduction)?\s+(?:by\s+|of\s+)?up\s+to\s+75%|up\s+to\s+75%\s+(?:routine\s+)?(?:review\s+)?turnaround(?:\s+reduction)?)", text, re.IGNORECASE))
    for m in turn_matches:
        metric = VERIFIED_METRICS["MTR-005"]
        preceding = text[max(0, m.start() - 50):m.start()].lower()
        is_target_framing = bool(re.search(r"\b(?:target|targets|targeting|projected|projecting|aims to|goal of|designed to)\b", preceding, re.IGNORECASE))
        if is_target_framing:
            findings.append({
                "id": f"PY-T2-TURN-{m.start()}",
                "category": "claim_verification",
                "verdict": "VERIFIED",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "success",
                "explanation": f"Verified Projected Target. Framed accurately as an engineering target benchmark ({metric['approved']}) per Round 2 Operational Plan.",
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
                    "direct": "targets routine review turnaround reduction of up to 75%",
                    "punchy": "projected up to 75% turnaround acceleration",
                    "conservative": "projected turnaround reduction of up to 75%"
                }
            })
        else:
            findings.append({
                "id": f"PY-T2-TURN-UNV-{m.start()}",
                "category": "claim_verification",
                "verdict": "UNVERIFIED",
                "reason_code": "MISSING_SOURCE",
                "matched_text": m.group(0),
                "start_index": m.start(),
                "end_index": m.end(),
                "severity": "warning",
                "explanation": f"Unqualified Operational Target. Draft asserts '{m.group(0)}' as an established operational outcome. Per MTR-005 tolerance guidelines, the 75% turnaround reduction is an internal projected engineering target, not an empirically certified historical outcome, and must be qualified with 'projected' or 'target'.",
                "guideline_title": "Unqualified Operational Target",
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
                    "direct": "targets routine review turnaround reduction of up to 75%",
                    "punchy": "projected up to 75% turnaround acceleration",
                    "conservative": "projected turnaround reduction of up to 75%"
                }
            })

    # 8. Unsupported business & footprint metrics (subscribers, users, downloads, offices, locations, regions, team)
    unsupp_matches = list(re.finditer(
        r"(?:over|more than|supports?|serves?|serving|with|have|has|operating in|across)?\s*"
        r"([0-9,]+)\+?\s+"
        r"(?:(?:global|regional|international|active|paying|registered|daily|monthly)\s+)?"
        r"(?:subscribers|users|downloads|client accounts|offices|locations|branches|countries|regions|headquarters|team members|employees|engineers|patents|awards|partner organizations|partners|integrations)\b",
        text, re.IGNORECASE
    ))
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
                "direct": "420+ active enterprise customer accounts",
                "punchy": "420+ active enterprise customer accounts",
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
            sev = f.get("severity", "info")
            if sev == "critical":
                score -= 10
            elif sev == "warning":
                score -= 6
            else:
                score -= 3

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
        "timestamp": datetime.now(timezone.utc).isoformat()
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
