/**
 * Landing Page Performance Report (MVP)
 * - Calls a Netlify function to run PSI/Lighthouse
 * - Displays scores + Core Web Vitals + top opportunities
 */

const form = document.getElementById("report-form");
const urlInput = document.getElementById("url");
const runBtn = document.getElementById("run-btn");
const statusEl = document.getElementById("status");

const results = document.getElementById("results");

// score boxes
const perfScore = document.getElementById("perfScore");
const a11yScore = document.getElementById("a11yScore");
const bpScore = document.getElementById("bpScore");
const seoScore = document.getElementById("seoScore");

// CWV
const lcpEl = document.getElementById("lcp");
const inpEl = document.getElementById("inp");
const clsEl = document.getElementById("cls");
const cwvNote = document.getElementById("cwvNote");

// opportunities
const oppsList = document.getElementById("oppsList");

// ======================
// MODE SWITCH
// demo = uses mock data (GitHub Pages friendly)
// live = calls a backend endpoint (we’ll add later)
// ======================
const MODE = "demo"; // change to "live" later
const LIVE_ENDPOINT = ""; // set later (ex: https://your-worker.../psi)

/** Basic URL sanity check */
function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // If user forgot https://, add it
  const withScheme = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;

  try {
    const u = new URL(withScheme);
    return u.toString();
  } catch {
    return null;
  }
}

/** Convert PSI/Lighthouse score (0-1) -> percent */
function toPercent(score01) {
  if (typeof score01 !== "number") return "—";
  return Math.round(score01 * 100).toString();
}

/** Some CWV data comes as distributions/percentiles depending on endpoint.
 * We'll display percentiles when present.
 */
function formatCwvMetric(metricObj, unit = "ms") {
  if (!metricObj) return "—";

  // PSI loadingExperience.metrics often has percentile + distributions
  if (typeof metricObj.percentile === "number") {
    if (unit === "ms") return `${metricObj.percentile} ms`;
    if (unit === "s") return `${(metricObj.percentile / 1000).toFixed(1)} s`;
    return `${metricObj.percentile}`;
  }

  return "—";
}

