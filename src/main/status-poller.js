'use strict';

const { EventEmitter } = require('node:events');
const { VantageClient } = require('./vantage-client');

class StatusPoller extends EventEmitter {
  constructor(settingsRepository, statsRepository) {
    super();
    this.settingsRepository = settingsRepository;
    this.statsRepository = statsRepository;
    this.timer = null;
    this.inFlight = null;
    this.completedMetricsCache = new Map();
    this.status = {
      connected: false,
      fetchedAt: null,
      jobs: [],
      workflowOptions: [],
      stats: { startedAt: null, groups: [] },
      warnings: [],
      error: null
    };
  }

  start() {
    this.stop();
    void this.refresh();
    const interval = this.settingsRepository.get().dashboard.refreshSeconds * 1000;
    this.timer = setInterval(() => void this.refresh(), interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get() {
    return structuredClone(this.status);
  }

  resetStats() {
    this.statsRepository.reset();
    const dashboard = this.settingsRepository.get().dashboard;
    this.status.stats = this.statsRepository.update(
      this.status.jobs,
      dashboard,
      this.status.workflowOptions
    );
    this.emit('status', this.get());
    return this.get();
  }

  async refresh() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.#performRefresh();
    try {
      return await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  async #performRefresh() {
    try {
      const settings = this.settingsRepository.get();
      this.status = await new VantageClient(settings.vantage, {
        completedMetricsCache: this.completedMetricsCache
      }).getStatus(settings.dashboard);
      this.status.stats = this.statsRepository.update(
        this.status.jobs,
        settings.dashboard,
        this.status.workflowOptions
      );
      this.status.error = null;
    } catch (error) {
      this.status = {
        ...this.status,
        connected: false,
        fetchedAt: new Date().toISOString(),
        error: error.message
      };
    }
    this.emit('status', this.get());
    return this.get();
  }
}

module.exports = { StatusPoller };
