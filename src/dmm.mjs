// DMM Webサービス API v3 (ItemList) クライアント
const ENDPOINT = 'https://api.dmm.com/affiliate/v3/ItemList';

const toInt = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
};
const names = (arr) => (Array.isArray(arr) ? arr.filter((x) => x && x.name) : []);

export function normalize(raw) {
  const info = raw.iteminfo || {};
  const price = toInt(raw.prices?.price);
  const listPrice = toInt(raw.prices?.list_price);
  const off = price && listPrice && listPrice > price ? Math.round((1 - price / listPrice) * 100) : 0;
  const samples = raw.sampleImageURL?.sample_l?.image || raw.sampleImageURL?.sample_s?.image || [];
  return {
    id: String(raw.content_id || raw.product_id),
    title: raw.title || '',
    url: raw.affiliateURL || raw.URL,
    image: raw.imageURL?.large || raw.imageURL?.list || raw.imageURL?.small || '',
    thumb: raw.imageURL?.list || raw.imageURL?.large || raw.imageURL?.small || '',
    samples: Array.isArray(samples) ? samples.slice(0, 8) : [],
    priceText: raw.prices?.price ? String(raw.prices.price) : '',
    price,
    listPrice,
    off,
    date: (raw.date || '').slice(0, 10),
    volume: raw.volume || '',
    genres: names(info.genre).map((g) => ({ id: String(g.id), name: g.name })),
    makers: names(info.maker).map((m) => m.name),
    authors: names(info.author).map((a) => a.name),
    series: names(info.series).map((s) => s.name),
    review: raw.review?.count ? { count: toInt(raw.review.count), average: Number(raw.review.average) } : null,
  };
}

export async function fetchItems({ apiId, affiliateId, service, floor, sort, hits = 100, offset = 1 }) {
  const qs = new URLSearchParams({
    api_id: apiId,
    affiliate_id: affiliateId,
    site: 'FANZA',
    service,
    floor,
    hits: String(hits),
    offset: String(offset),
    sort,
    output: 'json',
  });
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?${qs}`, { signal: AbortSignal.timeout(30000) });
      const json = await res.json();
      const result = json.result || {};
      if (Number(result.status) !== 200) {
        // 400系はリトライしても無駄なので即終了
        const err = new Error(`${result.status} ${result.message || ''} ${JSON.stringify(result.errors || {})}`);
        if (Number(result.status) < 500) throw Object.assign(err, { fatal: true });
        throw err;
      }
      return (result.items || []).map(normalize).filter((i) => i.id && i.url);
    } catch (e) {
      lastErr = e;
      if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// レイアウト確認用のダミーデータ（DEMO=1 のときだけ使う。公開ビルドでは使われない）
export function demoItems(label, n = 24) {
  const svg = (t) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420"><rect width="100%" height="100%" fill="#3a3550"/><text x="50%" y="50%" fill="#cfc8ee" font-size="22" text-anchor="middle">${t}</text></svg>`,
    );
  return Array.from({ length: n }, (_, i) => ({
    id: `demo_${label}_${i + 1}`,
    title: `【デモ】${label}のサンプル作品タイトル ${i + 1}`,
    url: 'https://example.com/',
    image: svg(`DEMO ${i + 1}`),
    thumb: svg(`DEMO ${i + 1}`),
    samples: [svg('sample 1'), svg('sample 2')],
    priceText: String(770 + i * 10),
    price: 770 + i * 10,
    listPrice: i % 3 === 0 ? 1100 + i * 10 : null,
    off: i % 3 === 0 ? Math.round((1 - (770 + i * 10) / (1100 + i * 10)) * 100) : 0,
    date: '2026-11-01',
    volume: '32',
    genres: [
      { id: String(100 + (i % 4)), name: ['ファンタジー', '学園もの', 'ラブコメ', 'SF'][i % 4] },
    ],
    makers: [`デモサークル${(i % 5) + 1}`],
    authors: [],
    series: [],
    review: { count: 10 + i, average: 4.2 },
  }));
}