/** Build top opportunities list from Lighthouse audits */
function getTopOpportunities(lighthouseResult) {
  // audits often contain many items; grab a few high-signal ones
  const keys = [
    "largest-contentful-paint",
    "render-blocking-resources",
    "unused-javascript",
    "unused-css-rules",
    "uses-responsive-images",
    "offscreen-images",
    "uses-text-compression"
  ];

  const audits = lighthouseResult?.audits || {};
  const items = [];

  keys.forEach((k) => {
    const audit = audits[k];
    if (!audit) return;

    // Only show if it’s not already “good”
    // score can be null sometimes; treat null as “unknown”
    if (typeof audit.score === "number" && audit.score >= 0.9) return;

    const title = audit.title || k;
    items.push(title);
  });

  // fallback: if nothing matched, show a generic line
  if (items.length === 0) {
    return ["No major opportunities detected (or audit data was limited)."];
  }

  return items.slice(0, 5);
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status ${type || ""}`.trim();
}

function setLoading(isLoading) {
  runBtn.disabled = isLoading;
  runBtn.textContent = isLoading ? "Running..." : "Run Report";
}

/** Main submit */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  results.classList.add("hidden");
  oppsList.innerHTML = "";

  const normalized = normalizeUrl(urlInput.value);
  if (!normalized) {
    setStatus("❌ Please enter a valid URL (example: https://example.com).", "bad");
    return;
  }

  setLoading(true);
  setStatus("Running mobile Lighthouse audit…", "");

    try {
    let data;

    if (MODE === "demo") {
      // Simulate a real network call (feels legit in demos)
      await new Promise((r) => setTimeout(r, 800));
      data = getMockPsiResponse(normalized);
      setStatus("✅ Demo report complete (mock data).", "good");
    } else {
      if (!LIVE_ENDPOINT) {
        throw new Error("Live mode is not configured yet.");
      }

      setStatus("Running live mobile Lighthouse audit…", "");
      const res = await fetch(`${LIVE_ENDPOINT}?url=${encodeURIComponent(normalized)}`);

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `Request failed: ${res.status}`);
      }

      data = await res.json();
      setStatus("✅ Live report complete.", "good");
    }

    // ======================
    // Render results (same for demo + live)
    // ======================

    const lh = data?.lighthouseResult;
    perfScore.textContent = toPercent(lh?.categories?.performance?.score);
    a11yScore.textContent = toPercent(lh?.categories?.accessibility?.score);
    bpScore.textContent = toPercent(lh?.categories?.["best-practices"]?.score);
    seoScore.textContent = toPercent(lh?.categories?.seo?.score);

    // Core Web Vitals (Field-style object)
    const metrics = data?.loadingExperience?.metrics;

    const lcp = metrics?.LARGEST_CONTENTFUL_PAINT_MS;
    const inp = metrics?.INTERACTION_TO_NEXT_PAINT;
    const cls = metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE;

    lcpEl.textContent = lcp ? formatCwvMetric(lcp, "s") : "—";
    inpEl.textContent = inp ? formatCwvMetric(inp, "ms") : "—";
    clsEl.textContent = cls ? formatCwvMetric(cls, "raw") : "—";

    if (!metrics) {
      cwvNote.textContent =
        "Field (real-user) data was not available for this URL. Scores above are still useful as a lab audit.";
    } else if (MODE === "demo") {
      cwvNote.textContent =
        "Demo mode: values shown are realistic mock data to preview the report layout.";
    } else {
      cwvNote.textContent =
        "Field data availability depends on whether Chrome has enough real-user samples for this page/origin.";
    }

    // Opportunities
    const opps = getTopOpportunities(lh);
    oppsList.innerHTML = "";
    opps.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      oppsList.appendChild(li);
    });

    results.classList.remove("hidden");
  } catch (err) {
  // Prevent raw HTML (like 404 pages) from showing in the UI
  const raw = String(err?.message || "Something went wrong. Try again.");

  const safe = raw
    .replace(/<[^>]*>/g, "")     // strip HTML tags
    .replace(/\s+/g, " ")        // collapse whitespace
    .trim()
    .slice(0, 220);              // keep it short for UX

  setStatus(`❌ ${safe}`, "bad");
}
finally {
    setLoading(false);
  }
});

// ======================
// Demo Mode: Mock PSI/Lighthouse response
// ======================
function getMockPsiResponse(url) {
  // Slightly vary scores based on URL length so it doesn’t feel “static”
  const seed = Math.min(20, url.length % 20);

  const clamp01 = (n) => Math.max(0, Math.min(1, n));
  const score01 = (base) => clamp01((base + seed / 100));

  return {
    lighthouseResult: {
      categories: {
        performance: { score: score01(0.72) },      // ~72-92
        accessibility: { score: score01(0.88) },    // ~88-100
        "best-practices": { score: score01(0.86) }, // ~86-100
        seo: { score: score01(0.84) },              // ~84-100
      },
      audits: {
        "largest-contentful-paint": { score: 0.55, title: "Improve Largest Contentful Paint" },
        "render-blocking-resources": { score: 0.65, title: "Eliminate render-blocking resources" },
        "unused-javascript": { score: 0.7, title: "Reduce unused JavaScript" },
        "unused-css-rules": { score: 0.75, title: "Reduce unused CSS" },
        "offscreen-images": { score: 0.8, title: "Defer offscreen images" },
        "uses-text-compression": { score: 0.85, title: "Enable text compression" }
      }
    },

    // Field-style metrics shape that matches your renderer
    loadingExperience: {
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2500 },  // 2.5s
        INTERACTION_TO_NEXT_PAINT: { percentile: 190 },     // 190ms
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 8 }    // interpret as 0.08 in copy later if desired
      }
    }
  };
}

