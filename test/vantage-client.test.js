'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { VantageClient, compareJobs, jobPriority, parseDate } = require('../src/main/vantage-client');

function json(response, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

test('collects, enriches, and sorts Vantage jobs', async (context) => {
  let completedMetricRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url === '/Rest/Workflows') return json(response, { Workflows: [{ Identifier: 'wf-1', Name: 'News Export' }] });
    if (request.url === '/Rest/Workflows/wf-1/Jobs/?filter=All') return json(response, { Jobs: [
      { Identifier: 'done', Name: 'Done.mxf', State: 5, IsMonitor: false },
      { Identifier: 'active', Name: 'Live.mxf', State: 0, IsMonitor: false, Started_UTC: new Date(Date.now() - 60_000).toISOString() },
      { Identifier: 'waiting', Name: 'Wait.mxf', State: 6, IsMonitor: false }
    ] });
    if (request.url === '/Rest/Jobs/active/Progress') return json(response, { JobProgress: 50 });
    if (request.url === '/Rest/Jobs/active/Metrics') return json(response, { TotalRunTimeInSeconds: 60, TotalQueueTimeInSeconds: 2 });
    if (request.url === '/Rest/Jobs/waiting/Progress') return json(response, { JobProgress: 0 });
    if (request.url === '/Rest/Jobs/waiting/Metrics') return json(response, { TotalRunTimeInSeconds: 0, TotalQueueTimeInSeconds: 10 });
    if (request.url === '/Rest/Jobs/done/Metrics') {
      completedMetricRequests += 1;
      return json(response, { TotalRunTimeInSeconds: 75, TotalQueueTimeInSeconds: 1 });
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const metricsCache = new Map();
  const client = new VantageClient({
    server: '127.0.0.1', protocol: 'http', port, authType: 'none', verifyTls: true, requestTimeoutSeconds: 5
  }, { completedMetricsCache: metricsCache });
  const result = await client.getStatus({ view: 'all', workflowIds: [], search: '' });
  assert.deepEqual(result.jobs.map((job) => job.state), ['Active', 'Waiting', 'Complete']);
  assert.equal(result.jobs[0].progress, 50);
  assert.equal(result.jobs[0].runTimeSeconds, 60);
  assert.equal(result.jobs[0].runTimeSource, 'vantage');
  assert.equal(result.jobs[0].queueTimeSeconds, 2);
  assert.equal(result.jobs[1].runTimeSeconds, null);
  assert.equal(result.jobs[1].queueTimeSeconds, 10);
  assert.equal(result.jobs[2].runTimeSeconds, 75);
  assert.equal(result.jobs[2].runTimeSource, 'vantage');
  assert.equal(result.jobs[2].queueTimeSeconds, 1);
  assert.equal(completedMetricRequests, 1);
  assert.ok(jobPriority(result.jobs[0]) < jobPriority(result.jobs[2]));

  await client.getStatus({ view: 'all', workflowIds: [], search: '' });
  assert.equal(completedMetricRequests, 1);
  assert.deepEqual(metricsCache.get('done'), { runTimeSeconds: 75, queueTimeSeconds: 1 });
});

test('uses elapsed wall time for an active job until Vantage finalizes its runtime', async (context) => {
  const started = '2026-08-14T12:00:00.0000000Z';
  const now = Date.parse('2026-08-14T12:02:20Z');
  const server = http.createServer((request, response) => {
    if (request.url === '/Rest/Workflows') return json(response, { Workflows: [{ Identifier: 'wf-1', Name: 'News Export' }] });
    if (request.url === '/Rest/Workflows/wf-1/Jobs/?filter=All') return json(response, { Jobs: [
      { Identifier: 'active', Name: 'Live.mxf', State: 0, IsMonitor: false, Started_UTC: started }
    ] });
    if (request.url === '/Rest/Jobs/active/Progress') return json(response, { JobProgress: 40 });
    if (request.url === '/Rest/Jobs/active/Metrics') return json(response, { TotalRunTimeInSeconds: 0, TotalQueueTimeInSeconds: 0 });
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const client = new VantageClient({
    server: '127.0.0.1', protocol: 'http', port: server.address().port, authType: 'none', verifyTls: true, requestTimeoutSeconds: 5
  }, { now: () => now });
  const result = await client.getStatus({ view: 'current' });
  assert.equal(result.jobs[0].runTimeSeconds, 140);
  assert.equal(result.jobs[0].runTimeSource, 'elapsed');
});

test('sorts newest updates first within each status group', () => {
  const jobs = [
    { name: 'Waiting newest', state: 'Waiting', updated: '2026-08-12T15:00:00Z', workflowName: 'News' },
    { name: 'Active older', state: 'Active', updated: '2026-08-12T13:00:00Z', workflowName: 'News' },
    { name: 'Active newest', state: 'Active', updated: '2026-08-12T14:00:00Z', workflowName: 'News' },
    { name: 'Complete newest', state: 'Complete', updated: '2026-08-12T16:00:00Z', workflowName: 'News' }
  ];
  jobs.sort(compareJobs);
  assert.deepEqual(jobs.map((job) => job.name), ['Active newest', 'Active older', 'Waiting newest', 'Complete newest']);
});

test('parses Vantage timestamps with seven fractional-second digits', () => {
  assert.equal(parseDate('2026-08-12T22:00:26.6530000Z').toISOString(), '2026-08-12T22:00:26.653Z');
});
