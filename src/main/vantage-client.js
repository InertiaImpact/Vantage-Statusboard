'use strict';

const http = require('node:http');
const https = require('node:https');

const JOB_STATES = Object.freeze({
  0: 'Active',
  4: 'Failed',
  5: 'Complete',
  6: 'Waiting',
  7: 'Stopped by User',
  8: 'Waiting to Retry',
  10: 'Queued for Submission',
  11: 'No Such Job'
});

function compactState(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function jobPriority(job) {
  const state = compactState(job.state);
  if (['active', 'inprocess', 'processing', 'running'].includes(state)) return 0;
  if (['waiting', 'waitingtoretry', 'queued', 'queuedforsubmission', 'paused'].includes(state)) return 1;
  if (['complete', 'completed', 'success', 'succeeded'].includes(state)) return 3;
  return 2;
}

function parseDate(value) {
  if (!value) return null;
  const serialized = String(value).match(/\/Date\((\d+)/);
  const parsed = serialized ? new Date(Number(serialized[1])) : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function elapsedSeconds(value) {
  const date = parseDate(value);
  return date ? Math.max(0, Math.round((Date.now() - date.getTime()) / 1000)) : null;
}

async function mapLimit(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

class VantageClient {
  constructor(settings) {
    this.settings = settings;
    this.baseUrl = `${settings.protocol}://${settings.server}:${settings.port}`;
  }

  async getStatus() {
    if (!this.settings.server) throw new Error('Configure a Vantage server in Settings.');
    const workflowsPayload = await this.#requestJson('/Rest/Workflows');
    const workflows = this.#arrayFrom(workflowsPayload, 'Workflows');
    const warnings = [];

    const workflowJobs = await mapLimit(workflows, 8, async (workflow) => {
      const workflowId = String(workflow.Identifier || workflow.ID || workflow.Id || '');
      const workflowName = String(workflow.Name || workflow.WorkflowName || 'Unnamed workflow');
      if (!workflowId) return [];
      try {
        const payload = await this.#requestJson(`/Rest/Workflows/${encodeURIComponent(workflowId)}/Jobs/?filter=All`);
        return this.#arrayFrom(payload, 'Jobs').map((job) => this.#normalizeJob(job, workflowId, workflowName));
      } catch (error) {
        warnings.push(`${workflowName}: ${error.message}`);
        return [];
      }
    });

    const jobs = workflowJobs.flat();
    const currentJobs = jobs.filter((job) => !job.isMonitor && ['active', 'waiting', 'waitingtoretry', 'queuedforsubmission'].includes(compactState(job.state)));
    await mapLimit(currentJobs.slice(0, 32), 8, async (job) => this.#enrichJob(job));
    jobs.sort((left, right) => jobPriority(left) - jobPriority(right) || left.workflowName.localeCompare(right.workflowName) || left.name.localeCompare(right.name));

    return {
      connected: true,
      fetchedAt: new Date().toISOString(),
      baseUrl: this.baseUrl,
      warnings,
      workflowOptions: workflows
        .map((workflow) => ({
          id: String(workflow.Identifier || workflow.ID || workflow.Id || ''),
          name: String(workflow.Name || workflow.WorkflowName || 'Unnamed workflow')
        }))
        .filter((workflow) => workflow.id)
        .sort((left, right) => left.name.localeCompare(right.name)),
      jobs
    };
  }

  async #enrichJob(job) {
    const encodedId = encodeURIComponent(job.id);
    const [progressResult, metricsResult] = await Promise.allSettled([
      this.#requestJson(`/Rest/Jobs/${encodedId}/Progress`),
      this.#requestJson(`/Rest/Jobs/${encodedId}/Metrics`)
    ]);
    if (progressResult.status === 'fulfilled') {
      const progress = Number(progressResult.value.JobProgress ?? progressResult.value.Progress);
      if (Number.isFinite(progress)) job.progress = Math.min(100, Math.max(0, progress));
    }
    if (metricsResult.status === 'fulfilled') {
      const metrics = metricsResult.value;
      const runTime = Number(metrics.TotalRunTimeInSeconds ?? metrics.RunTimeInSeconds);
      const queueTime = Number(metrics.TotalQueueTimeInSeconds ?? metrics.QueueTimeInSeconds);
      if (Number.isFinite(runTime) && runTime > 0) job.runTimeSeconds = runTime;
      if (Number.isFinite(queueTime) && queueTime >= 0) job.queueTimeSeconds = queueTime;
    }
    if (!job.runTimeSeconds) job.runTimeSeconds = elapsedSeconds(job.started);
    if (job.progress > 0 && job.runTimeSeconds > 0) {
      job.etaSeconds = Math.round(job.runTimeSeconds * (100 - job.progress) / job.progress);
    }
    return job;
  }

  #normalizeJob(job, workflowId, workflowName) {
    const stateValue = job.State ?? job.Status ?? 'Unknown';
    const state = JOB_STATES[stateValue] || String(stateValue);
    return {
      id: String(job.Identifier || job.ID || job.Id || ''),
      name: String(job.Name || job.JobName || 'Unnamed job'),
      state,
      progress: null,
      started: job.Started_UTC || job.Started || '',
      updated: job.Updated_UTC || job.Updated || '',
      isMonitor: Boolean(job.IsMonitor),
      workflowId,
      workflowName,
      runTimeSeconds: null,
      queueTimeSeconds: null,
      etaSeconds: null
    };
  }

  #arrayFrom(payload, key) {
    if (Array.isArray(payload)) return payload;
    const value = payload?.[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return [value];
    return [];
  }

  #headers() {
    const headers = { Accept: 'application/json', 'User-Agent': 'Vantage-Statusboard/1.0' };
    if (this.settings.authType === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${this.settings.username}:${this.settings.password}`).toString('base64')}`;
    } else if (this.settings.authType === 'bearer') {
      headers.Authorization = `Bearer ${this.settings.token}`;
    } else if (this.settings.authType === 'apikey') {
      headers[this.settings.apiKeyHeader || 'X-Api-Key'] = this.settings.token;
    }
    return headers;
  }

  #requestJson(pathname) {
    const target = new URL(pathname, this.baseUrl);
    const transport = target.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(target, {
        method: 'GET',
        headers: this.#headers(),
        timeout: this.settings.requestTimeoutSeconds * 1000,
        rejectUnauthorized: this.settings.verifyTls
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Vantage returned HTTP ${response.statusCode || 'unknown'}.`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Vantage returned an invalid JSON response.'));
          }
        });
      });
      request.on('timeout', () => request.destroy(new Error('The Vantage request timed out.')));
      request.on('error', (error) => reject(new Error(`Could not reach ${this.baseUrl}: ${error.message}`)));
      request.end();
    });
  }
}

module.exports = { VantageClient, compactState, elapsedSeconds, jobPriority, mapLimit, parseDate };
