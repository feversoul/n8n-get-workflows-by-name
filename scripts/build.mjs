// npm run build
// Writes workflows/*.json: the two recipes and the lab workflow.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CASES, TAG } from './cases.mjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'workflows');
mkdirSync(out, { recursive: true });

const ACCOUNT = { n8nApi: { id: 'gwN8nApiKey00001', name: 'n8n account' } };
const ECHO = { n8nApi: { id: 'gwLabEcho0000001', name: 'Lab echo' } };

let counter = 0;
const node = (name, type, typeVersion, position, parameters, extra = {}) => ({
  parameters,
  id: `gw-node-${String(++counter).padStart(4, '0')}`,
  name,
  type,
  typeVersion,
  position,
  ...extra,
});
const link = (...names) => Object.fromEntries(names.slice(0, -1).map((name, index) => [name, { main: [[{ node: names[index + 1], type: 'main', index: 0 }]] }]));
const workflow = (id, name, nodes, connections) => ({ id, name, nodes, connections, settings: { executionOrder: 'v1' }, pinData: {}, active: false });
const write = (file, content) => writeFileSync(join(out, file), `${JSON.stringify(content, null, 2)}\n`);

const getMany = (name, position, { filters = {}, returnAll = true, limit } = {}, credentials = ACCOUNT, extra = {}) =>
  node(name, 'n8n-nodes-base.n8n', 1, position, { resource: 'workflow', operation: 'getAll', returnAll, ...(returnAll ? {} : { limit }), filters, requestOptions: {} }, { credentials, ...extra });
const note = (content, position, width, height) => node('Note', 'n8n-nodes-base.stickyNote', 1, position, { content, width, height });
const manual = () => node('When clicking "Execute workflow"', 'n8n-nodes-base.manualTrigger', 1, [0, 0], {});

// --- Recipe 1: by tag -------------------------------------------------------

{
  const start = manual();
  const get = getMany('Get workflows with the tag', [220, 0], { filters: { tags: TAG } });
  write(
    '1-get-workflows-by-tag.json',
    workflow(
      'gwByTag000000001',
      'Get workflows by tag',
      [
        note(
          `## Get workflows by tag\nGive the workflows you want the tag **${TAG}** (and no other workflow). The node returns one item per tagged workflow.\n\nTo change the tag: open the node, Filters > Tags.\nSelect your own **n8n API** credential in the node.`,
          [-60, -260],
          520,
          220,
        ),
        start,
        get,
      ],
      link(start.name, get.name),
    ),
  );
}

// --- Recipe 2: get all, keep by name ----------------------------------------

{
  const start = manual();
  const get = getMany('Get all workflows', [220, 0]);
  const condition = (id, name) => ({ id, leftValue: '={{ $json.name }}', rightValue: name, operator: { type: 'string', operation: 'equals' } });
  const keep = node('Keep these two names', 'n8n-nodes-base.filter', 2.2, [440, 0], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      conditions: [condition('gw-keep-0001', 'Part Time Job Tracker'), condition('gw-keep-0002', 'Workflow 1')],
      combinator: 'or',
    },
    options: {},
  });
  write(
    '2-get-workflows-by-name.json',
    workflow(
      'gwByName00000001',
      'Get workflows by name',
      [
        note(
          '## Get workflows by name\nThe first node gets every workflow, with no filter. The Filter node keeps the ones whose name is exactly one of the two names (the conditions are joined with OR).\n\nTo change the names: open **Keep these two names**. To pick by ID instead, compare `{{ $json.id }}`.\nSelect your own **n8n API** credential in the first node.',
          [-60, -280],
          620,
          240,
        ),
        start,
        get,
        keep,
      ],
      link(start.name, get.name, keep.name),
    ),
  );
}

// --- Lab: one branch per case -----------------------------------------------
// GET /webhook/lab/<case>    runs "Get many workflows" with the case's settings
//                            against this n8n and answers with the items.
// GET /webhook/sent/<case>   runs the same node against the echo webhook below
//                            and answers with the query string the node sent.

{
  const nodes = [];
  const connections = {};
  const hook = (name, path, position) =>
    node(name, 'n8n-nodes-base.webhook', 2, position, { httpMethod: 'GET', path, responseMode: 'lastNode', responseData: 'allEntries', options: {} }, { webhookId: `gw-${path.replace('/', '-')}` });

  CASES.forEach((item, index) => {
    const y = index * 180;
    const run = hook(`run ${item.key}`, `lab/${item.key}`, [0, y]);
    const get = getMany(`get ${item.key}`, [220, y], item, ACCOUNT, { alwaysOutputData: true });
    const sent = hook(`sent ${item.key}`, `sent/${item.key}`, [520, y]);
    const echo = getMany(`echo ${item.key}`, [740, y], item, ECHO, { alwaysOutputData: true });
    nodes.push(run, get, sent, echo);
    Object.assign(connections, link(run.name, get.name), link(sent.name, echo.name));
  });

  // Plays GET /api/v1/workflows for the "Lab echo" credential: one "workflow"
  // that is the query string of the request.
  const echoHook = node('Echo: GET workflows', 'n8n-nodes-base.webhook', 2, [0, -360], { httpMethod: 'GET', path: 'echo/api/v1/workflows', responseMode: 'responseNode', options: {} }, { webhookId: 'gw-echo-workflows' });
  const echoAnswer = node('Echo: answer', 'n8n-nodes-base.respondToWebhook', 1.1, [220, -360], {
    respondWith: 'json',
    responseBody: '={{ JSON.stringify({ data: [{ sent: $json.query }], nextCursor: null }) }}',
    options: {},
  });
  nodes.push(echoHook, echoAnswer);
  Object.assign(connections, link(echoHook.name, echoAnswer.name));

  write('9-lab-get-many-cases.json', workflow('gwLab00000000001', 'Lab: Get many workflows, one branch per case', nodes, connections));
}

console.log(`wrote workflows to ${out}`);
