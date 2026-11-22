// サイト全体の設定。
export default {
  name: 'にじチャート',
  tagline: '2次元作品の順位と値動きを毎日記録',
  description:
    '同人・コミック・PCゲーム・アニメの人気順位と価格を毎日記録。前日からの順位変動、値下げ、過去最安値、1ページあたりの価格まで、数字で作品を選べます。',
  // 公開URL（末尾スラッシュなし）。Cloudflare Pages の環境変数 SITE_URL でも上書き可能。
  url: process.env.SITE_URL || 'https://example.pages.dev',
  operator: 'にじチャート編集部',
  // お問い合わせ先（Googleフォーム、X のプロフィールURLなど）。空なら「準備中」と表示。
  contactUrl: process.env.CONTACT_URL || '',

  // 取り扱うフロア。API でエラーになるフロアは自動でスキップされる。
  // unit: 'page' のフロアは「1ページあたりの価格」を計算する。
  floors: [
    { slug: 'doujin', label: '同人', service: 'doujin', floor: 'digital_doujin', unit: 'page' },
    { slug: 'comic', label: 'コミック', service: 'ebook', floor: 'comic', unit: 'page' },
    { slug: 'pcgame', label: 'PCゲーム', service: 'pcgame', floor: 'digital_pcgame' },
    { slug: 'anime', label: 'アニメ', service: 'digital', floor: 'anime' },
  ],
  hits: 100, // 1リクエストの取得件数（最大100）
  historyDays: 30, // 順位・価格を保持する日数
  genrePagesPerFloor: 24,
  showSampleImages: true,
};
