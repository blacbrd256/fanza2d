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
export function demoItems(label, n = 40) {
  const hue = { doujin: 268, comic: 12, pcgame: 200, anime: 150 }[label] ?? 268;
  const svg = (t, i = 0) =>
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="hsl(${(hue + i * 23) % 360} 32% 78%)"/><text x="50%" y="54%" fill="hsl(${(hue + i * 23) % 360} 40% 30%)" font-family="sans-serif" font-size="30" font-weight="700" text-anchor="middle">${t}</text></svg>`,
    );
  const G = ['ファンタジー', '学園もの', 'ラブコメ', 'SF', 'フルカラー', '総集編', '日常', 'ホラー'];
  return Array.from({ length: n }, (_, i) => {
    const list = 660 + ((i * 37) % 9) * 110;
    const off = i % 4 === 0 ? [30, 50, 20][i % 3] : 0;
    const price = Math.round((list * (100 - off)) / 100);
    return {
      id: `demo_${label}_${i + 1}`,
      title: `【デモ】サンプル作品タイトル その${i + 1} ～副題が長めに入る場合の表示確認～`,
      url: 'https://example.com/',
      image: svg(`DEMO ${i + 1}`, i),
      thumb: svg(`DEMO ${i + 1}`, i),
      samples: [svg('sample 1', i), svg('sample 2', i), svg('sample 3', i)],
      priceText: String(price),
      price,
      listPrice: off ? list : null,
      off,
      date: `2026-11-${String(22 - (i % 20)).padStart(2, '0')}`,
      volume: String(24 + ((i * 13) % 90)),
      genres: [0, 1, 2].map((k) => ({ id: String(100 + ((i + k * 3) % G.length)), name: G[(i + k * 3) % G.length] })),
      makers: [`デモサークル${(i % 7) + 1}`],
      authors: [],
      series: [],
      review: i % 6 === 5 ? null : { count: 8 + ((i * 17) % 300), average: 3.6 + ((i * 5) % 14) / 10 },
    };
  });
}
