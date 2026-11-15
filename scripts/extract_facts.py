#!/usr/bin/env python3
"""
VeriBrand AI — Automated Evidence Document Extraction Engine
Extracts candidate facts from PDF documents, text files, and images.
Output format: JSON array of candidate facts.
"""

import sys
import os
import json
import re
import argparse
from typing import List, Dict, Any

try:
    import pymupdf as fitz
except ImportError:
    try:
        import fitz
    except ImportError:
        fitz = None

try:
    from PIL import Image
except ImportError:
    Image = None

try:
    import pytesseract
except ImportError:
    pytesseract = None

FACT_PATTERNS = [
    # Financial / ARR / Revenue
    {
        "type": "financial",
        "pattern": r"(\$\s*\d+(?:\.\d+)?\s*(?:[BMKbmk]|billion|million|thousand)?)\s*(?:in\s+)?(?:ARR|annual recurring revenue|revenue|sales)",
        "value_group": 1,
        "unit": "USD",
        "name": "Annual Recurring Revenue",
    },
    {
        "type": "financial",
        "pattern": r"(?:ARR|annual recurring revenue|revenue|sales)\s*(?:of|is|reached|hit|surpassed|exceeded)?\s*(\$\s*\d+(?:\.\d+)?\s*(?:[BMKbmk]|billion|million|thousand)?)",
        "value_group": 1,
        "unit": "USD",
        "name": "Annual Recurring Revenue",
    },
    # Uptime / Performance
    {
        "type": "performance",
        "pattern": r"(\d{2}(?:\.\d+)?%)\s*(?:uptime|availability|SLA|reliability)",
        "value_group": 1,
        "unit": "%",
        "name": "Platform Uptime",
    },
    {
        "type": "performance",
        "pattern": r"(?:uptime|availability|SLA)\s*(?:of|at)?\s*(\d{2}(?:\.\d+)?%)",
        "value_group": 1,
        "unit": "%",
        "name": "Platform Uptime",
    },
    # Growth / YoY
    {
        "type": "growth",
        "pattern": r"(\d+(?:\.\d+)?%)\s*(?:growth|YoY|year[- ]over[- ]year|increase|expansion)",
        "value_group": 1,
        "unit": "%",
        "name": "Year-over-Year Growth",
    },
    # Latency / Speed
    {
        "type": "performance",
        "pattern": r"(<\s*\d+(?:\.\d+)?\s*m?s|\d+(?:\.\d+)?\s*ms)\s*(?:latency|response time|p99|p95)",
        "value_group": 1,
        "unit": "ms",
        "name": "Response Latency",
    },
    # Customer / User Count
    {
        "type": "numerical",
        "pattern": r"(\d{1,3}(?:,\d{3})*\+?|\d+\s*(?:million|thousand|k)?\+?)\s*(?:enterprise\s+)?(?:customers|users|clients|organizations|teams)",
        "value_group": 1,
        "unit": "customers",
        "name": "Customer Count",
    },
    # Percentage Claims
    {
        "type": "percentages",
        "pattern": r"(\d{1,3}(?:\.\d+)?%)\s*(?:reduction|efficiency|cost savings|accuracy|satisfaction)",
        "value_group": 1,
        "unit": "%",
        "name": "Efficiency/Accuracy Percentage",
    },
    # Security Certifications
    {
        "type": "product_capability",
        "pattern": r"\b(SOC\s?2(?:\s+Type\s+(?:I|II))?|ISO\s?27001|HIPAA|GDPR)\b",
        "value_group": 1,
        "unit": "certification",
        "name": "Security Certification",
    },
    # Retention Claims
    {
        "type": "retention",
        "pattern": r"(\d{1,3}(?:\.\d+)?%)\s*(?:enterprise\s+)?(?:client\s+)?(?:retention|renewal)",
        "value_group": 1,
        "unit": "%",
        "name": "Client Retention Rate",
    },
]

