const API = "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog";
const slugify = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const xml = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export async function onRequestGet() {
  const base = "https://pakthai-tech-store.pages.dev";
  const fixed = ["/", "/privacy-policy.html", "/terms.html", "/data-deletion.html"];
  let products = [];
  try {
    const response = await fetch(API, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("catalog unavailable");
    const data = await response.json();
    products = Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : [];
  } catch {
    return new Response("Sitemap temporarily unavailable.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains" } });
  }
  const urls = [...fixed.map(path => base + path), ...products.map(p => base + "/products/" + encodeURIComponent(String(p.handle || slugify(p.title) || p.id)))];
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(url => "<url><loc>" + xml(url) + "</loc></url>").join("\n") + "\n</urlset>";
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300", "x-content-type-options": "nosniff", "x-frame-options": "DENY", "referrer-policy": "strict-origin-when-cross-origin", "permissions-policy": "camera=(), microphone=(), geolocation=()", "strict-transport-security": "max-age=31536000; includeSubDomains" } });
}