import config from '../site.config.mjs';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const num = (n) => n.toLocaleString('ja-JP');
// URL とディレクトリ名を一致させるため、ID は安全な文字だけに揃える
export const safeId = (id) => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
export const itemPath = (floor, item) => `/item/${floor.slug}/${safeId(item.id)}/`;
const out = 'rel="sponsored nofollow noopener" target="_blank"';

const LOGO = `<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="currentColor"/><path d="M6 22l6-7 5 4 9-11" fill="none" stroke="var(--paper)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="8" r="2.6" fill="var(--paper)"/></svg>`;

export function layout({ title, description, path, body, floors, hasApi, ogImage, updated }) {
  const fullTitle = title ? `${title} | ${config.name}` : `${config.name} | ${config.tagline}`;
  const desc = description || config.description;
  const canonical = config.url + path;
  const cur = (href) => (path === href || (href !== '/' && path.startsWith(href)) ? ' aria-current="page"' : '');
  const nav = floors.map((f) => `<a href="/${f.slug}/"${cur(`/${f.slug}/`)}>${esc(f.label)}</a>`).join('');
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
<meta name="theme-color" content="#f7f5f0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#14151a" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css">
<script>try{if(!localStorage.getItem('age_ok'))document.documentElement.classList.add('age-pending')}catch(e){}</script>
</head>
<body>
<div id="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title">
  <div class="age-box">
    <p class="age-logo">${LOGO}${esc(config.name)}</p>
    <h2 id="age-title">年齢確認</h2>
    <p>このサイトは成人向けの内容を含みます。<br>あなたは18歳以上ですか？</p>
    <div class="age-btns">
      <button id="age-yes" type="button">はい、18歳以上です</button>
      <a href="https://www.google.com/" rel="nofollow">いいえ</a>
    </div>
  </div>
</div>
<header class="site-header">
  <div class="wrap">
    <a class="logo" href="/">${LOGO}<span>${esc(config.name)}</span></a>
    <nav class="gnav">${nav}<a href="/articles/"${cur('/articles/')}>読みもの</a>${floors.length ? `<a href="/ng/"${cur('/ng/')}>NG設定</a>` : ''}</nav>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <div class="wrap">
    <p class="foot-logo">${LOGO}<span>${esc(config.name)}</span></p>
    <nav><a href="/about/">このサイトについて</a><a href="/privacy/">プライバシーポリシー・免責事項</a><a href="/contact/">お問い合わせ</a></nav>
    <p class="small">当サイトはアフィリエイト広告（PR）を利用しています。${updated ? `　データ最終更新: ${esc(updated)}` : ''}</p>
    ${hasApi ? '<p class="small">Powered by <a href="https://affiliate.dmm.com/api/" rel="nofollow noopener" target="_blank">FANZA Webサービス</a></p>' : ''}
    <p class="small">&copy; ${new Date().getFullYear()} ${esc(config.name)}</p>
  </div>
</footer>
<script src="/app.js" defer></script>
</body>
</html>`;
}

// ---- 部品 ----

export function move(st) {
  if (!st || st.rank == null) return '';
  if (st.isNew) return '<span class="mv new">NEW</span>';
  if (st.delta == null) return '<span class="mv flat">–</span>';
  if (st.delta > 0) return `<span class="mv up">▲${st.delta}</span>`;
  if (st.delta < 0) return `<span class="mv down">▼${-st.delta}</span>`;
  return '<span class="mv flat">→</span>';
}

function badges(item) {
  const st = item.st;
  const b = [];
  if (st?.isLowest) b.push('<span class="badge low">記録上の最安値</span>');
  if (st?.drop) b.push(`<span class="badge drop">前回比 −${num(st.drop)}円</span>`);
  if (item.off) b.push(`<span class="badge off">${item.off}%OFF</span>`);
  return b.join('');
}

function facts(item) {
  const f = [];
  if (item.review) f.push(`<span class="star">★${item.review.average.toFixed(2)}</span><small>（${num(item.review.count)}件）</small>`);
  if (item.pages) f.push(`${item.pages}ページ`);
  if (item.ppp) f.push(`<span class="ppp">1ページ ${item.ppp.toFixed(1)}円</span>`);
  return f.join('<i>·</i>');
}

const dataAttrs = (item) =>
  `data-g="${esc(item.genres.map((g) => g.name).join('|'))}" data-price="${item.price ?? ''}" data-off="${item.off || 0}" data-rev="${item.review ? item.review.average : ''}" data-ppp="${item.ppp ?? ''}" data-drop="${item.st?.drop || 0}"`;

// 一覧の1行。pos は左端に出す数字（順位など）。
export function row(floor, item, pos) {
  const href = itemPath(floor, item);
  const who = item.makers[0] || item.authors[0] || '';
  return `<li class="row" ${dataAttrs(item)}>
  <div class="pos">${pos != null ? `<b class="n${pos <= 3 ? ' top' : ''}">${pos}</b>` : ''}${move(item.st)}</div>
  <a class="pic" href="${href}" tabindex="-1" aria-hidden="true"><img src="${esc(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer"></a>
  <div class="info">
    <a class="ttl" href="${href}">${esc(item.title)}</a>
    <p class="by">${esc(who)}${item.genres.length ? `<span class="gs">${item.genres.slice(0, 4).map((g) => esc(g.name)).join(' / ')}</span>` : ''}</p>
    <p class="facts">${facts(item)}</p>
  </div>
  <div class="buy">
    <p class="yen">${item.price != null ? `${num(item.price)}<small>円</small>` : esc(item.priceText)}${item.off ? `<s>${num(item.listPrice)}円</s>` : ''}</p>
    <p class="bd">${badges(item)}</p>
  </div>
</li>`;
}

export const list = (floor, items, posFn) =>
  `<ol class="list">${items.map((it, i) => row(floor, it, posFn ? posFn(it, i) : null)).join('\n')}</ol>`;

// 小さめのカード（トップ・関連作品用）
export function tile(floor, item, pos) {
  return `<a class="tile" href="${itemPath(floor, item)}" ${dataAttrs(item)}>
  <span class="tpic"><img src="${esc(item.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">${pos ? `<b class="n${pos <= 3 ? ' top' : ''}">${pos}</b>` : ''}</span>
  <span class="tttl">${esc(item.title)}</span>
  <span class="tmeta"><span class="yen">${item.price != null ? `${num(item.price)}<small>円</small>` : esc(item.priceText)}</span>${move(item.st)}${item.st?.isLowest ? '<span class="badge low">最安値</span>' : item.off ? `<span class="badge off">${item.off}%OFF</span>` : ''}</span>
</a>`;
}
export const tiles = (floor, items, ranked) => `<div class="tiles">${items.map((it, i) => tile(floor, it, ranked ? i + 1 : 0)).join('')}</div>`;

export function tabs(floor, views, active) {
  return `<nav class="tabs" aria-label="${esc(floor.label)}の一覧">${views
    .map((v) => `<a href="/${floor.slug}/${v.path}"${v.key === active ? ' aria-current="page"' : ''}>${esc(v.label)}<small>${v.count}</small></a>`)
    .join('')}</nav>`;
}

export const tools = (opts = {}) => `<div class="tools" data-tools>
  <label>並び替え
    <select data-sort>
      <option value="">${esc(opts.defaultLabel || '標準')}</option>
      <option value="price">価格が安い順</option>
      <option value="off">割引率が高い順</option>
      <option value="rev">評価が高い順</option>
      ${opts.ppp ? '<option value="ppp">1ページあたりが安い順</option>' : ''}
    </select>
  </label>
  <button type="button" data-f="rev45">★4.5以上</button>
  <button type="button" data-f="u1000">1,000円以下</button>
  <button type="button" data-f="sale">割引中</button>
  <span class="ng-note" data-ng-note hidden></span>
</div>`;

export const genreChips = (floor, genres) =>
  genres.length
    ? `<details class="genres"><summary>ジャンルで絞る</summary><div class="chips">${genres.map((g) => `<a href="/${floor.slug}/genre/${safeId(g.id)}/">${esc(g.name)}<small>${g.count}</small></a>`).join('')}</div></details>`
    : '';

// 折れ線（順位は小さいほど上、価格は高いほど上）
export function chart(series, days, { invert = false, unit = '', w = 520, h = 120 } = {}) {
  const pts = series.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return '<p class="chart-empty">記録が2日分たまるとグラフが表示されます。</p>';
  const vals = pts.map(([, v]) => v);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const px = 8, py = 14;
  const X = (i) => px + (i / Math.max(1, series.length - 1)) * (w - px * 2);
  const Y = (v) => {
    const t = (v - min) / (max - min);
    return py + (invert ? t : 1 - t) * (h - py * 2);
  };
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  const [li, lv] = pts.at(-1);
  const top = invert ? Math.min(...vals) : Math.max(...vals);
  const bottom = invert ? Math.max(...vals) : Math.min(...vals);
  return `<figure class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="推移グラフ"><line x1="${px}" x2="${w - px}" y1="${py}" y2="${py}" class="grid"/><line x1="${px}" x2="${w - px}" y1="${h - py}" y2="${h - py}" class="grid"/><path d="${d}" class="line"/><circle cx="${X(li).toFixed(1)}" cy="${Y(lv).toFixed(1)}" r="4" class="dot"/></svg><figcaption><span>${esc(days[pts[0][0]])}</span><span>上端 ${num(top)}${unit} ／ 下端 ${num(bottom)}${unit}</span><span>${esc(days.at(-1))}</span></figcaption></figure>`;
}

export function itemBody(floor, item, genrePageIds, related, days) {
  const st = item.st;
  const genres = item.genres
    .map((g) => (genrePageIds.has(g.id) ? `<a href="/${floor.slug}/genre/${safeId(g.id)}/">${esc(g.name)}</a>` : `<span>${esc(g.name)}</span>`))
    .join('');
  const cta = `<a class="cta" href="${esc(item.url)}" ${out}>FANZAで作品ページを見る<small>サンプル・レビューの全文はこちら</small></a>`;
  const stat = (label, value, sub = '') => (value ? `<div><dt>${label}</dt><dd>${value}${sub ? `<small>${sub}</small>` : ''}</dd></div>` : '');
  const dl = (k, v) => (v ? `<div><dt>${k}</dt><dd>${v}</dd></div>` : '');
  return `<nav class="crumbs"><a href="/">ホーム</a><i>/</i><a href="/${floor.slug}/">${esc(floor.label)}</a></nav>
<article class="item" ${dataAttrs(item)}>
  <div class="item-head">
    <a class="cover" href="${esc(item.url)}" ${out}><img src="${esc(item.image)}" alt="${esc(item.title)}" referrerpolicy="no-referrer"></a>
    <div class="item-side">
      <h1>${esc(item.title)}</h1>
      <p class="by">${esc([...item.makers, ...item.authors].join('、'))}</p>
      <p class="yen big">${item.price != null ? `${num(item.price)}<small>円</small>` : esc(item.priceText)}${item.off ? `<s>${num(item.listPrice)}円</s>` : ''}</p>
      <p class="bd">${badges(item)}</p>
      <dl class="stats">
        ${stat('現在の順位', st.rank != null ? `${st.rank}<small>位</small> ${move(st)}` : '<span class="muted">圏外</span>')}
        ${stat('記録上の最安値', st.low ? `${num(st.low[0])}<small>円</small>` : '', st.low ? `（${st.low[1]}）` : '')}
        ${stat('評価', item.review ? `★${item.review.average.toFixed(2)}` : '', item.review ? `（${num(item.review.count)}件）` : '')}
        ${stat('1ページあたり', item.ppp ? `${item.ppp.toFixed(1)}<small>円</small>` : '', item.pages ? `（${item.pages}ページ）` : '')}
      </dl>
      ${cta}
      <p class="note">価格と順位は ${esc(days.at(-1) || '')} の取得時点のものです。最新の情報はリンク先でご確認ください。</p>
    </div>
  </div>

  <section class="charts">
    <div><h2>価格の推移</h2>${chart(st.priceSeries, days, { unit: '円' })}</div>
    <div><h2>順位の推移</h2>${chart(st.rankSeries, days, { invert: true, unit: '位' })}</div>
  </section>

  <section>
    <h2>作品情報</h2>
    <dl class="spec">
      ${dl('サークル・メーカー', esc(item.makers.join('、')))}
      ${dl('作者', esc(item.authors.join('、')))}
      ${dl('シリーズ', esc(item.series.join('、')))}
      ${dl('配信開始日', esc(item.date))}
      ${dl('ボリューム', esc(item.volume))}
      ${genres ? `<div><dt>ジャンル</dt><dd class="chips">${genres}</dd></div>` : ''}
    </dl>
  </section>
  ${
    config.showSampleImages && item.samples.length
      ? `<section><h2>サンプル画像</h2><div class="samples">${item.samples.map((s) => `<img src="${esc(s)}" alt="${esc(item.title)} サンプル" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>${cta}</section>`
      : ''
  }
</article>
${related.length ? `<section><h2>近い作品</h2>${tiles(floor, related)}</section>` : ''}`;
}

export const articleList = (articles) =>
  `<ul class="articles">${articles
    .map((a) => `<li><a href="/articles/${a.slug}/"><time>${esc(a.date)}</time><strong>${esc(a.title)}</strong><span>${esc(a.description)}</span></a></li>`)
    .join('')}</ul>`;
