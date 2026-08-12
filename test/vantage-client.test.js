'use strict';

const http = require('node:http');
const test = require('node:test');
const assert = require('node:assert/strict');
const { VantageClient, jobPriority } = require('../src/main/vantage-client');

function json(response, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
}

test('collects, enriches, and sorts Vantage jobs', async (context) => {
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
    response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const port = server.address().port;
  const client = new VantageClient({
    server: '127.0.0.1', protocol: 'http', port, authType: 'none', verifyTls: true, requestTimeoutSeconds: 5
  });
  const result = await client.getStatus();
  assert.deepEqual(result.jobs.map((job) => job.state), ['Active', 'Waiting', 'Complete']);
  assert.equal(result.jobs[0].progress, 50);
  assert.equal(result.jobs[0].etaSeconds, 60);
  assert.ok(jobPriority(result.jobs[0]) < jobPriority(result.jobs[2]));
});
