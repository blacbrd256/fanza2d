// 静的サイトビルダー: content/ の記事 + DMM API の作品データ + 日次履歴 → dist/
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import config from '../site.config.mjs';
import { fetchItems, demoItems } from './dmm.mjs';
import { loadHistory, beginDay, record, prune, stats, todayJST } from './history.mjs';
import * as t from './templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const API_ID = process.env.DMM_API_ID || '';
const AFF_ID = process.env.DMM_AFFILIATE_ID || '';
const DEMO = process.env.DEMO === '1';
const hasApi = Boolean(API_ID && AFF_ID);
const live = !config.url.includes('example.pages.dev');

const pages = []; // sitemap 用

async function write(urlPath, content) {
  const file = urlPath.endsWith('/') ? path.join(DIST, urlPath, 'index.html') : path.join(DIST, urlPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}

function parseFrontMatter(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: src };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] };
}

async function loadMarkdownDir(dir) {
  const full = path.join(ROOT, dir);
  const files = (await fs.readdir(full)).filter((f) => f.endsWith('.md'));
  return Promise.all(
    files.map(async (f) => {
      const { meta, body } = parseFrontMatter(await fs.readFile(path.join(full, f), 'utf8'));
      const filled = body
        .replaceAll('{{siteName}}', config.name)
        .replaceAll('{{operator}}', config.operator)
        .replaceAll('{{contact}}', config.contactUrl ? `[お問い合わせフォーム](${config.contactUrl})` : '（お問い合わせ窓口は現在準備中です）');
      return { slug: f.replace(/\.md$/, ''), ...meta, html: marked.parse(filled) };
    }),
  );
}

async function loadFloorData() {
  const result = [];
  for (const floor of config.floors) {
    if (DEMO) {
      const rank = demoItems(floor.slug, 40);
      result.push({ floor, rank, fresh: [...rank].sort((a, b) => b.date.localeCompare(a.date)), review: [] });
      continue;
    }
    if (!hasApi) continue;
    const base = { apiId: API_ID, affiliateId: AFF_ID, service: floor.service, floor: floor.floor, hits: config.hits };
    try {
      const rank = await fetchItems({ ...base, sort: 'rank' });
      const fresh = await fetchItems({ ...base, sort: 'date' });
      if (!rank.length && !fresh.length) throw new Error('0件');
      let review = [];
      try {
        review = await fetchItems({ ...base, sort: 'review' });
      } catch (e) {
        console.warn(`⚠ ${floor.label}: 評価順の取得に失敗（穴場ページは作らない）: ${e.message}`);
      }
      result.push({ floor, rank, fresh, review });
      console.log(`✓ ${floor.label}: ランキング${rank.length} / 新着${fresh.length} / 評価順${review.length}`);
    } catch (e) {
      console.warn(`⚠ ${floor.label} (${floor.service}/${floor.floor}) を取得できずスキップ: ${e.message}`);
    }
  }
  if (hasApi && !DEMO && result.length === 0) {
    // 全滅時はビルドを失敗させ、公開中の前回ビルドを残す
    throw new Error('全フロアの取得に失敗しました。API ID / アフィリエイトID を確認してください。');
  }
  return result;
}

