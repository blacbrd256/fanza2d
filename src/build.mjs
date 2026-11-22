// 静的サイトビルダー: content/ の記事 + DMM API の作品データ → dist/
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';
import config from '../site.config.mjs';
import { fetchItems, demoItems } from './dmm.mjs';
import * as t from './templates.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const API_ID = process.env.DMM_API_ID || '';
const AFF_ID = process.env.DMM_AFFILIATE_ID || '';
const DEMO = process.env.DEMO === '1';
const hasApi = Boolean(API_ID && AFF_ID);

const pages = []; // sitemap 用

async function write(urlPath, html) {
  const file = urlPath.endsWith('/') ? path.join(DIST, urlPath, 'index.html') : path.join(DIST, urlPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, html);
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
        .replaceAll(
          '{{contact}}',
          config.contactUrl ? `[お問い合わせフォーム](${config.contactUrl})` : '（お問い合わせ窓口は現在準備中です）',
        );
      return { slug: f.replace(/\.md$/, ''), ...meta, html: marked.parse(filled) };
    }),
  );
}

async function loadFloorData() {
  const out = [];
  for (const floor of config.floors) {
    if (DEMO) {
      const rank = demoItems(floor.slug, 24);
      out.push({ floor, rank, fresh: [...rank].reverse() });
      continue;
    }
    if (!hasApi) continue;
    try {
      const base = { apiId: API_ID, affiliateId: AFF_ID, service: floor.service, floor: floor.floor, hits: config.hits };
      const rank = await fetchItems({ ...base, sort: 'rank' });
      const fresh = await fetchItems({ ...base, sort: 'date' });
      if (!rank.length && !fresh.length) throw new Error('0件');
      out.push({ floor, rank, fresh });
      console.log(`✓ ${floor.label}: ランキング${rank.length}件 / 新着${fresh.length}件`);
    } catch (e) {
      console.warn(`⚠ ${floor.label} (${floor.service}/${floor.floor}) を取得できずスキップ: ${e.message}`);
    }
  }
  if (hasApi && !DEMO && out.length === 0) {
    // 全滅時はビルドを失敗させ、公開中の前回ビルドを残す
    throw new Error('全フロアの取得に失敗しました。API ID / アフィリエイトID を確認してください。');
  }
  return out;
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });
  await fs.cp(path.join(ROOT, 'public'), DIST, { recursive: true });

  const articles = (await loadMarkdownDir('content/articles')).sort((a, b) => (a.date < b.date ? 1 : -1));
  const staticPages = await loadMarkdownDir('content/pages');
  const data = await loadFloorData();
  const floors = data.map((d) => d.floor);
  const showCredit = hasApi && !DEMO;
  const page = (opts) => {
    pages.push(opts.path);
    return write(opts.path, t.layout({ floors, hasApi: showCredit, ...opts }));
  };

  // ---- フロア別ページ ----
  const byFloor = new Map();
  for (const { floor, rank, fresh } of data) {
    const all = new Map();
    for (const it of [...rank, ...fresh]) if (!all.has(it.id)) all.set(it.id, it);
    const items = [...all.values()];
    const sale = items.filter((i) => i.off > 0).sort((a, b) => b.off - a.off);

    const counts = new Map();
    for (const it of items) for (const g of it.genres) counts.set(g.id, { ...g, count: (counts.get(g.id)?.count || 0) + 1 });
    const genres = [...counts.values()]
      .filter((g) => g.count >= 3)
      .sort((a, b) => b.count - a.count)
      .slice(0, config.genrePagesPerFloor);
    const genreIds = new Set(genres.map((g) => g.id));
    byFloor.set(floor.slug, { floor, rank, fresh, sale, genres });

    const head = (title, active) =>
      `<h1>${t.esc(title)}</h1>${t.floorTabs(floor, active, sale.length > 0)}${t.genreChips(floor, genres)}`;

    await page({
      path: `/${floor.slug}/`,
      title: `${floor.label}の人気ランキング`,
      description: `${floor.label}作品の人気ランキングTOP${rank.length}。毎日更新しています。`,
      body: head(`${floor.label}の人気ランキング`, 'rank') + t.grid(floor, rank, true),
    });
    await page({
      path: `/${floor.slug}/new/`,
      title: `${floor.label}の新着作品`,
      description: `${floor.label}の新着作品を配信開始日の新しい順に掲載しています。`,
      body: head(`${floor.label}の新着作品`, 'new') + t.grid(floor, fresh),
    });
    if (sale.length) {
      await page({
        path: `/${floor.slug}/sale/`,
        title: `${floor.label}のセール・割引作品`,
        description: `${floor.label}で割引中の作品を割引率の高い順に掲載しています。`,
        body: head(`${floor.label}のセール・割引作品`, 'sale') + t.grid(floor, sale),
      });
    }
    for (const g of genres) {
      const list = items.filter((i) => i.genres.some((x) => x.id === g.id));
      await page({
        path: `/${floor.slug}/genre/${t.safeId(g.id)}/`,
        title: `「${g.name}」の${floor.label}作品`,
        description: `ジャンル「${g.name}」の${floor.label}作品${list.length}件を掲載しています。`,
        body: `<nav class="crumbs"><a href="/">ホーム</a> › <a href="/${floor.slug}/">${t.esc(floor.label)}</a></nav><h1>「${t.esc(g.name)}」の${t.esc(floor.label)}作品</h1>${t.genreChips(floor, genres)}${t.grid(floor, list)}`,
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
        description: `${it.title}${who ? `（${who}）` : ''}の価格・ジャンル・レビュー評価などの作品情報。`,
        ogImage: it.image,
        body: t.itemBody(floor, it, genreIds, related),
      });
    }
  }

  // ---- 記事 ----
  for (const a of articles) {
    const rel = byFloor.get(a.floor);
    await page({
      path: `/articles/${a.slug}/`,
      title: a.title,
      description: a.description,
      body: `<nav class="crumbs"><a href="/">ホーム</a> › <a href="/articles/">ガイド記事</a></nav>
<article class="prose"><h1>${t.esc(a.title)}</h1><time>${t.esc(a.date)}</time>${a.html}</article>
${rel ? `<section><h2>いま人気の${t.esc(rel.floor.label)}作品</h2>${t.grid(rel.floor, rel.rank.slice(0, 8), true)}<p class="more"><a href="/${rel.floor.slug}/">ランキングをもっと見る →</a></p></section>` : ''}`,
    });
  }
  await page({
    path: '/articles/',
    title: 'ガイド記事一覧',
    description: '2次元作品の選び方・楽しみ方についてのガイド記事一覧です。',
    body: `<h1>ガイド記事</h1>${t.articleList(articles)}`,
  });

  // ---- 固定ページ ----
  for (const p of staticPages) {
    await page({ path: `/${p.slug}/`, title: p.title, description: p.description, body: `<article class="prose"><h1>${t.esc(p.title)}</h1>${p.html}</article>` });
  }

  // ---- トップ ----
  const sections = [...byFloor.values()]
    .map(
      ({ floor, rank }) =>
        `<section><h2>${t.esc(floor.label)}の人気ランキング</h2>${t.grid(floor, rank.slice(0, 8), true)}<p class="more"><a href="/${floor.slug}/">${t.esc(floor.label)}ランキングをもっと見る →</a> <a href="/${floor.slug}/new/">新着を見る →</a></p></section>`,
    )
    .join('\n');
  await page({
    path: '/',
    title: '',
    body: `<section class="hero"><h1>${t.esc(config.name)}</h1><p>${t.esc(config.description)}</p></section>
${sections}
<section><h2>ガイド記事</h2>${t.articleList(articles.slice(0, 6))}<p class="more"><a href="/articles/">記事一覧 →</a></p></section>`,
  });

  // ---- 404 / sitemap / robots ----
  await write('/404.html', t.layout({ floors, hasApi: showCredit, path: '/404.html', title: 'ページが見つかりません', body: '<h1>ページが見つかりません</h1><p>作品の配信終了などによりページが無くなった可能性があります。</p><p><a href="/">トップページへ戻る</a></p>' }));
  await write(
    '/sitemap.xml',
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${t.esc(config.url + p)}</loc></url>`).join('\n')}\n</urlset>\n`,
  );
  await write('/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${config.url}/sitemap.xml\n`);

  console.log(`完了: ${pages.length}ページ生成（${DEMO ? 'デモデータ' : hasApi ? 'API連携あり' : 'API未設定・記事のみ'}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
