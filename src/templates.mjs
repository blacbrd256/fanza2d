import config from '../site.config.mjs';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const yen = (n) => (n == null ? '' : `${n.toLocaleString('ja-JP')}円`);
// URL とディレクトリ名を一致させるため、ID は安全な文字だけに揃える
export const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
export const itemPath = (floor, item) => `/item/${floor.slug}/${safeId(item.id)}/`;

export function layout({ title, description, path, body, floors, hasApi, ogImage }) {
  const fullTitle = title ? `${title} | ${config.name}` : `${config.name} - ${config.tagline}`;
  const desc = description || config.description;
  const canonical = config.url + path;
  const nav = floors.map((f) => `<a href="/${f.slug}/">${esc(f.label)}</a>`).join('');
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(config.name)}">
${ogImage && !ogImage.startsWith('data:') ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="summary">
<meta name="rating" content="adult">
<link rel="stylesheet" href="/style.css">
<script>try{if(!localStorage.getItem('age_ok'))document.documentElement.classList.add('age-pending')}catch(e){}</script>
</head>
<body>
<div id="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
  <div class="age-box">
    <h2 id="age-title">年齢確認</h2>
    <p>このサイトは成人向けの内容を含みます。<br>あなたは18歳以上ですか？</p>
    <div class="age-btns">
      <button id="age-yes" type="button">はい（18歳以上）</button>
      <a href="https://www.google.com/" rel="nofollow">いいえ</a>
    </div>
  </div>
</div>
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="/">${esc(config.name)}</a>
    <nav>${nav}<a href="/articles/">ガイド記事</a></nav>
  </div>
</header>
<p class="pr-note wrap">当サイトはアフィリエイト広告（PR）を利用しています。</p>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <nav><a href="/about/">このサイトについて</a><a href="/privacy/">プライバシーポリシー・免責事項</a><a href="/contact/">お問い合わせ</a></nav>
    ${hasApi ? '<p class="credit">Powered by <a href="https://affiliate.dmm.com/api/" rel="nofollow noopener" target="_blank">FANZA Webサービス</a></p>' : ''}
    <p>&copy; ${new Date().getFullYear()} ${esc(config.name)}</p>
  </div>
</footer>
<script src="/age.js" defer></script>
</body>
</html>`;
}

export function card(floor, item, rank) {
  const sub = item.makers[0] || item.authors[0] || '';
  return `<article class="card">
  <a href="${itemPath(floor, item)}">
    <div class="thumb">${rank ? `<span class="rank r${rank <= 3 ? rank : 'n'}">${rank}</span>` : ''}${item.off ? `<span class="off">${item.off}%OFF</span>` : ''}<img src="${esc(item.thumb)}" alt="${esc(item.title)}" loading="lazy" referrerpolicy="no-referrer"></div>
    <h3>${esc(item.title)}</h3>
  </a>
  <p class="meta">${esc(sub)}</p>
  <p class="price">${item.price != null ? yen(item.price) : esc(item.priceText)}${item.off ? ` <s>${yen(item.listPrice)}</s>` : ''}</p>
</article>`;
}

export const grid = (floor, items, ranked = false) =>
  `<div class="grid">${items.map((it, i) => card(floor, it, ranked ? i + 1 : 0)).join('\n')}</div>`;

export function floorTabs(floor, active, hasSale) {
  const tabs = [
    ['rank', `/${floor.slug}/`, '人気ランキング'],
    ['new', `/${floor.slug}/new/`, '新着'],
    ...(hasSale ? [['sale', `/${floor.slug}/sale/`, 'セール']] : []),
  ];
  return `<div class="tabs">${tabs.map(([k, href, label]) => `<a href="${href}"${k === active ? ' class="on"' : ''}>${label}</a>`).join('')}</div>`;
}

export const genreChips = (floor, genres) =>
  genres.length
    ? `<div class="chips">${genres.map((g) => `<a href="/${floor.slug}/genre/${safeId(g.id)}/">${esc(g.name)}${g.count ? `<small>${g.count}</small>` : ''}</a>`).join('')}</div>`
    : '';

export function itemBody(floor, item, genrePageIds, related) {
  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${v}</td></tr>` : '');
  const genres = item.genres
    .map((g) => (genrePageIds.has(g.id) ? `<a href="/${floor.slug}/genre/${safeId(g.id)}/">${esc(g.name)}</a>` : esc(g.name)))
    .join('、');
  const cta = `<a class="cta" href="${esc(item.url)}" rel="sponsored nofollow noopener" target="_blank">FANZAで詳細・サンプルを見る</a>`;
  return `<nav class="crumbs"><a href="/">ホーム</a> › <a href="/${floor.slug}/">${esc(floor.label)}</a></nav>
<article class="item">
  <h1>${esc(item.title)}</h1>
  <div class="item-main">
    <a class="cover" href="${esc(item.url)}" rel="sponsored nofollow noopener" target="_blank"><img src="${esc(item.image)}" alt="${esc(item.title)}" referrerpolicy="no-referrer"></a>
    <div class="item-info">
      <p class="price big">${item.price != null ? yen(item.price) : esc(item.priceText)}${item.off ? ` <s>${yen(item.listPrice)}</s> <span class="off-inline">${item.off}%OFF</span>` : ''}</p>
      <table>
        ${row('サークル・メーカー', esc(item.makers.join('、')))}
        ${row('作者', esc(item.authors.join('、')))}
        ${row('シリーズ', esc(item.series.join('、')))}
        ${row('ジャンル', genres)}
        ${row('配信開始日', esc(item.date))}
        ${row('ボリューム', esc(item.volume))}
        ${row('レビュー', item.review ? `★${item.review.average.toFixed(2)}（${item.review.count}件）` : '')}
      </table>
      ${cta}
      <p class="note">価格・セール情報は取得時点のものです。最新の情報はリンク先でご確認ください。</p>
    </div>
  </div>
  ${
    config.showSampleImages && item.samples.length
      ? `<h2>サンプル画像</h2><div class="samples">${item.samples.map((s) => `<img src="${esc(s)}" alt="${esc(item.title)} サンプル" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>${cta}`
      : ''
  }
</article>
${related.length ? `<section><h2>関連する${esc(floor.label)}作品</h2>${grid(floor, related)}</section>` : ''}`;
}

export const articleList = (articles) =>
  `<ul class="article-list">${articles
    .map((a) => `<li><a href="/articles/${a.slug}/"><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span><time>${esc(a.date)}</time></a></li>`)
    .join('')}</ul>`;
