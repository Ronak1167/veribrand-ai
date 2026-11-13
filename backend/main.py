# VeriBrand AI — Python FastAPI Service
# High-Throughput REST API for Enterprise Brand Governance

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import AuditRequest, AuditResponse, PaletteAnalysisResponse
from engine import audit_document, VERIFIED_METRICS, BRAND_RULES, calculate_wcag_contrast

app = FastAPI(
    title="VeriBrand AI Engine API",
    description="Intelligent Pre-Publication Brand Governance & Explainable Compliance Engine",
    version="1.0.0-round2-build"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "VeriBrand AI Python Engine",
        "round": "Round 2 Build",
        "team": "Team Deccans",
        "hackathon": "CodeNova India 2026 (Inkloom AI Track)"
    }

@app.post("/api/audit", response_model=AuditResponse)
def audit_content_endpoint(req: AuditRequest):
    try:
        result = audit_document(req.text, req.channel)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/vault")
def get_vault_data():
    return {
        "metrics_count": len(VERIFIED_METRICS),
        "rules_count": len(BRAND_RULES),
        "metrics": VERIFIED_METRICS,
        "rules": BRAND_RULES
    }

@app.get("/api/vision/contrast")
def get_contrast_ratio(fg: str = "#4F46E5", bg: str = "#FFFFFF"):
    ratio = calculate_wcag_contrast(fg, bg)
    return {
        "foreground": fg,
        "background": bg,
        "contrast_ratio": ratio,
        "wcag_aa_compliant": ratio >= 4.5,
        "wcag_aaa_compliant": ratio >= 7.0
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
