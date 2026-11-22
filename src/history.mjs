// 順位と価格の日次履歴。
// ビルド環境は状態を持てないので、公開中のサイトに置いた /data/history.json を次のビルドが読み、
// 今日の列を足して書き戻す。リポジトリの data/history.json は消えたときの控え。
//
// 形式: { v:1, days:[日付...], floors:{ slug:{ r:{id:[順位...]}, p:{id:[価格...]}, low:{id:[最安値,日付]} } } }
// r / p の配列は days と同じ長さで、記録の無い日は null。
import fs from 'node:fs/promises';

export const todayJST = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const empty = () => ({ v: 1, days: [], floors: {} });
const valid = (h) => h && h.v === 1 && Array.isArray(h.days) && h.floors && typeof h.floors === 'object';
const eachArr = (h, fn) => {
  for (const f of Object.values(h.floors)) for (const k of ['r', 'p']) for (const id of Object.keys(f[k])) fn(f[k], id);
};

export async function loadHistory({ url, seedPath }) {
  const found = [];
  if (url) {
    try {
      const res = await fetch(`${url}/data/history.json`, { signal: AbortSignal.timeout(20000) });
      if (res.ok) {
        const h = await res.json();
        if (valid(h)) found.push(h);
      }
    } catch {}
  }
  try {
    const h = JSON.parse(await fs.readFile(seedPath, 'utf8'));
    if (valid(h)) found.push(h);
  } catch {}
  // 最終日が新しいほう、同じなら日数の多いほう
  found.sort((a, b) => (b.days.at(-1) || '').localeCompare(a.days.at(-1) || '') || b.days.length - a.days.length);
  return found[0] || empty();
}

export function beginDay(h, day, maxDays) {
  if (h.days.at(-1) === day) {
    eachArr(h, (o, id) => (o[id][o[id].length - 1] = null)); // 同日の再ビルドは今日の列を作り直す
  } else {
    h.days.push(day);
    eachArr(h, (o, id) => o[id].push(null));
    while (h.days.length > maxDays) {
      h.days.shift();
      eachArr(h, (o, id) => o[id].shift());
    }
  }
}

export function record(h, slug, rankItems, allItems) {
  const f = (h.floors[slug] ??= { r: {}, p: {}, low: {} });
  const n = h.days.length;
  const day = h.days[n - 1];
  const col = (o, id) => (o[id] ??= Array(n).fill(null));
  rankItems.forEach((it, i) => (col(f.r, it.id)[n - 1] = i + 1));
  for (const it of allItems) {
    if (it.price == null) continue;
    col(f.p, it.id)[n - 1] = it.price;
    if (!f.low[it.id] || it.price < f.low[it.id][0]) f.low[it.id] = [it.price, day];
  }
}

export function prune(h) {
  for (const f of Object.values(h.floors)) {
    for (const k of ['r', 'p']) for (const [id, a] of Object.entries(f[k])) if (a.every((v) => v == null)) delete f[k][id];
    for (const id of Object.keys(f.low)) if (!f.p[id]) delete f.low[id];
  }
}

// 1作品ぶんの指標
export function stats(h, slug, item) {
  const f = h.floors[slug] || { r: {}, p: {}, low: {} };
  const n = h.days.length;
  const r = f.r[item.id] || [];
  const p = f.p[item.id] || [];
  const rank = r[n - 1] ?? null;
  const prevRank = n >= 2 ? (r[n - 2] ?? null) : null;
  const pastPrices = p.slice(0, n - 1).filter((v) => v != null);
  const prevPrice = pastPrices.at(-1) ?? null;
  const low = f.low[item.id] || null;
  return {
    rank,
    prevRank,
    delta: rank != null && prevRank != null ? prevRank - rank : null,
    isNew: n >= 2 && rank != null && prevRank == null,
    drop: prevPrice != null && item.price != null && item.price < prevPrice ? prevPrice - item.price : 0,
    rise: prevPrice != null && item.price != null && item.price > prevPrice ? item.price - prevPrice : 0,
    low,
    // 以前はもっと高かった記録があり、今が記録上の最安値
    isLowest: Boolean(low && item.price != null && item.price <= low[0] && pastPrices.some((v) => v > item.price)),
    tracked: p.filter((v) => v != null).length,
    rankSeries: r,
    priceSeries: p,
  };
}
