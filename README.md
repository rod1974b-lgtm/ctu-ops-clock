# CTU Ops Clock

Build a 24 TV Show-themed CTU (Counter Terrorist Unit) operational timer and multi-alarm web application, starting with the core clock and timer screen.

Requirements:
- Core authentic CTU aesthetic: Pure obsidian black background, amber digital LED segmented readouts (#FFCC00), tactical grid lines, split-screen panels, and monospace CTU telemetry.
- Core Digital Clock: Live local mission time (toggleable 12h/24h) with authentic blinking colon separators, alongside synchronized Zulu / UTC time counter in the header.
- Primary Timer & Alarm Engine:
  - Support setting and running multiple timers and fixed-time daily alarms throughout the day.
  - Dynamic focal display: Automatically features the closest expiring timer/alarm on the primary center viewport, with a manual pin option to lock any selected timer to the main stage.
  - Full mission controls: Start, Pause, Reset, Snooze, and Stop/Disarm.
  - Drift-free background execution using timestamp delta tracking (Date.now()) and Web Worker timing so alarms never lose sync when the browser tab is minimized.
- Three-Tier Audio Progression:
  - Tier 1 (Normal Operation): Steady rhythmic digital clock tick and ambient bullpen sound during active timing.
  - Tier 2 (Urgent Countdown): Signature haunting 24 countdown clock sound during the final countdown window (configurable: last 60s, 30s, or 10s).
  - Tier 3 (Crisis Fired): Primary battle theme (24 theme 2) loops at zero until disarmed or snoozed, triggering the crisis alert state.
  - Web Audio synthesized CTU bullpen phone ringtone as an optional alert tone.
  - Independent volume bus sliders for ambient tick, countdown tick, alarm theme, and media.
  - Subtle audio confirmation chirps when arming, pinning, or disarming.
- Threat Con Color States & Split Screen:
  - Threat Con 4 / Watch: Amber (#FFCC00)
  - Threat Con 2 / Heightened (<5m left): Tactical Orange (#FF7700)
  - Threat Con 1 / Code Red (Fired): Flashing Crimson (#FF1A1A) with hazard perimeter strobes
  - Stealth / Night Ops toggle: Phosphor Green / Cyan palette
  - Split-screen surveillance quadrants prepared for watercolor feeds and intro/outro video sequences.
- Quick-Arm Tactical Presets:
  - Preset chips: Tactical Sprint (25 min), Interrogation (15 min), Satellite Pass (45 min), Field Stand-Down (5 min), and custom saved presets.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b85ecac9-d5b9-4f53-8195-64cf759b31c5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
