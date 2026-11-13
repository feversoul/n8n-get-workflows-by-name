// End-to-end tests: the n8n node's "Get many workflows" on a real n8n
// (npm run test:e2e).
//
// The tests create seven workflows with look-alike names, tags, one archived
// and one never published. Then they call the lab workflow, which holds one
// "Get many workflows" node per case in scripts/cases.mjs, and compare what
// each node returned. The two recipes are called the same way.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { CASES, TAG } from '../scripts/cases.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.N8N_URL ?? 'http://localhost:55699';
const OWNER = { email: 'owner@example.com', firstName: 'Lab', lastName: 'Owner', password: 'Lab-owner-1234' };
const COMPOSE = ['compose', '--env-file', 'test/test.env', '-f', 'docker-compose.yml', '-f', 'test/docker-compose.yml', '-p', 'getwf-test'];

// The workflows of this repo are in the instance too.
const OWN = ['Get workflows by name', 'Get workflows by tag', 'Lab: Get many workflows, one branch per case'];
// name, tags, state, pinned data
const FIXTURES = [
  ['Part Time Job Tracker', [TAG, 'jobs'], 'published', true],
  ['Workflow 1', [TAG], 'published'],
  ['Workflow 10', ['jobs'], 'published'],
  ['workflow 1', [], 'published'],
  ['Reports, weekly', ['jobs'], 'published'],
  ['Draft Workflow 1', ['jobs'], 'draft'],
  ['Old Workflow 1', ['jobs', 'old'], 'archived'],
];
const WANTED = ['Part Time Job Tracker', 'Workflow 1'];
const LIKE_WORKFLOW_1 = ['Draft Workflow 1', 'Old Workflow 1', 'Workflow 1', 'Workflow 10', 'workflow 1'];

let apiKey = '';
let cookie = '';
const ids = {};
const tagIds = {};
const extra = [];
const seen = [];

const json = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
};

async function until(check, timeoutMs = 30_000, what = 'the condition') {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await check().catch(() => null);
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(500);
  }
}

