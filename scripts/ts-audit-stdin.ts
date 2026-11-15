import readline from 'node:readline';
import { auditContent } from '../src/lib/engine/verifier';

async function main() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of input) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line) as { text: string; channel?: string };
      const result = auditContent(item.text, (item.channel || 'enterprise_web') as never);
      process.stdout.write(JSON.stringify(result) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ error: error instanceof Error ? error.message : 'Audit failed' }) + '\n');
    }
  }
}

main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n');
  process.exitCode = 1;
});
