'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { StatsRepository, countsFor } = require('../src/main/stats-repository');

test('calculates completed-job time windows in local time', () => {
  const now = new Date(2026, 8, 10, 12, 0, 0).getTime();
  const completions = [
    { completedAt: now - (30 * 60 * 1000) },
    { completedAt: now - (2 * 60 * 60 * 1000) },
    { completedAt: new Date(2026, 8, 10, 0, 0, 0).getTime() },
    { completedAt: now - (25 * 60 * 60 * 1000) }
  ];
  assert.deepEqual(countsFor(completions, now), {
    pastHour: 1,
    today: 3,
    past24Hours: 3,
    total: 4
  });
});

test('starts on the first poll, persists every workflow, and separates workflow totals', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-stats-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-09-10T14:00:00Z');
  const dashboard = { showStats: true, statsShowOverall: true, statsWorkflowIds: ['wf-news'] };
  const workflows = [{ id: 'wf-news', name: 'News' }, { id: 'wf-sports', name: 'Sports' }];
  const repository = new StatsRepository(directory, { now: () => now });

  repository.update([], dashboard, workflows);
  now += 60_000;
  const summary = repository.update([
    { id: 'job-1', state: 'Complete', updated: new Date(now).toISOString(), workflowId: 'wf-news', workflowName: 'News' },
    { id: 'job-2', state: 'Succeeded', updated: new Date(now).toISOString(), workflowId: 'wf-sports', workflowName: 'Sports' },
    { id: 'active', state: 'Active', updated: new Date(now).toISOString(), workflowId: 'wf-news', workflowName: 'News' }
  ], dashboard, workflows);

  assert.equal(summary.groups[0].name, 'Overall');
  assert.equal(summary.groups[0].counts.total, 2);
  assert.equal(summary.groups[1].name, 'News');
  assert.equal(summary.groups[1].counts.total, 1);

  const restored = new StatsRepository(directory, { now: () => now });
  const restoredSummary = restored.update([
    { id: 'job-1', state: 'Complete', updated: new Date(now).toISOString(), workflowId: 'wf-news', workflowName: 'News' }
  ], dashboard, workflows);
  assert.equal(restoredSummary.groups[0].counts.total, 2);
});

test('records every workflow while the top-bar display is disabled', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-stats-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-09-10T14:00:00Z');
  const repository = new StatsRepository(directory, { now: () => now });
  repository.update([], { showStats: false, statsShowOverall: true, statsWorkflowIds: [] }, []);
  now += 60_000;
  repository.update([
    { id: 'hidden-job', state: 'Complete', updated: new Date(now).toISOString(), workflowId: 'wf-later', workflowName: 'Selected Later' }
  ], { showStats: false, statsShowOverall: true, statsWorkflowIds: [] }, []);

  const summary = repository.summary({ statsShowOverall: false, statsWorkflowIds: ['wf-later'] }, [], now);
  assert.equal(summary.groups[0].name, 'Selected Later');
  assert.equal(summary.groups[0].counts.total, 1);
});

test('does not backfill jobs completed before tracking began', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-stats-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const now = Date.parse('2026-09-10T14:00:00Z');
  const repository = new StatsRepository(directory, { now: () => now });
  const summary = repository.update([
    { id: 'old-job', state: 'Complete', updated: '2026-09-09T14:00:00Z', workflowId: 'wf-news', workflowName: 'News' }
  ], { showStats: true, statsShowOverall: true, statsWorkflowIds: [] }, []);
  assert.equal(summary.groups[0].counts.total, 0);
});

test('reset clears every total and restarts the tracking date', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vantage-stats-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-09-10T14:00:00Z');
  const repository = new StatsRepository(directory, { now: () => now });
  repository.update([], { statsShowOverall: true, statsWorkflowIds: [] }, []);
  now += 60_000;
  repository.update([
    { id: 'job-before-reset', state: 'Complete', updated: new Date(now).toISOString(), workflowId: 'wf-news', workflowName: 'News' }
  ], { statsShowOverall: true, statsWorkflowIds: [] }, []);
  now += 60_000;
  const restartedAt = repository.reset();
  const summary = repository.summary({ statsShowOverall: true, statsWorkflowIds: [] }, [], now);
  assert.equal(restartedAt, new Date(now).toISOString());
  assert.equal(summary.groups[0].counts.total, 0);
});
