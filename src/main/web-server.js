'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { URL } = require('node:url');

const CONTENT_TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8'
});

class WebServer {
  constructor({ rendererDirectory, settingsRepository, themeRepository, poller, onSettingsSaved }) {
    this.rendererDirectory = rendererDirectory;
    this.settingsRepository = settingsRepository;
    this.themeRepository = themeRepository;
    this.poller = poller;
    this.onSettingsSaved = onSettingsSaved;
    this.server = null;
    this.address = null;
  }

  async start() {
    await this.stop();
    const settings = this.settingsRepository.get();
    const host = settings.dashboard.exposeToLan ? '0.0.0.0' : '127.0.0.1';
    const port = settings.dashboard.webPort;
    this.server = http.createServer((request, response) => void this.#handle(request, response));
    await new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(port, host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
    this.address = { host, port, url: `http://127.0.0.1:${port}` };
    return this.address;
  }

  async restart() {
    return this.start();
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close(() => resolve());
      this.server = null;
      this.address = null;
    });
  }

  async #handle(request, response) {
    try {
      const requestUrl = new URL(request.url, 'http://localhost');
      if (request.method === 'GET' && requestUrl.pathname === '/api/bootstrap') {
        this.#json(response, 200, this.#bootstrap());
        return;
      }
      if (request.method === 'GET' && requestUrl.pathname === '/api/status') {
        this.#json(response, 200, this.poller.get());
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/refresh') {
        this.#json(response, 200, await this.poller.refresh());
        return;
      }
      if (request.method === 'PUT' && requestUrl.pathname === '/api/settings') {
        this.#requireLocalRequest(request);
        const settings = this.settingsRepository.save(await this.#readJson(request));
        this.#json(response, 200, this.#bootstrap());
        setTimeout(() => {
          Promise.resolve(this.onSettingsSaved(settings)).catch((error) => console.error('Unable to apply settings.', error));
        }, 50);
        return;
      }
      if (request.method === 'POST' && requestUrl.pathname === '/api/themes/import') {
        this.#requireLocalRequest(request);
        const payload = await this.#readJson(request);
        const theme = this.themeRepository.importFromText(String(payload.text || ''));
        this.#json(response, 200, { theme, themes: this.themeRepository.list() });
        return;
      }
      this.#serveStatic(requestUrl.pathname, response);
    } catch (error) {
      this.#json(response, 400, { error: error.message });
    }
  }

  #bootstrap() {
    const settings = this.settingsRepository.getPublic();
    return {
      settings,
      themes: this.themeRepository.list(),
      activeTheme: this.themeRepository.get(settings.dashboard.themeId),
      status: this.poller.get(),
      desktop: Boolean(process.versions.electron)
    };
  }

  #serveStatic(pathname, response) {
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const root = path.resolve(this.rendererDirectory);
    const target = path.resolve(root, relative);
    const traversal = path.relative(root, target);
    if (traversal.startsWith('..') || path.isAbsolute(traversal) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      this.#json(response, 404, { error: 'Not found.' });
      return;
    }
    const data = fs.readFileSync(target);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'"
    });
    response.end(data);
  }

  #json(response, status, payload) {
    const body = Buffer.from(JSON.stringify(payload));
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
    response.end(body);
  }

  #readJson(request) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      request.on('data', (chunk) => {
        size += chunk.length;
        if (size > 256 * 1024) {
          reject(new Error('Request is too large.'));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
        } catch {
          reject(new Error('Request contains invalid JSON.'));
        }
      });
      request.on('error', reject);
    });
  }

  #requireLocalRequest(request) {
    const address = request.socket.remoteAddress || '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address)) {
      throw new Error('Settings can only be changed from the Windows computer running the app.');
    }
  }
}

module.exports = { WebServer };
