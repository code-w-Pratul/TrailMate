# Screenshot and Demo Capture Guide

This directory contains the capture plan for TrailMate’s documentation. **No PNG, WebP, or GIF assets are currently committed.** Do not add a README image reference until the corresponding file exists and renders correctly on the repository host.

## Planned assets

| Filename | Route | Capture goal |
| --- | --- | --- |
| `landing.png` | `/` | Editorial hero, destination planner, and responsive visual system. |
| `dashboard.png` | `/plan?city=Kyoto&days=5` | Destination hero, weather, map, places, currency, and budget hierarchy. |
| `packing.png` | `/plan?city=Reykjavik&days=6` | Packing recommendations with their reason text. |
| `multi-city.png` | `/multi-city` | At least three resolved stops and the estimated travel legs. |
| `trips.png` | `/trips` | Authenticated saved-trip collection. |
| `share.png` | `/share/<token>` | Public read-only snapshot with no owner information. |
| `dark-mode.png` | Any representative route | The dark editorial palette and visible focus treatment. |
| `degraded.png` | Any dashboard with one failed section | Inline section failure and retry without hiding successful cards. |
| `mobile.png` | `/` or `/plan?...` | Mobile navigation and single-column content flow. |
| `demo.gif` | Several routes | Short search → plan → save → share walkthrough. |

## Start a capture session

Install dependencies and start the application:

```powershell
npm install
npm run dev
```

The development URLs are:

- client: <http://localhost:5173>
- API health: <http://localhost:5000/api/health>

For authenticated captures, start MongoDB and seed the demo account:

```powershell
npm run seed
```

Credentials:

```text
demo@trailmate.dev
trailmate123
```

The seed is idempotent. It creates or reuses the account, builds any missing demo trips through the real planning pipeline, and shares the first newly created trip. Copy the emitted `/share/<token>` path for `share.png`.

## Recommended capture settings

- Desktop viewport: approximately **1440 × 1000**.
- Mobile viewport: **390 × 844** or a comparable modern phone size.
- Browser zoom: **100%**.
- Capture format: PNG for static images; optimise only after confirming text remains sharp.
- Wait for loading indicators to finish unless the asset intentionally documents a loading state.
- Keep browser extensions, bookmarks, notifications, and personal account data out of frame.
- Use the same destination and home currency across related images so the story is coherent.
- Re-check provider attribution before cropping; do not remove map, place, or photo credits.

## Suggested sequence

1. Open `/` and capture the light-theme landing page.
2. Build `/plan?city=Kyoto&days=5` and wait for the core cards and climate section.
3. Select a place so the list and map visibly correspond.
4. Toggle dark mode and capture the same route.
5. Build a Reykjavik plan and capture the weather-derived packing reasons.
6. Create a three-stop multi-city route, open a stop, and verify Previous/Next/Back-to-itinerary before capturing.
7. Sign in, save a trip, and capture `/trips` plus one detail page.
8. Enable sharing and open the public link in a private window to prove it needs no account.
9. Capture mobile navigation and one narrow dashboard layout.

## Capturing degraded behavior

TrailMate intentionally uses fallback providers and stale cache entries, so an invalid optional key may still produce a successful card. There is no committed “force failure” development switch.

Only capture `degraded.png` when you can reproduce the state safely in a local environment—for example, with a temporary local-only test fixture or controlled provider outage. Do not:

- commit invalid real credentials;
- block provider domains system-wide;
- weaken fallback behavior solely for a screenshot; or
- claim the state was reproduced if it was manually edited in browser developer tools.

If a deterministic failure cannot be produced safely, omit the asset and demonstrate resilience through the server tests and section-error code instead.

## Recording `demo.gif`

Suitable tools include:

- Windows: [ScreenToGif](https://www.screentogif.com/)
- macOS: [Kap](https://getkap.co/)
- Linux: [Peek](https://github.com/phw/peek)

Keep the recording around 30–60 seconds and preferably below 8 MB. A concise flow is:

```text
search → dashboard → select a map place → switch theme → save → share
```

Pause briefly after each action so viewers can follow the state change. Remove dead time, cursor wandering, and any visible credentials.

## Before referencing an asset

For every added file:

1. Confirm the filename and case exactly match its Markdown reference.
2. Open the rendered repository page and verify the image loads.
3. Check that text is legible at the displayed width.
4. Verify that no private data, secret, token, or browser notification is visible.
5. Confirm required provider attribution is still present.
6. Add meaningful alt text that explains the UI state rather than repeating the filename.
