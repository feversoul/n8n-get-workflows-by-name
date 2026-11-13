# n8n: get workflows by name

[![test](https://github.com/feversoul/n8n-get-workflows-by-name/actions/workflows/test.yml/badge.svg)](https://github.com/feversoul/n8n-get-workflows-by-name/actions/workflows/test.yml)

The n8n node has an operation **Get many workflows** with a few filters. This repo measures on a real n8n 2.47.7 what those filters do, and ships two small workflows that return exactly the workflows you name, for example "Part Time Job Tracker" and "Workflow 1".

| Asked                                                  | Answer                                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Can I type two names with a comma into Filters > Name? | No. The node sends the whole text as one name. Nothing came back.                                                                                                       |
| Does Name with one name return that one workflow?      | Not reliably. Name is a "contains" search that ignores case. `Workflow 1` returned five workflows, among them "Workflow 10", "workflow 1" and an archived one.          |
| Should I use tags instead?                             | Yes. One tag on both workflows, that tag in Filters > Tags: exactly the two came back. [`workflows/1-get-workflows-by-tag.json`](workflows/1-get-workflows-by-tag.json) |
| And without tags?                                      | Get all workflows, then keep the two names with a Filter node. [`workflows/2-get-workflows-by-name.json`](workflows/2-get-workflows-by-name.json)                       |

## What was measured

n8n 2.47.7 in Docker, SQLite. Ten workflows in the instance: the three of this repo and seven made for the test.

| Workflow              | Tags                         | State                  |
| --------------------- | ---------------------------- | ---------------------- |
| Part Time Job Tracker | `selected-workflows`, `jobs` | published, pinned data |
| Workflow 1            | `selected-workflows`         | published              |
| Workflow 10           | `jobs`                       | published              |
| workflow 1            |                              | published              |
| Reports, weekly       | `jobs`                       | published              |
| Draft Workflow 1      | `jobs`                       | never published        |
| Old Workflow 1        | `jobs`, `old`                | archived               |

Each row below is one **Get many workflows** node with only that setting, **Return All** on.

| Setting in the node                                 | The node sent                            | Came back                                                                     |
| --------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| no filter                                           | no query                                 | all 10, the archived and the unpublished one too                              |
| Name `Workflow 1`                                   | `name=Workflow 1`                        | 5: Workflow 1, Workflow 10, workflow 1, Draft Workflow 1, Old Workflow 1      |
| Name `Part Time Job Tracker, Workflow 1`            | `name=Part Time Job Tracker, Workflow 1` | 0                                                                             |
| Name `Part Time Job Tracker,Workflow 1`             | the same text as one name                | 0                                                                             |
| Name `Reports, weekly`                              | `name=Reports, weekly`                   | 1: Reports, weekly (a comma is plain text)                                    |
| Name `Tracker`                                      | `name=Tracker`                           | 1: Part Time Job Tracker                                                      |
| Name `orkflow 1`                                    | `name=orkflow 1`                         | the same 5 as `Workflow 1`                                                    |
| Name `PART TIME JOB TRACKER`                        | as typed                                 | 1: Part Time Job Tracker                                                      |
| Name `Workflow 1` with a space before and after     | with the spaces                          | the same 5                                                                    |
| Tags `selected-workflows`                           | `tags=selected-workflows`                | 2: Part Time Job Tracker, Workflow 1                                          |
| Tags `selected-workflows,jobs`                      | `tags=selected-workflows,jobs`           | 1: Part Time Job Tracker, the only one with both tags                         |
| Tags `selected-workflows, jobs`                     | with the space                           | the same 1                                                                    |
| Tags `Selected-Workflows`                           | as typed                                 | 0                                                                             |
| Tags `selected`                                     | as typed                                 | 0                                                                             |
| Tags `jobs`                                         | `tags=jobs`                              | 5, with Draft Workflow 1 and the archived Old Workflow 1                      |
| Tags `jobs` + Return Only Published Workflows on    | `tags=jobs&active=true`                  | 3: the published ones                                                         |
| Tags `selected-workflows` + Name `Workflow 1`       | both                                     | 1: Workflow 1                                                                 |
| Return Only Published Workflows on                  | `active=true`                            | the 8 published workflows                                                     |
| Return Only Published Workflows added, switched off | `active=false`                           | 2: only Draft Workflow 1 and Old Workflow 1                                   |
| Return All off, Limit 2                             | `limit=2`                                | 2 workflows                                                                   |
| Exclude Pinned Data on                              | `excludePinnedData=true`                 | all 10, no `pinData` field in the items (without the option each item has it) |

In short:

- **Name** takes one text and finds every workflow whose name contains it, in any case. There is no list of names and no exact match.
- **Tags** takes a comma separated list and a workflow must carry all of them (AND). A tag must be written in full and in the same case.
- Neither filter looks at archived or published. Add **Return Only Published Workflows** for that. Adding that filter and switching it off is not "no filter": it returns only the unpublished workflows.
- The node is a thin wrapper. `GET /api/v1/workflows` with the same query returned the same workflows in all 23 cases. The API refuses `name` given twice (400, "Expected string, received array"), and `%` and `_` in a name act as wildcards.
- An API key with the single scope `workflow:list` was enough for all of it.

## The two recipes

**1. By tag** ([`workflows/1-get-workflows-by-tag.json`](workflows/1-get-workflows-by-tag.json)): one **Get many workflows** node with Filters > Tags = `selected-workflows`. Tag the workflows you want, and no others. It keeps working when a workflow is renamed (tested), and adding a third workflow later means tagging it.

**2. By name** ([`workflows/2-get-workflows-by-name.json`](workflows/2-get-workflows-by-name.json)): **Get many workflows** with no filter, then a **Filter** node with two conditions joined by OR: `{{ $json.name }}` is equal to `Part Time Job Tracker`, `{{ $json.name }}` is equal to `Workflow 1`. The Filter compares the whole name and the case, so "Workflow 10" and "workflow 1" are dropped.

n8n allows two workflows with the same name. With a second "Workflow 1" in the instance, recipe 2 returned three items and recipe 1 still two. If that can happen to you, compare `{{ $json.id }}` in the Filter instead (the ID is the last part of the workflow's address in the editor).

## Add it to your n8n

Needs the n8n public API: a self-hosted n8n, or a Cloud plan that has the API. Not tested on n8n Cloud.

1. **Settings > n8n API > Create an API key**. If your n8n lets you pick scopes, `workflow:list` is enough.
2. Import one of the two workflow files (Workflows > Import from File).
3. Open the **Get many workflows** node and create a credential of type **n8n API**: the key, and as Base URL the address of your n8n followed by `/api/v1`, for example `http://localhost:5678/api/v1`.
4. Recipe 1: open each workflow you want, add the tag `selected-workflows` next to its name. Recipe 2: put your names into the **Keep these two names** node.
5. Click **Execute workflow**. Each output item is one workflow.

## Run it locally

```sh
git clone https://github.com/feversoul/n8n-get-workflows-by-name
cd n8n-get-workflows-by-name
npm run test:e2e
```

Needs Docker and Node 20 or newer, and takes about a minute. The tests create the owner account and the API keys through n8n's own endpoints (`POST /rest/owner/setup`, `POST /rest/api-keys`), create the seven workflows above through the public API, and call the lab workflow [`workflows/9-lab-get-many-cases.json`](workflows/9-lab-get-many-cases.json). It holds one **Get many workflows** node per row of the table, twice: once against n8n, and once against a webhook that answers with the query string it received, which is how "the node sent" was read. In this stack the manual trigger of the two recipes is swapped for a webhook so they can be called (`docker/prepare.mjs`); the other nodes are the shipped ones. `KEEP_STACK=1` leaves the stack up.

To look around by hand: `cp .env.example .env`, set `N8N_ENCRYPTION_KEY`, `docker compose up -d`, open `http://localhost:5678`, create the owner, create an API key, and paste it into the credential **n8n account**. The lab webhooks have no authentication and list your workflows. Keep them on a local stack.

The cases are in `scripts/cases.mjs`. After changing it or `scripts/build.mjs`, run `npm run build` to write `workflows/*.json` again.

## What was tested

`npm run test:e2e` from a fresh stack, n8n 2.47.7, SQLite: **19 of 19 passed**.

| Test                                                                                       | Result |
| ------------------------------------------------------------------------------------------ | ------ |
| No filter: all workflows, archived and unpublished too, no query sent                      | passed |
| Name `Workflow 1`: five workflows, a contains search in any case                           | passed |
| Name with two names and a comma (with and without a space): sent as one name, nothing back | passed |
| Name of a workflow with a comma in its name: found                                         | passed |
| Name: part of a name, other case, spaces around it match; unknown name gives nothing       | passed |
| Tags with one tag: exactly the two tagged workflows                                        | passed |
| Tags with two tags: AND; a space after the comma is ignored                                | passed |
| Tags: other case, part of a tag, unknown tag give nothing                                  | passed |
| Tags: archived and unpublished workflows come back too, unless "published only" is added   | passed |
| Tags and Name together: both must hold                                                     | passed |
| Return Only Published Workflows: on gives published, switched off gives only unpublished   | passed |
| Limit 2: two workflows, `limit=2` sent                                                     | passed |
| Exclude Pinned Data: `pinData` present by default, absent with the option                  | passed |
| Public API with the query the node sent: same workflows in all 23 cases                    | passed |
| Public API: `name` twice refused with 400; `%` and `_` are wildcards                       | passed |
| Recipe 1 (by tag): exactly the two wanted workflows                                        | passed |
| Recipe 2 (get all, keep by name): exactly the two wanted workflows                         | passed |
| A second workflow named "Workflow 1": recipe 2 returns three, recipe 1 still two           | passed |
| "Workflow 1" renamed: recipe 1 still returns both, recipe 2 only one                       | passed |

## Not tested, and limits

- n8n Cloud, and any version other than 2.47.7.
- PostgreSQL. Whether a filter ignores case can depend on the database: on SQLite, Name ignored case and Tags did not.
- The Project ID filter, and more than 100 workflows (the paging behind Return All).
- Which workflows Limit picks. It returned two, and not the same two in every run.
- Picking by ID in the Filter node is described above but has no test of its own.
- Recipe 2 keeps an archived or unpublished workflow if its name matches. Add a condition on `isArchived` or `active` if you need to leave those out.
- Recipe 2 reads every workflow, with all its nodes, on each run. Fine for a few dozen workflows; with hundreds, the tag is the lighter way.
