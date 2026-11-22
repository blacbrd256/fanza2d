// サイト全体の設定。公開前に name / url / contactUrl を自分のものに書き換える。
export default {
  name: 'にじナビ',
  tagline: '2次元作品の人気ランキングと新着ガイド',
  description:
    '同人・コミック・PCゲーム・アニメなど2次元作品の人気ランキング、新着、セール情報を毎日更新。作品の選び方ガイドも掲載しています。',
  // 公開URL（末尾スラッシュなし）。Cloudflare Pages の環境変数 SITE_URL でも上書き可能。
  url: process.env.SITE_URL || 'https://example.pages.dev',
  operator: 'にじナビ編集部',
  // お問い合わせ先（Googleフォーム、X のプロフィールURLなど）。空なら「準備中」と表示。
  contactUrl: process.env.CONTACT_URL || '',

  // 取り扱うフロア。API でエラーになるフロアは自動でスキップされる。
  floors: [
    { slug: 'doujin', label: '同人', service: 'doujin', floor: 'digital_doujin' },
    { slug: 'comic', label: 'コミック', service: 'ebook', floor: 'comic' },
    { slug: 'pcgame', label: 'PCゲーム', service: 'pcgame', floor: 'digital_pcgame' },
    { slug: 'anime', label: 'アニメ', service: 'digital', floor: 'anime' },
  ],
  hits: 100, // 1リクエストの取得件数（最大100）
  genrePagesPerFloor: 20, // フロアごとに作るジャンルページ数
  showSampleImages: true, // 作品ページにサンプル画像を出すか
};
