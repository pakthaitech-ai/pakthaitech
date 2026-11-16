export async function onRequestGet() {
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=60, stale-while-revalidate=300',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'strict-transport-security': 'max-age=31536000; includeSubDomains'
  };
  try {
    const r = await fetch('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog', {
      headers: { accept: 'application/json' }
    });
    if (!r.ok) {
      return new Response(JSON.stringify({ products: [], error: 'Catalog temporarily unavailable' }), {
        status: 503,
        headers: { ...headers, 'cache-control': 'no-store', 'retry-after': '60' }
      });
    }
    const data = await r.json();
    const rows = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
    const products = rows.map(p => {
      const image = p.image_url ? String(p.image_url).startsWith('//') ? 'https:' + p.image_url : String(p.image_url) : '';
      const available = p.available === true || p.available === 1 || p.available === '1';
      const price = Number(p.price_pkr) || 0;
      return {
        id: String(p.id),
        title: String(p.title || 'Product'),
        product_type: String(p.category || 'Other'),
        vendor: 'PakThai Tech',
        price,
        available,
        variants: [{ price, available }],
        images: image ? [{ src: image }] : [],
        featured_image: image,
        body_html: 'PakThai Tech live catalog product.',
        tags: [String(p.category || 'Other')]
      };
    });
    return new Response(JSON.stringify({ products }), { headers });
  } catch (_) {
    return new Response(JSON.stringify({ products: [], error: 'Catalog temporarily unavailable' }), {
      status: 503,
      headers: { ...headers, 'cache-control': 'no-store', 'retry-after': '60' }
    });
  }
}
