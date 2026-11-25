// One-command start: installs dependencies on first run, then starts the Vite dev server.
import { existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (!existsSync(join(root, 'node_modules', 'vite'))) {
  console.log('Installing dependencies (first run)...');
  const install = spawnSync('npm install', { cwd: root, stdio: 'inherit', shell: true });
  if (install.status !== 0) process.exit(install.status ?? 1);
}

const server = spawn('npx vite --open', { cwd: root, stdio: 'inherit', shell: true });
server.on('exit', (code) => process.exit(code ?? 0));
