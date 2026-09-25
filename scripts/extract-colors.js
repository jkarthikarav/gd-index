// Scans /assets/library for images, extracts the top 5 dominant colors from
// each one via k-means clustering, and writes the result to library.json.
//
// Run manually with: npm run generate
// Runs automatically via .github/workflows/update-library.yml on push.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const LIBRARY_DIR = path.join(__dirname, '..', 'assets', 'library');
const OUTPUT_PATH = path.join(__dirname, '..', 'library.json');
const K = 5; // number of dominant colors to extract per image
const SAMPLE_SIZE = 120; // resize images down to this max dimension before clustering
const VALID_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

function titleFromFilename(filename) {
  const base = filename.replace(path.extname(filename), '');
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function rgbToHex(r, g, b) {
  const toHex = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function distanceSq(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

// Basic k-means++ style init + Lloyd's algorithm, run on raw RGB pixels.
function kMeans(pixels, k, maxIterations = 12) {
  if (pixels.length === 0) return [];
  if (pixels.length <= k) {
    return pixels.map((p) => ({ centroid: p, count: 1 }));
  }

  // k-means++ initialization for more stable clusters than pure random picks
  const centroids = [pixels[Math.floor(Math.random() * pixels.length)]];
  while (centroids.length < k) {
    const distances = pixels.map((p) =>
      Math.min(...centroids.map((c) => distanceSq(p, c)))
    );
    const sum = distances.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let chosen = pixels[0];
    for (let i = 0; i < pixels.length; i++) {
      r -= distances[i];
      if (r <= 0) { chosen = pixels[i]; break; }
    }
    centroids.push(chosen);
  }

  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    for (let i = 0; i < pixels.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = distanceSq(pixels[i], centroids[c]);
        if (d < bestDist) { bestDist = d; best = c; }
      }
      if (assignments[i] !== best) changed = true;
      assignments[i] = best;
    }

    const sums = centroids.map(() => [0, 0, 0, 0]); // r, g, b, count
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      sums[c][3] += 1;
    }

    for (let c = 0; c < centroids.length; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [
          sums[c][0] / sums[c][3],
          sums[c][1] / sums[c][3],
          sums[c][2] / sums[c][3],
        ];
      }
    }

    if (!changed) break;
  }

  const counts = new Array(centroids.length).fill(0);
  assignments.forEach((c) => counts[c]++);

  return centroids.map((centroid, i) => ({ centroid, count: counts[i] }));
}

async function extractColors(filePath) {
  const { data, info } = await sharp(filePath)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = [];
  for (let i = 0; i < data.length; i += info.channels) {
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  const clusters = kMeans(pixels, K);
  clusters.sort((a, b) => b.count - a.count);

  return clusters
    .filter((c) => c.count > 0)
    .map((c) => rgbToHex(c.centroid[0], c.centroid[1], c.centroid[2]));
}

async function main() {
  if (!fs.existsSync(LIBRARY_DIR)) {
    console.warn(`No directory found at ${LIBRARY_DIR}. Writing empty library.json.`);
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2));
    return;
  }

  const files = fs.readdirSync(LIBRARY_DIR)
    .filter((f) => VALID_EXTENSIONS.has(path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.warn('No image files found in assets/library. Writing empty library.json.');
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify([], null, 2));
    return;
  }

  const results = [];

  for (const file of files) {
    const fullPath = path.join(LIBRARY_DIR, file);
    try {
      console.log(`Processing ${file}...`);
      const colors = await extractColors(fullPath);
      results.push({
        file,
        title: titleFromFilename(file),
        colors,
      });
    } catch (err) {
      console.error(`Failed to process ${file}:`, err.message);
    }
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));
  console.log(`Wrote ${results.length} entries to library.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
