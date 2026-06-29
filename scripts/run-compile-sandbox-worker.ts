import { runCompileSandboxWorker } from '@/lib/server/compile-sandbox-worker';

async function main() {
  const results = await runCompileSandboxWorker();
  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);
}

main().catch(error => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
