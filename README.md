# Vantage Statusboard

A self-contained Windows desktop and web status board for Telestream Vantage newsroom transcodes.

## Capabilities

- Native, resizable Windows application
- Self-contained portable launcher with a built-in per-user Windows installer
- Optional always-on-top pin and window position/size lock
- Optional Windows sign-in autostart
- Local web dashboard on a configurable port
- Read-only web dashboard with settings available only in the desktop window
- Persistent Vantage server, refresh, filter, theme, and window settings
- Optional summary counters, hidden by default for a focused job view
- Built-in themes and importable JSON theme files
- Saved 80–130% interface scaling for text and controls
- Read-only Vantage REST integration
- Active → waiting → issue → complete status ordering, newest updates first within each group
- Configurable failed-job expiry, defaulting to one hour
- Multi-workflow filtering with saved selections
- Progress, start time, conditional queue-wait detail, live elapsed time, and cached Vantage-finalized run time

## Development

```powershell
npm install
npm start
```

Run validation:

```powershell
npm test
npm run lint
```

Build a portable Windows executable:

```powershell
npm run build
```

Two executables are written to `dist/`:

- `Vantage-Statusboard-Setup-<version>.exe` installs the app for the current user under `%LOCALAPPDATA%\Programs\vantage-statusboard`, adds the Start Menu shortcut and Windows uninstaller, and does not require administrator access.
- `Vantage-Statusboard-<version>-portable.exe` runs without installation and carries the setup program inside itself. Its **Install** button launches the embedded setup program.

Enabling **Start with Windows** from a portable copy starts installation automatically. The installed app reuses the same saved settings and registers the installed executable—not the portable launcher—for sign-in startup.

## Custom themes

Import [`examples/theme-example.json`](examples/theme-example.json) from **Settings → Appearance** as a starting point. A theme supplies the board's semantic colors, corner radius, and compact or comfortable density. Imported themes are copied into the current user's application-data folder, so the original file is not needed afterward.

## Local data

Settings and imported themes are stored in Electron's application-data directory for the current Windows user. Passwords and tokens are encrypted with the Windows account through Electron's safe storage when supported.

The web dashboard binds to `127.0.0.1` by default. It can be exposed to the LAN in Settings; do that only on a trusted network because anyone who can reach the port can view the board.

## Reverse proxy under a path

The web dashboard supports hosting below a path such as `https://host.int/vantage/`. Redirect the path without a trailing slash and have nginx remove the `/vantage/` prefix before proxying upstream:

```nginx
location = /vantage {
    return 301 /vantage/;
}

location /vantage/ {
    proxy_pass http://STATUSBOARD_HOST:8765/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Keep the trailing slash on both `location /vantage/` and `proxy_pass`. If nginx runs on a different computer, enable **Expose to local network** in the statusboard settings and allow the configured port through the Windows firewall only for the proxy host.