def extract_from_text(text: str, page_number: int = 1, method: str = "pdf_text") -> List[Dict[str, Any]]:
    facts = []
    seen_values = set()
    sentences = re.split(r'(?<=[.!?\n])\s+', text)

    for sentence in sentences:
        clean_sentence = sentence.strip()
        if not clean_sentence or len(clean_sentence) < 8:
            continue

        for rule in FACT_PATTERNS:
            match = re.search(rule["pattern"], clean_sentence, re.IGNORECASE)
            if match:
                extracted_val = match.group(rule["value_group"]).strip()
                fact_key = f"{rule['type']}:{extracted_val.lower()}:{page_number}"
                if fact_key in seen_values:
                    continue
                seen_values.add(fact_key)

                # Context excerpt around match
                excerpt = clean_sentence
                if len(excerpt) > 180:
                    start = max(0, match.start() - 40)
                    end = min(len(clean_sentence), match.end() + 60)
                    excerpt = ("..." if start > 0 else "") + clean_sentence[start:end].strip() + ("..." if end < len(clean_sentence) else "")

                facts.append({
                    "claimType": rule["type"],
                    "extractedClaim": rule["name"] + f" ({extracted_val})",
                    "extractedValue": extracted_val,
                    "unit": rule["unit"],
                    "pageNumber": page_number,
                    "textExcerpt": excerpt,
                    "confidence": 0.95 if method == "pdf_text" else 0.88,
                    "extractionMethod": method,
                })

    return facts

def extract_pdf(file_path: str) -> List[Dict[str, Any]]:
    if not fitz:
        return []
    doc = fitz.open(file_path)
    all_facts = []
    for page_idx in range(len(doc)):
        page = doc[page_idx]
        text = page.get_text("text")
        method = "pdf_text"
        if not text.strip() and pytesseract and Image:
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
            text = pytesseract.image_to_string(image)
            method = "pdf_ocr" if text.strip() else "pdf_ocr_empty"
        if text.strip():
            all_facts.extend(extract_from_text(text, page_number=page_idx + 1, method=method))
    return all_facts

def extract_text_file(file_path: str) -> List[Dict[str, Any]]:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        content = f.read()
    return extract_from_text(content, page_number=1, method="heuristic")

def extract_image(file_path: str) -> List[Dict[str, Any]]:
    if not Image:
        return []
    try:
        with Image.open(file_path) as img:
            img.verify()
        with Image.open(file_path) as img:
            image = img.convert("RGB")
            if not pytesseract:
                return []
            text = pytesseract.image_to_string(image)
            return extract_from_text(text, page_number=1, method="image_ocr") if text.strip() else []
    except Exception:
        return []

def main():
    parser = argparse.ArgumentParser(description="Extract facts from evidence document")
    parser.add_argument("--file", required=True, help="Path to evidence file")
    args = parser.parse_args()

    if not os.path.exists(args.file):
        print(json.dumps({"error": "File does not exist", "facts": []}))
        sys.exit(1)

    ext = os.path.splitext(args.file)[1].lower()
    facts = []

    if ext == ".pdf":
        facts = extract_pdf(args.file)
    elif ext in [".txt", ".csv", ".md"]:
        facts = extract_text_file(args.file)
    elif ext in [".png", ".jpg", ".jpeg", ".webp"]:
        facts = extract_image(args.file)
    else:
        # Default try text extraction
        try:
            facts = extract_text_file(args.file)
        except Exception:
            facts = []

    if ext == ".pdf" and fitz:
        try:
            with fitz.open(args.file) as doc:
                if doc.needs_pass:
                    print(json.dumps({"ok": False, "error": "Password-protected PDFs are not supported.", "facts": []}))
                    sys.exit(2)
                if len(doc) > 200:
                    print(json.dumps({"ok": False, "error": "PDF exceeds the 200-page extraction limit.", "facts": []}))
                    sys.exit(2)
        except Exception:
            print(json.dumps({"ok": False, "error": "Invalid or corrupt PDF.", "facts": []}))
            sys.exit(2)
    print(json.dumps({"ok": True, "count": len(facts), "facts": facts}, indent=2))

if __name__ == "__main__":
    main()
