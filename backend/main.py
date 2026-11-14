"""Optional standalone FastAPI verifier service.

The Next.js application remains the authoritative workflow and persistence service.
This Python API is loopback-only by default and requires an API key for non-health routes.
"""
import hmac
import os
import re
from typing import Optional

from fastapi import FastAPI, HTTPException, Security, Depends
from fastapi.security.api_key import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
from models import AuditRequest, AuditResponse
from engine import audit_document, VERIFIED_METRICS, BRAND_RULES, calculate_wcag_contrast

app = FastAPI(
    title="VeriBrand AI Engine API",
    description="Optional deterministic Python verifier; separate from the Next.js workflow database.",
    version="1.1.0",
)

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def require_api_key(api_key: Optional[str] = Security(api_key_header)) -> None:
    expected = os.environ.get("VERIBRAND_PYTHON_API_KEY", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="Python API key is not configured.")
    if not api_key or not hmac.compare_digest(api_key, expected):
        raise HTTPException(status_code=401, detail="A valid API key is required.")


allowed_origins = [
    origin.strip()
    for origin in os.environ.get(
        "VERIBRAND_PYTHON_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "VeriBrand AI optional Python verifier"}


@app.post("/api/audit", response_model=AuditResponse, dependencies=[Depends(require_api_key)])
async def audit_content_endpoint(req: AuditRequest):
    try:
        return audit_document(req.text, req.channel)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid audit request.") from exc
    except Exception as exc:
        # Do not expose internal exception details to API clients.
        raise HTTPException(status_code=500, detail="Audit processing failed.") from exc


@app.get("/api/vault", dependencies=[Depends(require_api_key)])
async def get_vault_data():
    return {
        "metrics_count": len(VERIFIED_METRICS),
        "rules_count": len(BRAND_RULES),
        "metrics": VERIFIED_METRICS,
        "rules": BRAND_RULES,
    }


@app.get("/api/vision/contrast", dependencies=[Depends(require_api_key)])
async def get_contrast_ratio(fg: str = "#4F46E5", bg: str = "#FFFFFF"):
    color_pattern = re.compile(r"^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
    if not color_pattern.fullmatch(fg) or not color_pattern.fullmatch(bg):
        raise HTTPException(status_code=400, detail="Foreground and background must be valid 3- or 6-digit hex colors.")
    ratio = calculate_wcag_contrast(fg, bg)
    return {
        "foreground": fg,
        "background": bg,
        "contrast_ratio": ratio,
        "wcag_aa_compliant": ratio >= 4.5,
        "wcag_aaa_compliant": ratio >= 7.0,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=os.environ.get("VERIBRAND_PYTHON_HOST", "127.0.0.1"),
        port=int(os.environ.get("VERIBRAND_PYTHON_PORT", "8000")),
        reload=os.environ.get("VERIBRAND_PYTHON_RELOAD", "false").lower() == "true",
    )
