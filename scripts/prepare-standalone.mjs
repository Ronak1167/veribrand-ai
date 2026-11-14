import { cpSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
if (!existsSync(path.join(standalone, 'server.js'))) {
  throw new Error('Next.js standalone server was not generated. Run next build first.');
}

const copies = [
  [path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static')],
  [path.join(root, 'public'), path.join(standalone, 'public')],
];

for (const [source, destination] of copies) {
  if (!existsSync(source)) continue;
  mkdirSync(path.dirname(destination), { recursive: true });
  cpSync(source, destination, { recursive: true, force: true });
}
console.log('Standalone server assets prepared.');
