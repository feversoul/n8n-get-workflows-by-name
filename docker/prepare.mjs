// Used by bootstrap.sh inside the n8n container: copies the workflows for the
// n8n CLI and makes them callable in the local stack.
//   node prepare.mjs <workflows dir> <output dir>
//
// The two recipes start with a manual trigger ("Execute workflow" in the
// editor). Here it is swapped for a webhook, so the recipe can be run with
// curl and by the tests:
//   GET /webhook/recipe/by-tag     GET /webhook/recipe/by-name
// Every other node is left exactly as it is in workflows/.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [source, out] = process.argv.slice(2);

// The key is filled in later (see README), because only a logged-in owner
// can create one. "Lab echo" points the same node at a webhook of the lab
// workflow that answers with the query string it received.
const credentials = [
  { id: 'gwN8nApiKey00001', name: 'n8n account', type: 'n8nApi', data: { apiKey: process.env.N8N_API_KEY || 'not-set-yet', baseUrl: 'http://127.0.0.1:5678/api/v1' } },
  { id: 'gwLabEcho0000001', name: 'Lab echo', type: 'n8nApi', data: { apiKey: 'not-a-key', baseUrl: 'http://127.0.0.1:5678/webhook/echo/api/v1' } },
];

const paths = { gwByTag000000001: 'recipe/by-tag', gwByName00000001: 'recipe/by-name' };

mkdirSync(join(out, 'workflows'), { recursive: true });
writeFileSync(join(out, 'credentials.json'), JSON.stringify(credentials));
for (const file of readdirSync(source).filter((name) => name.endsWith('.json'))) {
  const workflow = JSON.parse(readFileSync(join(source, file), 'utf8'));
  for (const node of workflow.nodes) {
    if (node.type !== 'n8n-nodes-base.manualTrigger' || !paths[workflow.id]) continue;
    node.type = 'n8n-nodes-base.webhook';
    node.typeVersion = 2;
    node.webhookId = `${workflow.id}-hook`;
    node.parameters = { httpMethod: 'GET', path: paths[workflow.id], responseMode: 'lastNode', responseData: 'allEntries', options: {} };
  }
  writeFileSync(join(out, 'workflows', file), JSON.stringify(workflow));
}
