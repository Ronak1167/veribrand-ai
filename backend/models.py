# VeriBrand AI — Python FastAPI Backend Models
# Pydantic Schemas for Strict Data Validation

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Literal

class ClaimEvidence(BaseModel):
    metric_id: str
    metric_name: str
    approved_value: str
    source_document: str
    section_citation: str
    validity_period: str
    status: Literal["active", "outdated"]

class RewriteOptions(BaseModel):
    direct: str
    punchy: str
    conservative: str

class Finding(BaseModel):
    id: str
    category: str
    verdict: Literal["VERIFIED", "CONFLICT", "UNVERIFIED", "SUGGESTION"]
    reason_code: Optional[str] = None
    matched_text: str
    start_index: int
    end_index: int
    severity: Literal["critical", "warning", "info", "success"]
    explanation: str
    guideline_title: str
    guideline_citation: str
    authority_level: int
    evidence: Optional[ClaimEvidence] = None
    rewrites: RewriteOptions

class AuditRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Content copy to audit")
    channel: str = Field(default="enterprise_web", description="Target distribution channel")

class AuditResponse(BaseModel):
    document_id: str
    channel: str
    compliance_score: int
    tier1_latency_ms: float
    tier2_latency_ms: float
    findings: List[Finding]
    metrics_audited_count: int
    claims_verified_count: int
    claims_conflicted_count: int
    claims_unverified_count: int
    timestamp: str

class PaletteAnalysisResponse(BaseModel):
    dominant_hex_codes: List[str]
    contrast_ratio: float
    wcag_aa_compliant: bool
    brand_palette_match: bool
