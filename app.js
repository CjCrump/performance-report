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
    const res = await fetch(`/.netlify/functions/psi?url=${encodeURIComponent(normalized)}`);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Request failed: ${res.status}`);
    }

    const data = await res.json();

    // Lighthouse scores
    const lh = data?.lighthouseResult;
    perfScore.textContent = toPercent(lh?.categories?.performance?.score);
    a11yScore.textContent = toPercent(lh?.categories?.accessibility?.score);
    bpScore.textContent = toPercent(lh?.categories?.["best-practices"]?.score);
    seoScore.textContent = toPercent(lh?.categories?.seo?.score);

    // Core Web Vitals (Field)
    const metrics = data?.loadingExperience?.metrics;
    // LCP is in ms (show seconds for readability)
    const lcp = metrics?.LARGEST_CONTENTFUL_PAINT_MS;
    const inp = metrics?.INTERACTION_TO_NEXT_PAINT; // may appear depending on API response
    const cls = metrics?.CUMULATIVE_LAYOUT_SHIFT_SCORE;

    // If INP isn’t present, you might see FID on older data; we’ll handle that gracefully.
    const fid = metrics?.FIRST_INPUT_DELAY_MS;

    lcpEl.textContent = lcp ? formatCwvMetric(lcp, "s") : "—";
    inpEl.textContent = inp ? formatCwvMetric(inp, "ms") : (fid ? formatCwvMetric(fid, "ms") : "—");
    clsEl.textContent = cls ? formatCwvMetric(cls, "raw") : "—";

    // Note to explain missing field data
    if (!metrics) {
      cwvNote.textContent =
        "Field (real-user) data was not available for this URL. Scores above are still useful as a lab audit.";
    } else {
      cwvNote.textContent =
        "Field data availability depends on whether Chrome has enough real-user samples for this page/origin.";
    }

    // Opportunities
    const opps = getTopOpportunities(lh);
    opps.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      oppsList.appendChild(li);
    });

    results.classList.remove("hidden");
    setStatus("✅ Report complete.", "good");
  } catch (err) {
    setStatus(`❌ ${err.message || "Something went wrong. Try again."}`, "bad");
  } finally {
    setLoading(false);
  }
});
