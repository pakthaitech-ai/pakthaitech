const API = "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const slugify = value => String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export async function onRequestGet({ params }) {
  const slug = String(params?.handle || "");
  let products = [];
  try {
    const response = await fetch(API, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("catalog unavailable");
    const data = await response.json();
    products = Array.isArray(data) ? data : Array.isArray(data.products) ? data.products : [];
  } catch {
    return new Response("Product catalog temporarily unavailable.", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
  const product = products.find(p => String(p.handle || "") === slug || slugify(p.title) === slug || String(p.id) === slug);
  if (!product) return new Response("<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"robots\" content=\"noindex\"><title>Product not found — PakThai Tech</title><body><h1>Product not found</h1><p>This product may have been removed from the live catalog.</p><a href=\"/\">Return to Store</a></body></html>", { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
  const title = String(product.title || "PakThai Tech product");
  const price = Number(product.price_pkr ?? product.price) || 0;
  const available = product.available === true || product.available === 1 || product.available === "1";
  const image = String(product.image_url || product.featured_image || product.images?.[0]?.src || "");
  const id = String(product.id || "");
  const category = String(product.category || product.product_type || "Other");
  const description = String(product.description || product.body_html || "PakThai Tech live catalog product. Final price, availability and delivery are confirmed by our team.").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  const pageTitle = title + " — PakThai Tech";
  const quoteUrl = "/?quote=" + encodeURIComponent(id);
  const body = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(pageTitle)}</title><meta name="description" content="${esc(description)}"><meta property="og:title" content="${esc(pageTitle)}"><meta property="og:description" content="${esc(description)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}<link rel="canonical" href="https://pakthai-tech-store.pages.dev/products/${encodeURIComponent(slug)}"><link rel="stylesheet" href="/product.css"></head><body><main><a href="/" class="brand">PAKTHAI TECH</a><nav><a href="/">Store</a> / <span>${esc(category)}</span></nav><article><div class="photo">${image ? `<img src="${esc(image)}" alt="${esc(title)}">` : "<div>No product image available</div>"}</div><section><p class="category">${esc(category)}</p><h1>${esc(title)}</h1><p class="price">PKR ${price.toLocaleString("en-PK")}</p><p class="stock ${available ? "available" : "unavailable"}">${available ? "Listed as available — confirmation required" : "Availability needs confirmation"}</p><p>${esc(description)}</p><p class="notice">Catalog prices and availability are references only. PakThai Tech must confirm final price, stock, shipping and delivery.</p><a class="button" href="${quoteUrl}">Request Quote</a> <a class="secondary" href="/">Browse all products</a></section></article><footer>© 2026 PakThai Tech · <a href="/privacy-policy.html">Privacy</a> · <a href="/terms.html">Terms</a></footer></main></body></html>`;
  return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60, stale-while-revalidate=300", "x-content-type-options": "nosniff" } });
}