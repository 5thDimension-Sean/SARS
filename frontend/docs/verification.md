# Frontend verification

Frontend only; Python pipeline work requires user approval after this checkpoint.

## Automated checks

- `npm test`: four passing tests cover pure sample attribution/finite values/null imagery URLs, date ordering and a deliberate 24-day gap, comparable normalized histograms, and common-reference displacement with matching peak metrics.
- `npm run build`: Next.js production build and TypeScript validation; statically exports `/` and the not-found page to `out/` with exit code 0.
- Generated static preview returns HTTP 200 at http://127.0.0.1:5173/.

## Browser checks

Verified in the running preview and repeated against the production export where relevant:

| Area | Result |
| --- | --- |
| Phenomena | All three update textures, labels, metrics, chart units, explanation, and events. |
| Hotspots/search | Geographic aliases jump to matching locations. Amazon selects Forest frontier A; unknown search shows no-result feedback. Hotspot B changes coordinates and samples. |
| Timeline keys | Home → July 3; Right → July 15; Left → July 3; End → September 25. Slider keys step discrete acquisitions. Typing/menus do not trigger global shortcuts. |
| Playback | Restarts from the first acquisition when playing at the end, advances dates, pauses at the last date, and supports 2× selection. Manual date selection stops playback. |
| Baseline | August 8 selection changes comparison labels, chart dates, interval, and the sample difference metric. |
| Layers/swipe | Switches change named layers. Swipe keys change its accessible value and clip boundary. Layer-off state is labeled. |
| Map controls | Zoom changes surface scale and illustrative distance. Recenter resets zoom/swipe. Expanded view traps focus; Escape dismisses and restores focus. |
| Analysis | HH/HV changes chart/active label. Displacement/phase changes earthquake imagery and colorbar units. Acquisition tab follows the selected pass. |
| Responsive | 1440×900 desktop, 1100×800 intermediate, and 390×844 mobile checked without horizontal overflow. Sample identity persists; mobile overlays preserve access to viewport/timeline. |
| Mobile keyboard | Layers traps focus. Selecting a phenomenon closes it and restores focus. Analysis opens, scrolls, and dismisses with Escape. |
| Accessibility | Named icon buttons, visible focus rings, NOMINAL/WARN/ALERT text with colors, and descriptive slider labels/value text. |
| Metadata | Route title/description, Open Graph, Twitter fields, custom favicon, and mobile viewport tag. |
| Structured tools | Bounded read/select tools register. Valid W-02 selection updates visible state; invalid hotspot fails without corrupting state. |

Reduced-motion media rules were inspected in the running preview: animation/transitions stop on all elements and pseudo-elements, and charts disable animation. The browser's current motion preference is normal. Available preview controls cannot emulate reduced-motion system preferences, so the preference transition was not exercised live.

The initial experimental preview framework hit a Windows shutdown assertion. The app now uses Next.js static export, which builds successfully; the final preview serves the generated static app.
