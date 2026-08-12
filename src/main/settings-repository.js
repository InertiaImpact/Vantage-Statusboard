'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { safeStorage } = require('electron');
const { DEFAULT_SETTINGS, deepClone, mergeSettings } = require('../shared/defaults');
const { validateSettings } = require('../shared/validation');

const SECRET_FIELDS = Object.freeze(['password', 'token']);

class SettingsRepository {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'settings.json');
    this.settings = this.#load();
  }

  get() {
    return deepClone(this.settings);
  }

  getPublic() {
    const publicSettings = this.get();
    for (const field of SECRET_FIELDS) {
      publicSettings.vantage[field] = '';
      publicSettings.vantage[`${field}Saved`] = Boolean(this.settings.vantage[field]);
    }
    return publicSettings;
  }

  save(candidate) {
    const merged = mergeSettings(this.settings, candidate);
    for (const field of SECRET_FIELDS) {
      if (!candidate?.vantage || candidate.vantage[field] === undefined || candidate.vantage[field] === '') {
        merged.vantage[field] = this.settings.vantage[field];
      }
    }
    this.settings = validateSettings(merged);
    this.#write(this.settings);
    return this.getPublic();
  }

  updateDesktop(patch) {
    return this.save({ desktop: patch });
  }

  #load() {
    try {
      if (!fs.existsSync(this.filePath)) return deepClone(DEFAULT_SETTINGS);
      const stored = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (stored.vantage) {
        for (const field of SECRET_FIELDS) {
          stored.vantage[field] = this.#decrypt(stored.vantage[field]);
        }
      }
      return validateSettings(stored);
    } catch (error) {
      console.error('Unable to read saved settings; defaults will be used.', error);
      return deepClone(DEFAULT_SETTINGS);
    }
  }

  #write(settings) {
    const diskSettings = deepClone(settings);
    for (const field of SECRET_FIELDS) {
      diskSettings.vantage[field] = this.#encrypt(diskSettings.vantage[field]);
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(diskSettings, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, this.filePath);
  }

  #encrypt(value) {
    if (!value) return '';
    if (safeStorage.isEncryptionAvailable()) {
      return `safe:${safeStorage.encryptString(String(value)).toString('base64')}`;
    }
    return `plain:${Buffer.from(String(value), 'utf8').toString('base64')}`;
  }

  #decrypt(value) {
    if (!value || typeof value !== 'string') return '';
    try {
      if (value.startsWith('safe:') && safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(value.slice(5), 'base64'));
      }
      if (value.startsWith('plain:')) return Buffer.from(value.slice(6), 'base64').toString('utf8');
      return value;
    } catch {
      return '';
    }
  }
}

module.exports = { SettingsRepository };
