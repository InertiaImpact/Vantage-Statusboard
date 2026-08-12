'use strict';

const { EventEmitter } = require('node:events');
const { VantageClient } = require('./vantage-client');

class StatusPoller extends EventEmitter {
  constructor(settingsRepository) {
    super();
    this.settingsRepository = settingsRepository;
    this.timer = null;
    this.inFlight = null;
    this.status = {
      connected: false,
      fetchedAt: null,
      jobs: [],
      workflowOptions: [],
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
      this.status = await new VantageClient(settings.vantage).getStatus();
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
