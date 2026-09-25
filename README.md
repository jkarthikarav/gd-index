# Palette Index

A GitHub Pages site that reads every image in `assets/library`, extracts each
one's top 5 dominant colors, and lets a visitor click a color histogram to
surface the designs built around that color.

## How it works

1. You drop image files into `assets/library`.
2. On push, a GitHub Action (`.github/workflows/update-library.yml`) runs
   `scripts/extract-colors.js`, which uses [sharp](https://sharp.pixelplumbing.com/)
   and a small k-means implementation to pull the 5 dominant colors out of
   each image.
3. The Action writes the results to `library.json` and commits it back to
   the repo automatically.
4. `index.html` / `script.js` fetch `library.json` at page load, build a
   hue histogram from every color across your whole library, and re-render
   the mosaic grid based on where you click.

You never edit `library.json` by hand — it's regenerated every time.

## First-time setup

1. Push this repo to GitHub.
2. In **Settings → Pages**, set the source to deploy from the `main`
   branch (root).
3. In **Settings → Actions → General**, under "Workflow permissions",
   make sure **"Read and write permissions"** is selected — the Action
   needs this to commit `library.json` back to the repo.
4. Drop a few images into `assets/library` and push. Check the **Actions**
   tab to watch it regenerate `library.json`.

If your default branch isn't `main`, update the `branches:` line in
`.github/workflows/update-library.yml` to match.

## Local development

```bash
npm install
npm run generate   # regenerates library.json from assets/library
```

Then just open `index.html` in a browser, or serve the folder with any
static server (e.g. `npx serve`).

## Adjusting things

- **Number of colors per image** — change `K` in `scripts/extract-colors.js`.
- **Histogram resolution** — change `BUCKET_COUNT` in `script.js` (currently
  72 buckets, 5° each).
- **How aggressively clicking filters the mosaic** — change
  `MATCH_THRESHOLD_STEPS` in `script.js`. Smaller numbers = stricter matches.
- **Supported image formats** — edit `VALID_EXTENSIONS` in
  `scripts/extract-colors.js`.

## File structure

```
index.html                        page structure
style.css                         all styling
script.js                         histogram render, click handling, mosaic render
library.json                      auto-generated — do not edit by hand
assets/library/                   drop your design images here
scripts/extract-colors.js         color extraction (k-means over image pixels)
package.json / package-lock.json  dependency (sharp) for the extraction script
.github/workflows/update-library.yml   the automation
```
