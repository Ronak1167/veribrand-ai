import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db/database';
import { isPostgresHealthy } from '@/lib/db/postgres';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const correlationId = req.headers.get('x-request-id') || `req-${Date.now().toString(36)}`;
  const startTime = Date.now();

  let sqliteOk = false;
  let sqliteError: string | null = null;
  try {
    getDatabase().prepare('SELECT 1 AS healthy').get();
    sqliteOk = true;
  } catch (err) {
    sqliteError = err instanceof Error ? err.message : String(err);
  }

  let postgresOk = false;
  try {
    postgresOk = await isPostgresHealthy();
  } catch {
    postgresOk = false;
  }

  let pythonOk = false;
  const pythonUrl = process.env.PYTHON_ENGINE_URL || 'http://localhost:8000';
  try {
    const pyRes = await fetch(`${pythonUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    pythonOk = pyRes.ok;
  } catch {
    pythonOk = false;
  }

  // The application repositories currently execute SQLite queries. A reachable
  // PostgreSQL service alone must never make the application appear database-healthy.
  const runtimeDatabase = 'sqlite' as const;
  const isHealthy = sqliteOk;
  const status = isHealthy ? (pythonOk ? 'ok' : 'degraded') : 'unhealthy';
  const statusCode = isHealthy ? 200 : 503;

  return NextResponse.json(
    {
      status,
      runtimeDatabase,
      database: sqliteOk ? 'reachable' : 'unreachable',
      correlationId,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      latencyMs: Date.now() - startTime,
      services: {
        database_sqlite: {
          status: sqliteOk ? 'healthy' : 'unhealthy',
          error: sqliteError ? 'Database check failed.' : null,
        },
        database_postgres: {
          status: postgresOk ? 'healthy' : 'unconfigured_or_unreachable',
        },
        python_verification_engine: {
          status: pythonOk ? 'healthy' : 'unreachable',
          endpoint: pythonUrl,
        },
      },
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'x-request-id': correlationId,
      },
    }
  );
}
