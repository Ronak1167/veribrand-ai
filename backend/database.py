# VeriBrand AI — Python SQLite Database Bridge
# Connects to shared data/veribrand.db SQLite file for persistent records and audit trail.

import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "veribrand.db"

def get_db_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def log_audit_event(
    event_type: str,
    actor_id: str,
    actor_role: str,
    submission_id: Optional[str] = None,
    revision_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: str = "127.0.0.1"
) -> None:
    conn = get_db_connection()
    try:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """
            INSERT INTO audit_trail (event_type, actor_id, actor_role, submission_id, revision_id, details_json, ip_address, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            (event_type, actor_id, actor_role, submission_id, revision_id, json.dumps(details or {}), ip_address, now)
        )
        conn.commit()
    finally:
        conn.close()

def get_audit_trail(limit: int = 100) -> List[Dict[str, Any]]:
    conn = get_db_connection()
    try:
        cursor = conn.execute("SELECT * FROM audit_trail ORDER BY id DESC LIMIT ?;", (limit,))
        rows = cursor.fetchall()
        return [
            {
                "id": r["id"],
                "eventType": r["event_type"],
                "actorId": r["actor_id"],
                "actorRole": r["actor_role"],
                "submissionId": r["submission_id"],
                "revisionId": r["revision_id"],
                "details": json.loads(r["details_json"]),
                "ipAddress": r["ip_address"],
                "timestamp": r["timestamp"]
            }
            for r in rows
        ]
    finally:
        conn.close()