// デモ用: 過去14日ぶんの順位・価格を作って履歴の表示を確認できるようにする
function demoHistory(data) {
  const h = { v: 1, days: [], floors: {} };
  const today = new Date(todayJST());
  for (let d = 13; d >= 1; d--) {
    beginDay(h, new Date(today - d * 864e5).toISOString().slice(0, 10), config.historyDays);
    for (const { floor, rank } of data) {
      const past = rank
        .map((it, i) => ({ it, k: i + Math.sin(i * 1.7 + d) * (d * 0.9) }))
        .filter(({ it }, i) => !(i % 9 === 4 && d > 2))
        .sort((a, b) => a.k - b.k)
        .map(({ it }, i) => ({ ...it, price: i % 5 === 0 && d > 3 ? (it.listPrice || Math.round(it.price * 1.3)) : it.price }));
      record(h, floor.slug, past, past);
    }
  }
  return h;
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
  await fs.cp(path.join(ROOT, 'public'), DIST, { recursive: true });

  const articles = (await loadMarkdownDir('content/articles')).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug.localeCompare(b.slug)));
  const staticPages = await loadMarkdownDir('content/pages');
  const data = await loadFloorData();
  const floors = data.map((d) => d.floor);
  const showCredit = hasApi && !DEMO;
  const day = todayJST();
  const updated = data.length ? day : '';

  // ---- 履歴 ----
  let history = { v: 1, days: [], floors: {} };
  if (data.length) {
    history = DEMO ? demoHistory(data) : await loadHistory({ url: live ? config.url : '', seedPath: path.join(ROOT, 'data/history.json') });
    beginDay(history, day, config.historyDays);
    for (const d of data) {
      const seen = new Map();
      for (const it of [...d.rank, ...d.fresh, ...d.review]) if (!seen.has(it.id)) seen.set(it.id, it);
      d.items = [...seen.values()];
      record(history, d.floor.slug, d.rank, d.items);
    }
    prune(history);
    await write('/data/history.json', JSON.stringify(history));
    console.log(`履歴: ${history.days.length}日ぶん（${history.days[0]} 〜 ${history.days.at(-1)}）`);
  }
  const days = history.days;

  const page = (opts) => {
    pages.push(opts.path);
    return write(opts.path, t.layout({ floors, hasApi: showCredit, updated, ...opts }));
  };

  // ---- フロア別 ----
  const byFloor = new Map();
  const digest = { date: day, days: days.length, floors: {} };
  const allGenres = new Map();

  for (const d of data) {
    const { floor, rank, fresh, review, items } = d;
    for (const it of items) {
      it.st = stats(history, floor.slug, it);
      const m = floor.unit === 'page' ? String(it.volume).match(/^(\d{1,4})\s*(ページ|[pP])?$/) : null;
      it.pages = m ? Number(m[1]) : null;
      it.ppp = it.pages >= 10 && it.price ? it.price / it.pages : null;
      for (const g of it.genres) allGenres.set(g.name, (allGenres.get(g.name) || 0) + 1);
    }
    const inRank = new Set(rank.map((i) => i.id));
    const rising = [...rank.filter((i) => i.st.delta > 0).sort((a, b) => b.st.delta - a.st.delta), ...rank.filter((i) => i.st.isNew)];
    const deals = items
      .filter((i) => i.st.drop || i.st.isLowest || i.off)
      .sort((a, b) => (b.st.drop ? 1 : 0) - (a.st.drop ? 1 : 0) || (b.st.isLowest ? 1 : 0) - (a.st.isLowest ? 1 : 0) || b.off - a.off);
    const gems = review
      .filter((i) => !inRank.has(i.id) && i.review && i.review.average >= 4.5 && i.review.count >= 10)
      .sort((a, b) => b.review.average - a.review.average || b.review.count - a.review.count);
    const value = items.filter((i) => i.ppp && i.pages >= 20).sort((a, b) => a.ppp - b.ppp).slice(0, 100);

    const counts = new Map();
    for (const it of items) for (const g of it.genres) counts.set(g.id, { ...g, count: (counts.get(g.id)?.count || 0) + 1 });
    const genres = [...counts.values()].filter((g) => g.count >= 3).sort((a, b) => b.count - a.count).slice(0, config.genrePagesPerFloor);
    const genreIds = new Set(genres.map((g) => g.id));

    const L = floor.label;
    const views = [
      { key: 'rank', path: '', label: 'ランキング', items: rank, pos: (it) => it.st.rank, h1: `${L}の人気ランキング`, lead: '前日からの順位の動きつき。▲は上昇、▼は下降、NEWは新しく100位以内に入った作品です。', desc: `${L}作品の人気ランキングを、前日からの順位変動つきで掲載しています。` },
      { key: 'rising', path: 'rising/', label: '急上昇', items: rising, pos: (it) => it.st.rank, h1: `${L}の急上昇作品`, lead: '前日より順位を上げた作品を、上げ幅の大きい順に並べています。', desc: `${L}で前日から順位を大きく上げた作品の一覧です。`, defaultLabel: '上げ幅が大きい順' },
      { key: 'deals', path: 'deals/', label: '値下げ・最安値', items: deals, h1: `${L}の値下げ・最安値`, lead: '前回の記録より安くなった作品、当サイトの記録で最安値になっている作品、割引中の作品です。', desc: `${L}で値下げされた作品と、記録上の最安値になっている作品の一覧です。`, defaultLabel: '値下げ直後を先頭に' },
      { key: 'gems', path: 'gems/', label: '穴場の高評価', items: gems, h1: `${L}の穴場・高評価作品`, lead: 'いまの人気ランキング100位には入っていないものの、評価★4.5以上・レビュー10件以上の作品です。', desc: `${L}で、ランキング圏外ながら評価の高い作品を集めました。`, defaultLabel: '評価が高い順' },
      { key: 'value', path: 'value/', label: 'ページ単価', items: value, h1: `${L}の1ページあたり価格ランキング`, lead: '価格をページ数で割った「1ページあたりの価格」が安い順です（20ページ以上の作品が対象）。', desc: `${L}作品を1ページあたりの価格が安い順に並べています。`, defaultLabel: '1ページあたりが安い順' },
      { key: 'new', path: 'new/', label: '新着', items: fresh, h1: `${L}の新着作品`, lead: '配信開始日の新しい順です。', desc: `${L}の新着作品を配信開始日の新しい順に掲載しています。`, defaultLabel: '新しい順' },
    ]
      .filter((v) => v.key === 'rank' || v.key === 'new' || v.items.length > 0)
      .map((v) => ({ ...v, count: v.items.length }));

    byFloor.set(floor.slug, { floor, rank, rising, deals, gems, views });

    for (const v of views) {
      await page({
        path: `/${floor.slug}/${v.path}`,
        title: v.h1,
        description: v.desc,
        body: `<header class="page-head"><h1>${t.esc(v.h1)}</h1><p class="lead">${t.esc(v.lead)}</p></header>
${t.tabs(floor, views, v.key)}
${t.tools({ ppp: floor.unit === 'page', defaultLabel: v.defaultLabel || '順位順' })}
${t.genreChips(floor, genres)}
${t.list(floor, v.items, v.pos)}`,
      });
    }

    for (const g of genres) {
      const gl = items.filter((i) => i.genres.some((x) => x.id === g.id)).sort((a, b) => (a.st.rank ?? 999) - (b.st.rank ?? 999));
      await page({
        path: `/${floor.slug}/genre/${t.safeId(g.id)}/`,
        title: `「${g.name}」の${L}作品`,
        description: `ジャンル「${g.name}」の${L}作品${gl.length}件を、順位・価格の動きつきで掲載しています。`,
        body: `<nav class="crumbs"><a href="/">ホーム</a><i>/</i><a href="/${floor.slug}/">${t.esc(L)}</a></nav>
<header class="page-head"><h1>「${t.esc(g.name)}」の${t.esc(L)}作品</h1><p class="lead">${gl.length}件。ランキング順位の高い順です。</p></header>
${t.tools({ ppp: floor.unit === 'page', defaultLabel: '順位順' })}
${t.genreChips(floor, genres)}
${t.list(floor, gl, (it) => it.st.rank)}`,
      });
    }

    for (const it of items) {
      const gset = new Set(it.genres.map((g) => g.id));
      const related = items
        .filter((o) => o.id !== it.id)
        .map((o) => ({ o, s: (o.makers[0] && o.makers[0] === it.makers[0] ? 3 : 0) + o.genres.filter((g) => gset.has(g.id)).length }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 8)
        .map((x) => x.o);
      const who = it.makers[0] || it.authors[0];
      await page({
        path: t.itemPath(floor, it),
        title: it.title,
        description: `${it.title}${who ? `（${who}）` : ''}の価格推移・順位推移・評価などのデータ。`,
        ogImage: it.image,
        body: t.itemBody(floor, it, genreIds, related, days),
      });
    }

    const brief = (i) => ({ title: i.title, maker: i.makers[0] || i.authors[0] || '', genres: i.genres.map((g) => g.name), price: i.price, off: i.off, rank: i.st.rank, delta: i.st.delta, isNew: i.st.isNew, drop: i.st.drop, isLowest: i.st.isLowest, review: i.review, path: t.itemPath(floor, i) });
    const topGenres = new Map();
    for (const i of rank) for (const g of i.genres) topGenres.set(g.name, (topGenres.get(g.name) || 0) + 1);
    digest.floors[floor.slug] = {
      label: L,
      top: rank.slice(0, 10).map(brief),
      rising: rising.filter((i) => !i.st.isNew).slice(0, 10).map(brief),
      newEntries: rank.filter((i) => i.st.isNew).slice(0, 10).map(brief),
      priceDrops: deals.filter((i) => i.st.drop).slice(0, 10).map(brief),
      lowest: deals.filter((i) => i.st.isLowest).slice(0, 10).map(brief),
      gems: gems.slice(0, 10).map(brief),
      genresInTop100: [...topGenres.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
    };
  }
  if (data.length) await write('/data/digest.json', JSON.stringify(digest, null, 1));

  // ---- NGジャンル設定 ----
  if (data.length) {
    const gs = [...allGenres.entries()].sort((a, b) => b[1] - a[1]);
    await page({
      path: '/ng/',
      title: 'NGジャンル設定',
      description: '苦手なジャンルを登録すると、そのジャンルを含む作品をサイト全体で非表示にできます。',
      body: `<header class="page-head"><h1>NGジャンル設定</h1><p class="lead">苦手なジャンルを選ぶと、そのジャンルを含む作品がランキングや一覧に表示されなくなります。設定はこのブラウザにだけ保存されます。</p></header>
<p><button type="button" class="ghost" data-ng-clear>すべて解除</button></p>
<div class="ng-grid">${gs.map(([name, c]) => `<button type="button" data-ng="${t.esc(name)}">${t.esc(name)}<small>${c}</small></button>`).join('')}</div>`,
    });
  }

  // ---- 記事 ----
  for (const a of articles) {
    const rel = byFloor.get(a.floor);
    await page({
      path: `/articles/${a.slug}/`,
      title: a.title,
      description: a.description,
      body: `<nav class="crumbs"><a href="/">ホーム</a><i>/</i><a href="/articles/">読みもの</a></nav>
<article class="prose"><header><time>${t.esc(a.date)}</time><h1>${t.esc(a.title)}</h1><p class="lead">${t.esc(a.description)}</p></header>${a.html}</article>
${rel ? `<section><h2>いまの${t.esc(rel.floor.label)}ランキング上位</h2>${t.tiles(rel.floor, rel.rank.slice(0, 6), true)}<p class="more"><a href="/${rel.floor.slug}/">ランキングを見る</a></p></section>` : ''}`,
    });
  }
  await page({
    path: '/articles/',
    title: '読みもの',
    description: '2次元作品の選び方・楽しみ方についての記事一覧です。',
    body: `<header class="page-head"><h1>読みもの</h1><p class="lead">作品の選び方、ジャンルの解説、データから見えた傾向など。</p></header>${t.articleList(articles)}`,
  });

  // ---- 固定ページ ----
  for (const p of staticPages) {
    await page({ path: `/${p.slug}/`, title: p.title, description: p.description, body: `<article class="prose"><header><h1>${t.esc(p.title)}</h1></header>${p.html}</article>` });
  }

  // ---- トップ ----
  const pulse = (label, it, floor, value) =>
    it
      ? `<a class="pulse" href="${t.itemPath(floor, it)}"><span class="k">${label}</span><span class="v">${value}</span><span class="tt">${t.esc(it.title)}</span></a>`
      : '';
  const sections = [...byFloor.values()]
    .map(({ floor, rank, rising, deals, views }) => {
      const riser = rising.find((i) => !i.st.isNew);
      const fresh1 = rank.find((i) => i.st.isNew);
      const drop = deals.find((i) => i.st.drop) || deals.find((i) => i.st.isLowest) || deals.find((i) => i.off);
      return `<section class="floor">
  <div class="sec-head"><h2>${t.esc(floor.label)}</h2><nav>${views.map((v) => `<a href="/${floor.slug}/${v.path}">${t.esc(v.label)}</a>`).join('')}</nav></div>
  <div class="pulses">
    ${pulse('急上昇', riser, floor, riser ? `▲${riser.st.delta}<small>→ ${riser.st.rank}位</small>` : '')}
    ${pulse('初登場', fresh1, floor, fresh1 ? `${fresh1.st.rank}<small>位</small>` : '')}
    ${pulse(drop?.st.drop ? '値下げ' : drop?.st.isLowest ? '最安値' : '割引', drop, floor, drop ? (drop.st.drop ? `−${drop.st.drop.toLocaleString('ja-JP')}<small>円</small>` : `${drop.price.toLocaleString('ja-JP')}<small>円</small>`) : '')}
  </div>
  ${t.tiles(floor, rank.slice(0, 6), true)}
</section>`;
    })
    .join('\n');
  const features = `<ul class="features">
  <li><b>順位の動き</b><span>前日から何位上がったか、初登場かをランキングに表示。</span></li>
  <li><b>価格の記録</b><span>毎日の価格を記録し、値下げと記録上の最安値を検知。</span></li>
  <li><b>ページ単価</b><span>価格をページ数で割って、ボリュームに対する割安さを比較。</span></li>
  <li><b>NGジャンル</b><span>苦手なジャンルを登録すると、サイト全体で非表示に。</span></li>
</ul>`;
  await page({
    path: '/',
    title: '',
    body: `<section class="hero">
  <p class="eyebrow">${data.length ? `${day} 更新 ／ 記録 ${days.length}日目` : '同人・コミック・PCゲーム・アニメ'}</p>
  <h1>${t.esc(config.tagline)}</h1>
  <p>人気順位と価格を毎日記録して、「いま上がっている作品」「いま安い作品」を数字で見つけられるようにするサイトです。${data.length ? '' : '作品データの掲載は現在準備中で、まずは選び方の記事を公開しています。'}</p>
  ${features}
</section>
${sections}
<section><div class="sec-head"><h2>読みもの</h2><nav><a href="/articles/">すべての記事</a></nav></div>${t.articleList(articles.slice(0, 6))}</section>`,
  });

  // ---- 404 / sitemap / robots ----
  await write('/404.html', t.layout({ floors, hasApi: showCredit, updated, path: '/404.html', title: 'ページが見つかりません', body: '<header class="page-head"><h1>ページが見つかりません</h1><p class="lead">作品が一覧から外れた、または配信が終了した可能性があります。</p></header><p><a href="/">トップページへ戻る</a></p>' }));
  await write('/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${t.esc(config.url + p)}</loc></url>`).join('\n')}\n</urlset>\n`);
  await write('/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);

  console.log(`完了: ${pages.length}ページ生成（${DEMO ? 'デモデータ' : hasApi ? 'API連携あり' : 'API未設定・記事のみ'}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
