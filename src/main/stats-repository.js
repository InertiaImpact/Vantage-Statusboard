'use strict';

const fs = require('node:fs');
const path = require('node:path');

function compactState(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value);
  const serialized = text.match(/\/Date\((\d+)/);
  const normalized = text.replace(/(\.\d{3})\d+(?=Z$|[+-]\d{2}:?\d{2}$)/, '$1');
  const parsed = serialized ? new Date(Number(serialized[1])) : new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function emptyState() {
  return { version: 1, startedAt: null, completions: [] };
}

function countsFor(completions, now) {
  const hourCutoff = now - (60 * 60 * 1000);
  const dayCutoff = now - (24 * 60 * 60 * 1000);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayCutoff = today.getTime();
  return {
    pastHour: completions.filter((item) => item.completedAt >= hourCutoff).length,
    today: completions.filter((item) => item.completedAt >= todayCutoff).length,
    past24Hours: completions.filter((item) => item.completedAt >= dayCutoff).length,
    total: completions.length
  };
}

class StatsRepository {
  constructor(userDataPath, options = {}) {
    this.filePath = path.join(userDataPath, 'job-stats.json');
    this.now = options.now || Date.now;
    this.state = this.#load();
    this.knownIds = new Set(this.state.completions.map((item) => item.id));
  }

  update(jobs, dashboard, workflowOptions = []) {
    let changed = false;
    const now = this.now();

    if (!this.state.startedAt) {
      this.state.startedAt = new Date(now).toISOString();
      changed = true;
    }

    if (this.state.startedAt) {
      const trackingStart = Date.parse(this.state.startedAt);
      for (const job of jobs || []) {
        if (job.isMonitor || !['complete', 'completed', 'success', 'succeeded'].includes(compactState(job.state)) || !job.id || this.knownIds.has(job.id)) continue;
        const completedAt = (parseDate(job.updated) || new Date(now)).getTime();
        if (completedAt < trackingStart) continue;
        this.state.completions.push({
          id: String(job.id),
          workflowId: String(job.workflowId || ''),
          workflowName: String(job.workflowName || 'Unnamed workflow'),
          completedAt
        });
        this.knownIds.add(String(job.id));
        changed = true;
      }
    }

    if (changed) this.#write();
    return this.summary(dashboard, workflowOptions, now);
  }

  summary(dashboard, workflowOptions = [], now = this.now()) {
    if (!this.state.startedAt) return { startedAt: null, groups: [] };
    const names = new Map(workflowOptions.map((workflow) => [String(workflow.id), workflow.name]));
    for (const item of this.state.completions) {
      if (item.workflowId && !names.has(item.workflowId)) names.set(item.workflowId, item.workflowName);
    }

    const groups = [];
    if (dashboard?.statsShowOverall !== false) {
      groups.push({ id: 'overall', name: 'Overall', counts: countsFor(this.state.completions, now) });
    }
    for (const workflowId of (dashboard?.statsWorkflowIds || []).slice(0, 2)) {
      const completions = this.state.completions.filter((item) => item.workflowId === workflowId);
      groups.push({
        id: workflowId,
        name: names.get(workflowId) || `Workflow ${workflowId}`,
        counts: countsFor(completions, now)
      });
    }
    return { startedAt: this.state.startedAt, groups };
  }

  reset() {
    this.state = emptyState();
    this.state.startedAt = new Date(this.now()).toISOString();
    this.knownIds.clear();
    this.#write();
    return this.state.startedAt;
  }

  #load() {
    try {
      if (!fs.existsSync(this.filePath)) return emptyState();
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!stored || !Array.isArray(stored.completions)) return emptyState();
      return {
        version: 1,
        startedAt: parseDate(stored.startedAt)?.toISOString() || null,
        completions: stored.completions
          .filter((item) => item && item.id && Number.isFinite(Number(item.completedAt)))
          .map((item) => ({
            id: String(item.id),
            workflowId: String(item.workflowId || ''),
            workflowName: String(item.workflowName || 'Unnamed workflow'),
            completedAt: Number(item.completedAt)
          }))
      };
    } catch (error) {
      console.error('Unable to read job statistics; a new history will be started.', error);
      return emptyState();
    }
  }

  #write() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.state, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }
}

module.exports = { StatsRepository, countsFor };
