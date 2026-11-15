import sqlite3
import os
import shutil
import sys

def run_migration_on_db(db_path):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = OFF;") # turned off during initial schema alter
    
    # 1. Organizations
    conn.execute("""
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            logo_url TEXT,
            brand_name TEXT DEFAULT 'Inkloom AI & VeriBrand AI',
            settings_json TEXT DEFAULT '{}',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
    """)
    
    # 2. Organization Memberships
    conn.execute("""
        CREATE TABLE IF NOT EXISTS organization_memberships (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(organization_id, user_id)
        );
    """)

    # 3. Organization Invitations
    conn.execute("""
        CREATE TABLE IF NOT EXISTS organization_invitations (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            email TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'reviewer', 'creator', 'readonly')),
            token TEXT UNIQUE NOT NULL,
            invited_by TEXT NOT NULL REFERENCES users(id),
            expires_at TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'revoked')),
            created_at TEXT NOT NULL
        );
    """)

    # 4. Brand Rule Versions
    conn.execute("""
        CREATE TABLE IF NOT EXISTS brand_rule_versions (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL REFERENCES brand_rules(id) ON DELETE CASCADE,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            authority_level INTEGER NOT NULL,
            severity TEXT NOT NULL,
            forbidden_patterns_json TEXT NOT NULL,
            approved_alternative TEXT NOT NULL,
            citation TEXT NOT NULL,
            status TEXT NOT NULL,
            change_rationale TEXT,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
    """)

    # 5. Evidence Candidate Facts
    conn.execute("""
        CREATE TABLE IF NOT EXISTS evidence_candidate_facts (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            evidence_id TEXT NOT NULL REFERENCES evidence_documents(id) ON DELETE CASCADE,
            metric_id TEXT,
            claim_type TEXT NOT NULL,
            extracted_claim TEXT NOT NULL,
            extracted_value TEXT NOT NULL,
            unit TEXT,
            page_number INTEGER,
            text_excerpt TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            extraction_method TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified', 'approved', 'rejected')),
            reviewed_by TEXT REFERENCES users(id),
            reviewed_at TEXT,
            review_notes TEXT,
            valid_from TEXT,
            valid_until TEXT,
            created_at TEXT NOT NULL
        );
    """)

    # 6. Brand Assets
    conn.execute("""
        CREATE TABLE IF NOT EXISTS brand_assets (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            asset_type TEXT NOT NULL CHECK(asset_type IN ('logo_primary', 'logo_secondary', 'logo_monochrome', 'logo_icon', 'palette_swatch', 'marketing_image', 'font')),
            storage_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            file_size_bytes INTEGER NOT NULL,
            sha256_checksum TEXT NOT NULL,
            width INTEGER,
            height INTEGER,
            aspect_ratio TEXT,
            metadata_json TEXT DEFAULT '{}',
            uploaded_by TEXT NOT NULL REFERENCES users(id),
            created_at TEXT NOT NULL
        );
    """)

    # Add columns if not existing
    def add_col(tbl, col_def):
        col_name = col_def.split()[0]
        cur = conn.execute(f"PRAGMA table_info({tbl});")
        existing = [r[1] for r in cur.fetchall()]
        if col_name not in existing:
            conn.execute(f"ALTER TABLE {tbl} ADD COLUMN {col_def};")

    add_col("sessions", "active_organization_id TEXT REFERENCES organizations(id)")
    add_col("submissions", "organization_id TEXT REFERENCES organizations(id)")
    add_col("evidence_documents", "organization_id TEXT REFERENCES organizations(id)")
    add_col("evidence_documents", "provenance_state TEXT DEFAULT 'uploaded'")
    add_col("evidence_documents", "source_url TEXT")
    add_col("evidence_documents", "source_publisher TEXT")
    add_col("evidence_documents", "verification_method TEXT DEFAULT 'manual_inspection'")
    add_col("brand_rules", "organization_id TEXT REFERENCES organizations(id)")
    add_col("brand_rules", "version INTEGER DEFAULT 1")
    add_col("brand_rules", "status TEXT DEFAULT 'active'")
    add_col("brand_rules", "effective_from TEXT")
    add_col("brand_rules", "effective_until TEXT")
    add_col("audit_trail", "organization_id TEXT REFERENCES organizations(id)")

    # Ensure default organization exists
    cur = conn.execute("SELECT id FROM organizations WHERE id = 'ORG-DEFAULT';")
    if not cur.fetchone():
        conn.execute("""
            INSERT INTO organizations (id, name, slug, brand_name, created_at, updated_at)
            VALUES ('ORG-DEFAULT', 'Primary Organization', 'primary-org', 'Inkloom AI & VeriBrand AI', datetime('now'), datetime('now'));
        """)

    # Backfill legacy records to default organization
    conn.execute("UPDATE submissions SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;")
    conn.execute("UPDATE evidence_documents SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;")
    conn.execute("UPDATE brand_rules SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;")
    conn.execute("UPDATE audit_trail SET organization_id = 'ORG-DEFAULT' WHERE organization_id IS NULL;")

    # Migrate existing users to default organization memberships
    cur = conn.execute("SELECT id, role, created_at FROM users;")
    users = cur.fetchall()
    for u_id, u_role, u_created in users:
        # Map user role to org role
        org_role = 'owner' if u_role == 'admin' else ('reviewer' if u_role == 'reviewer' else 'creator')
        mem_id = f"MEM-DEFAULT-{u_id}"
        conn.execute("""
            INSERT OR IGNORE INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
            VALUES (?, 'ORG-DEFAULT', ?, ?, ?, ?);
        """, (mem_id, u_id, org_role, u_created, u_created))
    
    # Update active_organization_id on existing sessions
    conn.execute("UPDATE sessions SET active_organization_id = 'ORG-DEFAULT' WHERE active_organization_id IS NULL;")

    conn.commit()
    conn.close()
    print(f"Migration completed successfully on {db_path}")

if __name__ == "__main__":
    source_db = "data/veribrand.db"
    if not os.path.exists(source_db):
        raise FileNotFoundError(f"Source SQLite database not found: {source_db}")

    # Never write a migration test copy into the project backup directory.
    with __import__("tempfile").TemporaryDirectory(prefix="veribrand-migration-test-") as temp_dir:
        test_db = os.path.join(temp_dir, "test_migrated.db")
        shutil.copy2(source_db, test_db)
        run_migration_on_db(test_db)

        conn = sqlite3.connect(test_db)
        org_count = conn.execute("SELECT count(*) FROM organizations").fetchone()[0]
        mem_count = conn.execute("SELECT count(*) FROM organization_memberships").fetchone()[0]
        user_count = conn.execute("SELECT count(*) FROM users").fetchone()[0]
        sub_count = conn.execute("SELECT count(*) FROM submissions WHERE organization_id = 'ORG-DEFAULT'").fetchone()[0]
        evid_count = conn.execute("SELECT count(*) FROM evidence_documents WHERE organization_id = 'ORG-DEFAULT'").fetchone()[0]
        foreign_key_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        integrity = conn.execute("PRAGMA integrity_check").fetchone()[0]
        conn.close()

        print(f"Verified isolated copy: {org_count} orgs, {mem_count} memberships for {user_count} users, {sub_count} submissions, {evid_count} evidence rows.")
        if integrity != "ok" or foreign_key_errors or org_count < 1 or mem_count < user_count:
            raise SystemExit(f"Migration safety verification failed: integrity={integrity}, foreign_key_errors={len(foreign_key_errors)}")
    print("Migration safety test PASSED; temporary database removed.")
