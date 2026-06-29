import { spawn } from 'node:child_process';

const children = [];

function run(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: 'pipe',
    shell: false,
  });

  child.stdout.on('data', chunk => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on('data', chunk => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on('exit', code => {
    const line = `[${label}] exited with code ${code}\n`;
    if (code && code !== 0) {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  });

  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('web', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev']);
run('compile', process.execPath, ['./services/compile-server/server.mjs']);