const api = async (method, path, body, key = apiKey) => {
  const response = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { 'x-n8n-api-key': key, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await json(response) };
};
const rest = async (method, path, body, headers = { cookie }) => {
  const response = await fetch(`${BASE}/rest${path}`, {
    method,
    headers: { 'browser-id': 'lab', 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await json(response), headers: response.headers };
};

const names = (workflows) => workflows.map((workflow) => workflow.name).sort();
const sorted = (list) => [...list].sort();

// Runs the case's node against this n8n. A node that found nothing answers
// with one empty item, which is dropped here.
async function run(key) {
  const response = await fetch(`${BASE}/webhook/lab/${key}`);
  assert.equal(response.status, 200, `lab/${key}`);
  const workflows = (await response.json()).filter((item) => item.id);
  if (!seen.some((entry) => entry.key === key)) seen.push({ key, names: names(workflows) });
  return workflows;
}
// Runs the same node against the echo webhook: the query string it sent.
async function sent(key) {
  const response = await fetch(`${BASE}/webhook/sent/${key}`);
  assert.equal(response.status, 200, `sent/${key}`);
  return (await response.json())[0].sent;
}
async function recipe(path) {
  const response = await fetch(`${BASE}/webhook/recipe/${path}`);
  assert.equal(response.status, 200, `recipe/${path}`);
  const text = await response.text();
  return text ? JSON.parse(text).filter((item) => item.id) : [];
}

const fixtureBody = (name, slug) => ({
  name,
  nodes: [
    { parameters: { httpMethod: 'GET', path: `fixture-${slug}`, options: {} }, id: `${slug}-a`, name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: `fixture-${slug}` },
    { parameters: {}, id: `${slug}-b`, name: 'Done', type: 'n8n-nodes-base.noOp', typeVersion: 1, position: [220, 0] },
  ],
  connections: { Webhook: { main: [[{ node: 'Done', type: 'main', index: 0 }]] } },
  settings: { executionOrder: 'v1' },
});

before(async () => {
  await until(async () => (await fetch(`${BASE}/healthz/readiness`)).status === 200, 180_000, 'n8n to be ready');

  // Owner and API keys through n8n's own endpoints, the ones the first-run
  // screen and Settings > n8n API use.
  let response = await rest('POST', '/owner/setup', OWNER, {});
  if (response.status !== 200) response = await rest('POST', '/login', { emailOrLdapLoginId: OWNER.email, password: OWNER.password }, {});
  assert.equal(response.status, 200, 'owner setup or login');
  cookie = response.headers.getSetCookie().map((value) => value.split(';')[0]).join('; ');

  // The key of the test itself: it creates, tags, publishes and archives.
  const harness = await rest('POST', '/api-keys', {
    label: `harness-${Date.now()}`,
    expiresAt: null,
    scopes: ['workflow:create', 'workflow:read', 'workflow:list', 'workflow:update', 'workflow:delete', 'workflow:activate', 'tag:create', 'tag:delete', 'workflowTags:update'],
  });
  assert.equal(harness.status, 200, JSON.stringify(harness.body).slice(0, 300));
  apiKey = harness.body.data.rawApiKey;

  // The key of the n8n node: one scope. It goes into the credential
  // "n8n account" that bootstrap.sh created empty.
  const nodeKey = await rest('POST', '/api-keys', { label: `node-${Date.now()}`, expiresAt: null, scopes: ['workflow:list'] });
  assert.equal(nodeKey.status, 200, JSON.stringify(nodeKey.body).slice(0, 300));
  const credential = [{ id: 'gwN8nApiKey00001', name: 'n8n account', type: 'n8nApi', data: { apiKey: nodeKey.body.data.rawApiKey, baseUrl: 'http://127.0.0.1:5678/api/v1' } }];
  const imported = spawnSync('docker', [...COMPOSE, 'exec', '-T', 'n8n', 'sh', '-c', 'cat > /tmp/credential.json && n8n import:credentials --input=/tmp/credential.json && rm /tmp/credential.json'], {
    cwd: root,
    encoding: 'utf8',
    input: JSON.stringify(credential),
  });
  assert.equal(imported.status, 0, imported.stderr);

  for (const name of [TAG, 'jobs', 'old']) {
    const tag = await api('POST', '/tags', { name });
    assert.equal(tag.status, 201, `tag ${name}: ${JSON.stringify(tag.body)}`);
    tagIds[name] = tag.body.id;
  }
  for (const [index, [name, tags, state, pinned]] of FIXTURES.entries()) {
    const body = fixtureBody(name, String(index + 1));
    if (pinned) body.pinData = { Webhook: [{ json: { query: { sample: 'pinned' } } }] };
    const created = await api('POST', '/workflows', body);
    assert.equal(created.status, 200, `create ${name}: ${JSON.stringify(created.body).slice(0, 300)}`);
    const id = (ids[name] = created.body.id);
    if (tags.length) assert.equal((await api('PUT', `/workflows/${id}/tags`, tags.map((tag) => ({ id: tagIds[tag] })))).status, 200, `tag ${name}`);
    if (state === 'published') assert.equal((await api('POST', `/workflows/${id}/activate`)).status, 200, `publish ${name}`);
    if (state === 'archived') assert.equal((await api('POST', `/workflows/${id}/archive`)).status, 200, `archive ${name}`);
  }

  // The lab answers once its webhooks are registered and the key works.
  await until(async () => (await fetch(`${BASE}/webhook/lab/all`)).status === 200, 60_000, 'the lab workflow');
});

after(async () => {
  console.log('\nWhat each node returned:');
  for (const { key, names: found } of seen) console.log(`  ${key.padEnd(24)} ${found.length}  ${JSON.stringify(found)}`);
  for (const id of [...Object.values(ids), ...extra]) await api('DELETE', `/workflows/${id}`).catch(() => null);
  for (const id of Object.values(tagIds)) await api('DELETE', `/tags/${id}`).catch(() => null);
});

// --- no filter ----------------------------------------------------------------

test('no filter: every workflow comes back, archived and unpublished ones too, and no query is sent', async () => {
  const all = await run('all');
  assert.deepEqual(names(all), sorted([...FIXTURES.map(([name]) => name), ...OWN]));
  assert.equal(all.find((workflow) => workflow.name === 'Old Workflow 1').isArchived, true);
  assert.equal(all.find((workflow) => workflow.name === 'Draft Workflow 1').active, false);
  assert.deepEqual(await sent('all'), {});
});

// --- Name ---------------------------------------------------------------------

test('Name "Workflow 1": a contains search in any case, so five workflows come back, not one', async () => {
  assert.deepEqual(names(await run('name-one')), LIKE_WORKFLOW_1);
  assert.deepEqual(await sent('name-one'), { name: 'Workflow 1' });
});

test('Name with two names and a comma: sent as one name, nothing comes back', async () => {
  assert.deepEqual(names(await run('name-two-comma')), []);
  assert.deepEqual(await sent('name-two-comma'), { name: 'Part Time Job Tracker, Workflow 1' });
  assert.deepEqual(names(await run('name-two-comma-no-space')), []);
  assert.deepEqual(await sent('name-two-comma-no-space'), { name: 'Part Time Job Tracker,Workflow 1' });
});

test('Name of a workflow that has a comma in its name: found, the comma is plain text', async () => {
  assert.deepEqual(names(await run('name-with-own-comma')), ['Reports, weekly']);
});

test('Name: part of a name, other case and spaces around it all match; an unknown name gives nothing', async () => {
  assert.deepEqual(names(await run('name-partial')), ['Part Time Job Tracker']);
  assert.deepEqual(names(await run('name-partial-middle')), LIKE_WORKFLOW_1);
  assert.deepEqual(names(await run('name-other-case')), ['Part Time Job Tracker']);
  assert.deepEqual(names(await run('name-padded')), LIKE_WORKFLOW_1);
  assert.deepEqual(await sent('name-padded'), { name: ' Workflow 1 ' });
  assert.deepEqual(names(await run('name-unknown')), []);
});

// --- Tags ---------------------------------------------------------------------

test('Tags with one tag: exactly the workflows that carry it', async () => {
  assert.deepEqual(names(await run('tag-one')), WANTED);
  assert.deepEqual(await sent('tag-one'), { tags: TAG });
});

test('Tags with two tags: AND, only the workflow that carries both; a space after the comma is ignored', async () => {
  assert.deepEqual(names(await run('tag-two')), ['Part Time Job Tracker']);
  assert.deepEqual(await sent('tag-two'), { tags: `${TAG},jobs` });
  assert.deepEqual(names(await run('tag-two-spaced')), ['Part Time Job Tracker']);
});

test('Tags: the whole tag in the same case; other case, part of a tag and an unknown tag give nothing', async () => {
  assert.deepEqual(names(await run('tag-other-case')), []);
  assert.deepEqual(names(await run('tag-partial')), []);
  assert.deepEqual(names(await run('tag-unknown')), []);
});

test('Tags: archived and unpublished workflows with the tag come back too, unless "published only" is added', async () => {
  assert.deepEqual(names(await run('tag-jobs')), ['Draft Workflow 1', 'Old Workflow 1', 'Part Time Job Tracker', 'Reports, weekly', 'Workflow 10']);
  assert.deepEqual(names(await run('tag-jobs-published')), ['Part Time Job Tracker', 'Reports, weekly', 'Workflow 10']);
});

test('Tags and Name together: both must hold', async () => {
  assert.deepEqual(names(await run('tag-and-name')), ['Workflow 1']);
  assert.deepEqual(await sent('tag-and-name'), { tags: TAG, name: 'Workflow 1' });
});

// --- the other settings ---------------------------------------------------------

test('Return Only Published Workflows: on gives the published ones, switched off gives only the unpublished ones', async () => {
  const published = sorted([...FIXTURES.filter(([, , state]) => state === 'published').map(([name]) => name), ...OWN]);
  assert.deepEqual(names(await run('published-only')), published);
  assert.deepEqual(await sent('published-only'), { active: 'true' });
  assert.deepEqual(names(await run('published-switch-off')), ['Draft Workflow 1', 'Old Workflow 1']);
  assert.deepEqual(await sent('published-switch-off'), { active: 'false' });
});

test('Limit 2 instead of Return All: two workflows, the node sends limit=2', async () => {
  assert.equal((await run('limit-2')).length, 2);
  assert.deepEqual(await sent('limit-2'), { limit: '2' });
});

test('Exclude Pinned Data: pinData is in each item by default and left out with the option', async () => {
  const withPins = (await run('all')).find((workflow) => workflow.name === 'Part Time Job Tracker');
  assert.deepEqual(withPins.pinData, { Webhook: [{ json: { query: { sample: 'pinned' } } }] });
  const without = await run('exclude-pinned');
  assert.equal(without.length, FIXTURES.length + OWN.length);
  assert.ok(without.every((workflow) => !('pinData' in workflow)));
  assert.deepEqual(await sent('exclude-pinned'), { excludePinnedData: 'true' });
});

// --- the public API -------------------------------------------------------------

test('public API: GET /api/v1/workflows with the query the node sent returns the same workflows, for every case', async () => {
  for (const { key } of CASES) {
    const query = new URLSearchParams(await sent(key));
    const listed = await api('GET', `/workflows?${query}`);
    assert.equal(listed.status, 200, `${key}: ${JSON.stringify(listed.body).slice(0, 200)}`);
    assert.deepEqual(sorted(listed.body.data.map((workflow) => workflow.id)), sorted((await run(key)).map((workflow) => workflow.id)), key);
  }
});

test('public API: name twice is refused, and % and _ in a name are wildcards', async () => {
  const twice = await api('GET', '/workflows?name=Part%20Time%20Job%20Tracker&name=Workflow%201');
  assert.equal(twice.status, 400);
  assert.match(twice.body.message, /name Expected string, received array/);
  assert.equal((await api('GET', '/workflows?name=%25')).body.data.length, FIXTURES.length + OWN.length);
  assert.deepEqual(names((await api('GET', '/workflows?name=Part_Time')).body.data), ['Part Time Job Tracker']);
});

// --- the recipes ----------------------------------------------------------------

test('recipe 1 (by tag) returns exactly the two wanted workflows', async () => {
  const found = await recipe('by-tag');
  assert.deepEqual(names(found), WANTED);
  assert.deepEqual(sorted(found.map((workflow) => workflow.id)), sorted(WANTED.map((name) => ids[name])));
});

test('recipe 2 (get all, keep by name) returns exactly the two wanted workflows', async () => {
  const found = await recipe('by-name');
  assert.deepEqual(names(found), WANTED);
  assert.deepEqual(sorted(found.map((workflow) => workflow.id)), sorted(WANTED.map((name) => ids[name])));
});

test('a second workflow named "Workflow 1": the name recipe returns three, the tag recipe still two', async () => {
  const twin = await api('POST', '/workflows', fixtureBody('Workflow 1', 'twin'));
  assert.equal(twin.status, 200, 'n8n accepts a name that is already in use');
  extra.push(twin.body.id);
  assert.deepEqual(names(await recipe('by-name')), ['Part Time Job Tracker', 'Workflow 1', 'Workflow 1']);
  assert.deepEqual(names(await recipe('by-tag')), WANTED);
  assert.equal((await api('DELETE', `/workflows/${twin.body.id}`)).status, 200);
});

test('after renaming "Workflow 1": the tag recipe still returns both, the name recipe only one', async () => {
  const id = ids['Workflow 1'];
  const renamed = await api('PUT', `/workflows/${id}`, fixtureBody('Daily Sync', '2'));
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body).slice(0, 300));
  const byTag = await recipe('by-tag');
  assert.deepEqual(names(byTag), ['Daily Sync', 'Part Time Job Tracker']);
  assert.ok(byTag.some((workflow) => workflow.id === id));
  assert.deepEqual(names(await recipe('by-name')), ['Part Time Job Tracker']);
});
