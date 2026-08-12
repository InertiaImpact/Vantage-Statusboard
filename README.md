# Vantage Statusboard

A self-contained Windows desktop and web status board for Telestream Vantage newsroom transcodes.

## Capabilities

- Native, resizable Windows application
- Optional always-on-top pin and window position/size lock
- Optional Windows sign-in autostart
- Local web dashboard on a configurable port
- Read-only web dashboard with settings available only in the desktop window
- Persistent Vantage server, refresh, filter, theme, and window settings
- Optional summary counters, hidden by default for a focused job view
- Built-in themes and importable JSON theme files
- Read-only Vantage REST integration
- Active → waiting → issue → complete status ordering
- Multi-workflow filtering with saved selections
- Progress, estimated remaining time, start time, and run time

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

The resulting `.exe` is written to `dist/`. It includes the application runtime and does not require Node.js on the target computer.

Keep the portable executable in a stable location before enabling **Start with Windows**. Windows stores that exact path as the sign-in launch target.

## Custom themes

Import [`examples/theme-example.json`](examples/theme-example.json) from **Settings → Appearance** as a starting point. A theme supplies the board's semantic colors, corner radius, and compact or comfortable density. Imported themes are copied into the current user's application-data folder, so the original file is not needed afterward.

## Local data

Settings and imported themes are stored in Electron's application-data directory for the current Windows user. Passwords and tokens are encrypted with the Windows account through Electron's safe storage when supported.

The web dashboard binds to `127.0.0.1` by default. It can be exposed to the LAN in Settings; do that only on a trusted network because anyone who can reach the port can view the board.
