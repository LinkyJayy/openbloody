# OpenBloody

An open-source, in-browser configurator for **Bloody (A4Tech) gaming mice**: the A70 / A70X family, A60, A90/A91, A9, J95, V7/V8, ES9 Pro, W70/W90 Max, R-series and others. It runs entirely in the browser over **WebHID**, installs as a **PWA**, works offline, and deploys to **Railway** with one click.

> ⚠️ **Status: the hardware protocol is not verified yet.** A4Tech has never published the Bloody configuration protocol, and there's no public reverse-engineering of it. OpenBloody ships a *draft*, data-driven protocol definition that drives the built-in simulator. By default it won't send configuration commands to a real mouse until a definition is marked verified, or until you opt in under **Settings → Hardware writes**. The **Protocol Lab** has the tools to capture and map the real protocol. Contributions of verified definitions are very welcome.

## Features

The feature set mirrors BloodyWorkshop:

| Area | What you can do |
| --- | --- |
| **Core modes** | Core 1 (standard), Core 2 (fire modes), Core 3 (macros), Core 4 (sniper / precision), stored per profile |
| **Buttons** | Remap every button to a mouse function, a keyboard key with Ctrl/Shift/Alt/Win modifiers (with key capture), a media/system key, a fire mode, a macro, CPI up/down/cycle/set/sniper, a profile switch, a Core switch, or *disabled* |
| **Fire modes** | 2-shot and 3-shot bursts, rapid fire while held, with an adjustable click interval |
| **Sensor** | Up to 5 CPI levels with separate X/Y, per-level colours, enable/disable and the active level; sniper CPI; report rate 125/250/500/1000 Hz |
| **Performance** | Light Strike key-response time (from 0.2 ms), debounce on mechanical models, lift-off distance, angle snapping |
| **Lighting** | Off / static / breathing / neon / spectrum / wave / reactive (depending on model), colour, brightness, speed, CPI indicator, live preview |
| **Macros** (Oscar-style) | Recorder for keys, clicks, wheel and pointer-locked movement, with real or fixed delays; a step editor (insert, reorder, edit, loops, merge delays); a movement-pattern drawing tool; checks for unreleased keys and loop balance; a memory-usage meter |
| **On-board memory** | Write any profile to any of the mouse's memory slots, so it works without software on any PC |
| **Profiles** | A local profile library: create, duplicate, delete, and import/export (`.openbloody.json`) |
| **Protocol Lab** | Raw HID console (feature/output/get-feature), traffic log with export, packet-by-packet write preview, an editable protocol definition, and a capture-diff tool for reverse engineering |
| **App** | PWA install and offline use, light/dark/system theme, phone-width layout, and a simulator for trying everything without hardware |

Some BloodyWorkshop items are OS settings rather than firmware settings: Windows pointer speed, acceleration, scroll lines and double-click speed. OpenBloody points you to the OS for those. It doesn't bypass A4Tech's Core 3/4 activation, and it doesn't ship game-specific recoil scripts.

## Requirements

- Desktop **Chrome, Edge or Opera** (WebHID). Firefox and Safari can build profiles and use the simulator, but can't talk to the mouse.
- HTTPS or `localhost`.
- **Linux:** give your user access to the mouse's hidraw node, e.g. `/etc/udev/rules.d/70-openbloody.rules`:
  ```
  SUBSYSTEM=="hidraw", ATTRS{idVendor}=="09da", MODE="0660", TAG+="uaccess"
  ```
  Then `sudo udevadm control --reload && sudo udevadm trigger`, and replug the mouse.

## Development

```bash
npm install
```

```bash
npm run dev        # http://localhost:5173
```

```bash
npm test           # unit tests (protocol, macros, capture parsing, simulator)
```

```bash
npm run build && npm start   # production build served by server.js on :3000
```

## Deploying to Railway

The repo includes `railway.json`. Create a Railway service from this GitHub repo and it will:

1. build with `npm ci && npm run build`
2. start `node server.js`, which listens on `$PORT`
3. health-check `GET /healthz`

Railway serves over HTTPS, which WebHID and the service worker both need. `server.js` has no dependencies. It serves `dist/` with SPA fallback, gzip, immutable caching for hashed assets, `no-cache` for the service worker, and security headers including `Permissions-Policy: hid=(self)`.

## How the protocol layer works

Every firmware command is a text template in a `ProtocolDefinition` (`src/hid/protocol.ts`):

```json
{
  "reportId": 7,
  "reportLength": 63,
  "transport": "feature",
  "checksum": { "type": "none", "index": 62, "from": 0, "to": 61 },
  "commands": {
    "setCpiLevel": "0D {level} {x:u16le} {y:u16le} {enabled} {r} {g} {b}",
    "setReportRate": "10 {rate}",
    "saveToFlash": "5A A5"
  }
}
```

Tokens are literal hex bytes or `{field[:u8|s8|u16le|u16be|bytes]}`. The app turns a profile into an ordered packet list, which you can inspect in **Protocol Lab → Write preview**, and sends it with a configurable delay between packets.

### Helping map the real protocol

1. On Windows, install [USBPcap](https://desowin.org/usbpcap/) and Wireshark, and open BloodyWorkshop.
2. Capture while changing **one** setting (for example CPI 800 → 1600). Then capture again with a different value.
3. Export the HID data, e.g. `tshark -r a.pcapng -Y "usb.idVendor==0x09da || usbhid.data" -T fields -e usbhid.data`.
4. Paste both captures into **Protocol Lab → Capture diff**. The highlighted bytes show where the setting lives.
5. Update the templates in **Protocol definition**, test, set `"verified": true`, and open a PR with the JSON and the models you tested on.

## Project layout

```
src/hid/devices.ts      model database (capabilities per mouse)
src/hid/protocol.ts     template engine, checksum, profile → packets
src/hid/transport.ts    WebHID transport, traffic log
src/hid/simulator.ts    virtual mouse that speaks the draft protocol
src/hid/capture.ts      capture parsing + diff for reverse engineering
src/model/              profile types, keys (HID usages), macro bytecode, storage
src/pages/              UI sections
server.js               Railway / Node production server
```

## Disclaimer

OpenBloody is not affiliated with or endorsed by A4Tech. "Bloody" and "BloodyWorkshop" are trademarks of their respective owners. Writing to device firmware settings is at your own risk.

## License

MIT
