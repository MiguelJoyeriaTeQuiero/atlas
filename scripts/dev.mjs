import { spawn } from 'node:child_process';
// The managed preview passes Vite-style --host/--strictPort flags. Translate
// the host flag for the real Next.js development server without changing ports.
const input = process.argv.slice(2);
const output = ['node_modules/next/dist/bin/next', 'dev', '--webpack'];
for (let i = 0; i < input.length; i++) {
  const arg = input[i];
  if (arg === '--strictPort') continue;
  if (arg === '--host') { output.push('--hostname', input[++i] || '0.0.0.0'); continue; }
  output.push(arg);
}
const child = spawn(process.execPath, output, { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', code => process.exit(code ?? 1));
