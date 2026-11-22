# fanza2d

FANZA の2次元作品（同人・コミック・PCゲーム・アニメ）の**人気順位と価格を毎日記録**する静的アフィリエイトサイト「にじチャート」。

- 順位変動（前日比・初登場）、急上昇、値下げ・記録上の最安値、穴場の高評価、ページ単価の各一覧
- 作品ごとの価格推移・順位推移グラフ
- NGジャンル除外、並び替え・絞り込み（ブラウザ内で動作）
- `content/` の記事（Markdown）
- API の ID が未設定でもビルドでき、その場合は記事と固定ページだけのサイトになる（審査申請用）

履歴の保存先は持たず、ビルド時に公開中の `/data/history.json` を読んで今日の分を足す。
リポジトリの `data/history.json` はその控え。

## 使い方

```bash
npm install
npm run build   # dist/ に生成（環境変数が無ければ記事のみ）
npm run demo    # ダミー作品データでレイアウト確認
npm run serve   # http://localhost:4173 で dist/ を確認
```

## 運用の分担

日々の運用は Claude の定期実行が行う（手順は `CLAUDE.md`）。毎日、記事を1本追加してプッシュし、
そのプッシュで Cloudflare Pages が再ビルドされるので、ランキング・新着・セールも同時に最新になる。

人が行うのは、本人のアカウントが必要な次の3つだけ（いずれも一度きり）。

1. **Cloudflare Pages にこのリポジトリを接続する**
   Workers & Pages → Create → Pages → リポジトリを選択。Build command `npm run build`、出力ディレクトリ `dist`。
   プロジェクト名を `fanza2d` のままにすると、公開URLを Claude が自動で検出して設定する。
2. **公開されたURLでアフィリエイト登録・サイト審査を申請する**
3. **審査通過後、Cloudflare Pages の環境変数に2つの値を入れる**
   `DMM_API_ID`（Webサービスの API ID）と `DMM_AFFILIATE_ID`（末尾が `-990`〜`-999` の API 用ID）。
   次の日次更新から作品ページが自動で生成される。

任意: 環境変数 `CONTACT_URL` にお問い合わせフォームのURLを入れると、問い合わせ先として表示される。

## 記事の書き方

`content/articles/スラッグ.md`:

```markdown
---
title: 記事タイトル
date: 2026-11-22
description: 一覧と検索結果に出る説明文
floor: doujin
---

本文（Markdown）
```

`floor`（`doujin` / `comic` / `pcgame` / `anime`）は任意。指定すると記事の下にそのカテゴリの人気作品が表示される。

## 構成

```
site.config.mjs     サイト名・取り扱いフロアなどの設定
src/build.mjs       ビルド本体
src/dmm.mjs         DMM API クライアント
src/history.mjs     順位・価格の日次履歴
src/templates.mjs   HTML テンプレート
content/articles/   ガイド記事
content/pages/      固定ページ
public/             CSS・スクリプト（年齢確認、NGジャンル、並び替え）
data/               履歴の控え
```

取得に失敗したフロアはスキップして残りでビルドする。全フロアが失敗した場合はビルド自体を失敗させ、公開中の前回ビルドをそのまま残す。
