import { runSandboxLauncherWorker } from './lib/worker.mjs';

const maxJobs = Number(process.env.MODUMAKE_SANDBOX_WORKER_MAX_JOBS || 1);

runSandboxLauncherWorker({ maxJobs }, process.env)
  .then(results => {
    console.log(JSON.stringify({ ok: true, results }, null, 2));
  })
  .catch(error => {
    console.error('[sandbox-launcher-worker] failed', error);
    process.exitCode = 1;
  });
