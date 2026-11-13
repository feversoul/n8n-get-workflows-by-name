// The settings each lab case gives the n8n node's "Get many workflows".
// scripts/build.mjs turns every case into two branches of the lab workflow,
// test/e2e.test.mjs calls them and checks what came back.
//
// `filters` is what you would pick under Filters in the node. A filter that
// is not listed was not added in the node.

export const TAG = 'selected-workflows';

export const CASES = [
  { key: 'all', filters: {} },

  { key: 'name-one', filters: { name: 'Workflow 1' } },
  { key: 'name-two-comma', filters: { name: 'Part Time Job Tracker, Workflow 1' } },
  { key: 'name-two-comma-no-space', filters: { name: 'Part Time Job Tracker,Workflow 1' } },
  { key: 'name-with-own-comma', filters: { name: 'Reports, weekly' } },
  { key: 'name-partial', filters: { name: 'Tracker' } },
  { key: 'name-partial-middle', filters: { name: 'orkflow 1' } },
  { key: 'name-other-case', filters: { name: 'PART TIME JOB TRACKER' } },
  { key: 'name-padded', filters: { name: ' Workflow 1 ' } },
  { key: 'name-unknown', filters: { name: 'No Such Workflow' } },

  { key: 'tag-one', filters: { tags: TAG } },
  { key: 'tag-two', filters: { tags: `${TAG},jobs` } },
  { key: 'tag-two-spaced', filters: { tags: `${TAG}, jobs` } },
  { key: 'tag-other-case', filters: { tags: 'Selected-Workflows' } },
  { key: 'tag-partial', filters: { tags: 'selected' } },
  { key: 'tag-unknown', filters: { tags: 'no-such-tag' } },
  { key: 'tag-jobs', filters: { tags: 'jobs' } },
  { key: 'tag-jobs-published', filters: { tags: 'jobs', activeWorkflows: true } },
  { key: 'tag-and-name', filters: { tags: TAG, name: 'Workflow 1' } },

  { key: 'published-only', filters: { activeWorkflows: true } },
  { key: 'published-switch-off', filters: { activeWorkflows: false } },

  { key: 'limit-2', returnAll: false, limit: 2, filters: {} },
  { key: 'exclude-pinned', filters: { excludePinnedData: true } },
];
