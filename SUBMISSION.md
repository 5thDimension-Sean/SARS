# Tango: NASA Space Apps 2026 submission plan

Derived from the official *Project Submission Guide* and *Judging & Awards Guide* (both dated Nov 13, 2026).
**Submission closes Sunday, Nov 15 at 11:59 p.m. local time of your Local Event.** Only the last saved submission is judged.

## Must-do before "Submit for Judging" (otherwise ineligible)
- [ ] Every teammate is registered for the same Local Event, is not waitlisted, and is on the team's Members tab (max 6).
- [ ] All required fields completed, all in English.
- [ ] **Demo**: a video of 30 seconds or less (English subtitles if not spoken in English) **or** a slide deck of at most 7 slides (including title and intro). Host it on YouTube, Google Drive, GitHub, etc. with a public link that needs no login. Going over either limit makes the project ineligible for global judging.
- [ ] **Link to final project**: the public GitHub Pages URL, which should load without sign-in. Test it in a private window. Optional but recommended: request a FortiGuard Web Filter Classification so judges' networks do not block it.
- [ ] **NASA data** field (needed for any Global Award): name at least one NASA resource. See "Text to paste" below.
- [ ] **References** field: every external data source, code library, text and image, even open-source ones.
- [ ] Tick both boxes: terms and conditions, and "all work is original".
- [ ] No images, video, audio or likeness of anyone under 18 in the demo or project. **Check the `feature/roger-team-photo` branch and any team photo before submitting.**
- [ ] Press **Submit for Judging**, confirm the banner, and re-check the saved version.

## Rules that affect the app itself
- **No NASA branding.** Generated content may not use or modify NASA logos, flags or mission identifiers, so the site carries no Space Apps or NASA logo. The footer says it is not affiliated with NASA.
- **Super Intelligence (AI) disclosure.** Say where and how AI was used. Images and videos made by AI need a visible watermark (this site has none). Code and data need acknowledgement in descriptive text and metadata: the footer and the page metadata already state it.
- Use at least one NASA data set. Using data from a Space Agency Partner is encouraged. NISAR is a NASA and ISRO (Indian Space Research Organisation) mission, and ISRO is a 2026 partner.

## How Tango maps to the five judging criteria (each scored 1 to 5)
| Criterion | Evidence in the app |
| --- | --- |
| Impact | Teaches how to read radar and why a change is not a cause, for a general audience. |
| Creativity | A scroll-driven golden-record globe journey; blended change areas; compare-your-own-images tool. |
| Validity | Real NISAR GCOV previews, native-grid comparison, visible QA status, no invented numbers; unit tests for the maths. |
| Relevance | NISAR L-band HH/HV from NASA ASF DAAC is the core of every investigation. |
| Presentation | The demo (30 s or 7 slides) carries this score. Spend the remaining time here. |

## What Tango does with the data
Tango takes each place's real NISAR numbers and turns them into one **printable evidence report**: dates, granules, per-polarization statistics, exploratory regions, every quality check (failed and unverified ones included) and the limits. Open a place, press *Download evidence report*. Any place that has data gets a report; the page makes no claims beyond them.

## 30-second demo script (from the guide's timeline)
- 0:00 Name and team name.
- 0:02 The challenge and what inspired it.
- 0:05 Project title and tagline: "Tango: Our Golden Record, written in radar."
- 0:10 Show scrolling the globe to a place, the before/after slider, and the changed areas. Mention NASA–ISRO NISAR data.
- 0:20 Close on what it could become: a way for anyone to read the planet's changes.

## Text to paste
**High-level summary:** Tango is an educational web app that turns NASA-ISRO NISAR radar into a guided journey. Scroll a globe to places around the world, compare two real radar dates with a before/after slider, and see where backscatter changed, with each limit shown honestly.

**NASA data:** NISAR L2 GCOV provisional product (HH and HV backscatter), NISAR_L2_GCOV_PROVISIONAL_V1, distributed by the NASA ASF DAAC (DOI 10.5067/NIL2GCOV-P1); NASA Earth Observatory published NISAR imagery for Hubbard Glacier; NASA GIBS Blue Marble imagery; Natural Earth II (bundled with CesiumJS).

**References:** CesiumJS, MapLibre GL JS, Next.js, React; Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2020); per-scene credits are shown beside each image in the app.

**AI use:** AI assistance was used to write interface code and tests. No AI-generated imagery or video is used. The overview on the Upload page is rule-based, not an AI model.

## Still open
- Higher-resolution globe tiles (NASA GIBS and Sentinel-2 cloudless) could not be tested from the build sandbox. Open the live site and confirm the globe sharpens when it lands on a place.
- The GitHub Pages build now carries about 100 MB of research images. Confirm it deploys and loads quickly.
