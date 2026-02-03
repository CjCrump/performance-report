/**
 * Netlify Function: PageSpeed Insights proxy
 * Why? So your PSI API key is not exposed in the browser.
 *
 * ENV VAR required in Netlify:
 * - PSI_API_KEY = your Google PageSpeed Insights API key
 */

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");

    if (!target) {
      return new Response(JSON.stringify({ ok: false, error: "Missing ?url=" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Mobile-first audit
    const strategy = "mobile";

    const apiKey = process.env.PSI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Server missing PSI_API_KEY env var"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const endpoint =
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
      `?url=${encodeURIComponent(target)}` +
      `&strategy=${strategy}` +
      `&key=${apiKey}`;

    const psiRes = await fetch(endpoint);
    const data = await psiRes.json();

    if (!psiRes.ok) {
      return new Response(JSON.stringify({
        ok: false,
        error: "PSI request failed",
        details: data
      }), {
        status: psiRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // basic cache to avoid hammering the API if you demo repeatedly
        "Cache-Control": "public, max-age=300"
      },
    });

  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
