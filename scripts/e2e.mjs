// npm run test:e2e
// Starts the test stack (n8n on SQLite, its default), runs test/e2e.test.mjs
// against it and removes the stack again. The tests put an API key into the
// credential with `docker compose exec`, so they need the docker CLI. Takes
// about two minutes. Set KEEP_STACK=1 to leave the stack running, for example
// to open the editor on http://localhost:55699 (owner@example.com /
// Lab-owner-1234, created by the tests).

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const compose = ['compose', '--env-file', 'test/test.env', '-f', 'docker-compose.yml', '-f', 'test/docker-compose.yml', '-p', 'getwf-test'];
const run = (command, args) => spawnSync(command, args, { cwd: root, stdio: 'inherit' }).status ?? 1;

run('docker', [...compose, 'down', '-v']);
let status = run('docker', [...compose, 'up', '-d']);
if (status === 0) status = run(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', 'test/e2e.test.mjs']);
if (status !== 0) run('docker', [...compose, 'logs', '--tail', '60', 'n8n']);
if (!process.env.KEEP_STACK) run('docker', [...compose, 'down', '-v']);
process.exit(status);
