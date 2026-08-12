'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { BUILT_IN_THEMES, validateTheme } = require('../shared/themes');

class ThemeRepository {
  constructor(userDataPath) {
    this.directory = path.join(userDataPath, 'themes');
    fs.mkdirSync(this.directory, { recursive: true });
  }

  list() {
    return [...BUILT_IN_THEMES, ...this.#customThemes()];
  }

  get(id) {
    return this.list().find((theme) => theme.id === id) || BUILT_IN_THEMES[0];
  }

  importFromText(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('The selected theme is not valid JSON.');
    }
    const theme = validateTheme(parsed);
    if (BUILT_IN_THEMES.some((builtIn) => builtIn.id === theme.id)) {
      throw new Error('Custom themes cannot replace a built-in theme.');
    }
    const target = path.join(this.directory, `${theme.id}.json`);
    fs.writeFileSync(target, `${JSON.stringify(theme, null, 2)}\n`, 'utf8');
    return theme;
  }

  #customThemes() {
    const themes = [];
    for (const entry of fs.readdirSync(this.directory, { withFileTypes: true })) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
      try {
        const candidate = JSON.parse(fs.readFileSync(path.join(this.directory, entry.name), 'utf8'));
        themes.push(validateTheme(candidate));
      } catch (error) {
        console.warn(`Skipping invalid theme ${entry.name}: ${error.message}`);
      }
    }
    return themes.sort((left, right) => left.name.localeCompare(right.name));
  }
}

module.exports = { ThemeRepository };
