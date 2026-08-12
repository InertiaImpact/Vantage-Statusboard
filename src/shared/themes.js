'use strict';

const BUILT_IN_THEMES = Object.freeze([
  {
    id: 'slate',
    name: 'Neutral Dark',
    builtIn: true,
    tokens: {
      background: '#121212',
      surface: '#1c1c1c',
      surfaceRaised: '#242424',
      border: '#383838',
      text: '#f1f1f1',
      muted: '#a5a5a5',
      primary: '#d0d0d0',
      active: '#65a7e8',
      waiting: '#d5aa55',
      danger: '#df6875',
      success: '#70bb82',
      radius: '4px',
      density: 'comfortable'
    }
  },
  {
    id: 'graphite',
    name: 'Graphite',
    builtIn: true,
    tokens: {
      background: '#0d0d0d',
      surface: '#171717',
      surfaceRaised: '#202020',
      border: '#323232',
      text: '#f2f2f2',
      muted: '#999999',
      primary: '#c4c4c4',
      active: '#78a9dc',
      waiting: '#caa25a',
      danger: '#d46c77',
      success: '#78ad81',
      radius: '2px',
      density: 'compact'
    }
  },
  {
    id: 'midnight',
    name: 'Soft Charcoal',
    builtIn: true,
    tokens: {
      background: '#181818',
      surface: '#222222',
      surfaceRaised: '#2a2a2a',
      border: '#404040',
      text: '#f4f4f4',
      muted: '#aaaaaa',
      primary: '#d8d8d8',
      active: '#74a8dc',
      waiting: '#d8ae60',
      danger: '#dc737d',
      success: '#78b889',
      radius: '4px',
      density: 'comfortable'
    }
  }
]);

const REQUIRED_TOKEN_KEYS = Object.freeze([
  'background', 'surface', 'surfaceRaised', 'border', 'text', 'muted',
  'primary', 'active', 'waiting', 'danger', 'success', 'radius', 'density'
]);

function validateTheme(theme) {
  if (!theme || typeof theme !== 'object') throw new Error('Theme file must contain a JSON object.');
  const id = String(theme.id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const name = String(theme.name || '').trim();
  if (!id || !name || !theme.tokens || typeof theme.tokens !== 'object') {
    throw new Error('Theme files require id, name, and tokens properties.');
  }
  const missing = REQUIRED_TOKEN_KEYS.filter((key) => !String(theme.tokens[key] || '').trim());
  if (missing.length) throw new Error(`Theme is missing: ${missing.join(', ')}.`);
  const allowedColor = /^#[0-9a-f]{6}$/i;
  for (const key of REQUIRED_TOKEN_KEYS.slice(0, 11)) {
    if (!allowedColor.test(theme.tokens[key])) throw new Error(`${key} must be a six-digit hex color.`);
  }
  if (!/^\d+(?:\.\d+)?(?:px|rem)$/.test(theme.tokens.radius)) throw new Error('radius must use px or rem units.');
  if (!['compact', 'comfortable'].includes(theme.tokens.density)) throw new Error('density must be compact or comfortable.');
  return { id, name, builtIn: false, tokens: { ...theme.tokens } };
}

module.exports = { BUILT_IN_THEMES, REQUIRED_TOKEN_KEYS, validateTheme };
