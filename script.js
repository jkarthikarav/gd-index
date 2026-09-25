// ---------- Color helpers ----------

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = 0; s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      default: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hexToHue(hex) {
  return rgbToHsl(hexToRgb(hex)).h;
}

// shortest distance between two angles on a 0-360 circle
function circularDistance(a, b) {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function hueToDisplayColor(hue) {
  return `hsl(${hue}, 65%, 55%)`;
}

// ---------- State ----------

const BUCKET_COUNT = 72; // 5 degrees per bucket
const BUCKET_SIZE = 360 / BUCKET_COUNT;
const MATCH_THRESHOLD_STEPS = [25, 45, 70, 360]; // widen until we have enough matches

let library = [];
let activeBucketIndex = null;

// ---------- DOM refs ----------

const histogramEl = document.getElementById('histogram');
const mosaicEl = document.getElementById('mosaic');
const statusEl = document.getElementById('mosaic-status');
const resetBtn = document.getElementById('reset-btn');
const emptyStateEl = document.getElementById('empty-state');

// ---------- Load data ----------

async function loadLibrary() {
  try {
    const res = await fetch('library.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('library.json not found');
    const data = await res.json();
    library = Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn('Could not load library.json', err);
    library = [];
  }

  if (library.length === 0) {
    emptyStateEl.hidden = false;
    document.querySelector('.histogram-wrap').style.opacity = 0.3;
    document.querySelector('.mosaic-wrap').style.opacity = 0.3;
    return;
  }

  buildHistogram();
  renderMosaic(library);
}

// ---------- Histogram ----------

function buildHistogram() {
  const buckets = new Array(BUCKET_COUNT).fill(0);

  library.forEach((design) => {
    (design.colors || []).forEach((hex) => {
      const hue = hexToHue(hex);
      const idx = Math.min(BUCKET_COUNT - 1, Math.floor(hue / BUCKET_SIZE));
      buckets[idx] += 1;
    });
  });

  const maxCount = Math.max(1, ...buckets);

  histogramEl.innerHTML = '';

  const marker = document.createElement('div');
  marker.className = 'click-marker';
  marker.id = 'click-marker';
  histogramEl.appendChild(marker);

  buckets.forEach((count, i) => {
    const bar = document.createElement('div');
    bar.className = 'histogram-bar';
    bar.dataset.bucketIndex = i;

    const bucketHue = (i + 0.5) * BUCKET_SIZE;
    const heightPct = count === 0 ? 2 : 6 + (count / maxCount) * 94;

    bar.style.height = `${heightPct}%`;
    bar.style.background = hueToDisplayColor(bucketHue);
    bar.title = `${Math.round(bucketHue)}° — ${count} color${count === 1 ? '' : 's'}`;

    bar.addEventListener('click', () => handleBucketClick(i));

    histogramEl.appendChild(bar);
  });
}

function handleBucketClick(bucketIndex) {
  activeBucketIndex = bucketIndex;
  const clickedHue = (bucketIndex + 0.5) * BUCKET_SIZE;

  document.querySelectorAll('.histogram-bar').forEach((bar) => {
    bar.classList.toggle('is-active', Number(bar.dataset.bucketIndex) === bucketIndex);
  });

  const marker = document.getElementById('click-marker');
  const pct = ((bucketIndex + 0.5) / BUCKET_COUNT) * 100;
  marker.style.left = `${pct}%`;
  marker.classList.add('is-visible');

  filterMosaicByHue(clickedHue);
  resetBtn.hidden = false;
}

// ---------- Mosaic ----------

function designMinDistance(design, targetHue) {
  const colors = design.colors || [];
  if (colors.length === 0) return Infinity;
  return Math.min(...colors.map((hex) => circularDistance(hexToHue(hex), targetHue)));
}

function filterMosaicByHue(targetHue) {
  const withDistance = library.map((design) => ({
    design,
    distance: designMinDistance(design, targetHue),
  }));

  let threshold = MATCH_THRESHOLD_STEPS[0];
  let matches = [];

  for (const step of MATCH_THRESHOLD_STEPS) {
    threshold = step;
    matches = withDistance.filter((d) => d.distance <= step);
    if (matches.length >= 3 || step === MATCH_THRESHOLD_STEPS[MATCH_THRESHOLD_STEPS.length - 1]) {
      break;
    }
  }

  matches.sort((a, b) => a.distance - b.distance);

  const sorted = matches.map((m) => m.design);
  renderMosaic(sorted);

  statusEl.textContent = sorted.length === library.length
    ? `Showing all ${sorted.length} designs, closest match first.`
    : `Showing ${sorted.length} design${sorted.length === 1 ? '' : 's'} near ${Math.round(targetHue)}°.`;
}

function renderMosaic(designs) {
  mosaicEl.innerHTML = '';

  designs.forEach((design) => {
    const item = document.createElement('div');
    item.className = 'mosaic-item';

    const img = document.createElement('img');
    img.src = `assets/library/${design.file}`;
    img.alt = design.title || design.file;
    img.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const title = document.createElement('p');
    title.className = 'title';
    title.textContent = design.title || design.file;

    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    (design.colors || []).forEach((hex) => {
      const dot = document.createElement('span');
      dot.className = 'swatch';
      dot.style.background = hex;
      dot.title = hex;
      swatches.appendChild(dot);
    });

    meta.appendChild(title);
    meta.appendChild(swatches);
    item.appendChild(img);
    item.appendChild(meta);
    mosaicEl.appendChild(item);
  });
}

// ---------- Reset ----------

resetBtn.addEventListener('click', () => {
  activeBucketIndex = null;
  document.querySelectorAll('.histogram-bar').forEach((bar) => bar.classList.remove('is-active'));
  document.getElementById('click-marker').classList.remove('is-visible');
  renderMosaic(library);
  statusEl.textContent = 'Showing all designs.';
  resetBtn.hidden = true;
});

// ---------- Init ----------

loadLibrary();
