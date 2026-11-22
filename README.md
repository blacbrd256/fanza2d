# fanza2d

FANZA の2次元作品（同人・コミック・PCゲーム・アニメ）を紹介する、自動更新の静的アフィリエイトサイト。

- `content/` の記事（Markdown）と、DMM Webサービス API から取得した作品データから `dist/` に HTML を生成
- API の ID が未設定でもビルドでき、その場合は記事と固定ページだけのサイトになる（審査申請用）
- ID を設定すると、ランキング・新着・セール・ジャンル別・作品個別ページが自動で追加される

## 使い方

```bash
npm install
npm run build   # dist/ に生成（環境変数が無ければ記事のみ）
npm run demo    # ダミー作品データでレイアウト確認
npm run serve   # http://localhost:4173 で dist/ を確認
```

## 公開までの流れ

### 1. サイト設定を書き換える

`site.config.mjs` の `name`（サイト名）・`operator`（運営者名）を決める。URL と問い合わせ先は環境変数でも設定できる。

### 2. Cloudflare Pages にデプロイ

Cloudflare ダッシュボード → Workers & Pages → Create → Pages → このリポジトリを接続。

| 項目 | 値 |
| --- | --- |
| Build command | `npm run build` |
| Build output directory | `dist` |

環境変数（Settings → Variables and Secrets）:

| 変数 | 内容 | 設定時期 |
| --- | --- | --- |
| `SITE_URL` | 公開URL（例 `https://xxxx.pages.dev`、末尾スラッシュなし） | 最初から |
| `CONTACT_URL` | お問い合わせ先URL（Googleフォーム等） | 最初から |
| `DMM_API_ID` | Webサービスの API ID | 審査通過後 |
| `DMM_AFFILIATE_ID` | API 用アフィリエイトID（末尾が `-990`〜`-999` のもの） | 審査通過後 |

### 3. アフィリエイト登録・サイト審査

記事と固定ページ（このサイトについて／プライバシーポリシー／お問い合わせ）が公開された状態の URL で申請する。
申請前に記事を自分の言葉で足しておくと内容が厚くなる（`content/articles/` に Markdown を追加するだけ）。

### 4. API 連携を有効化

審査通過後、API ID を発行して `DMM_API_ID` と `DMM_AFFILIATE_ID` を Cloudflare に登録し、再デプロイ。

### 5. 毎日自動更新

Cloudflare Pages の Settings → Builds → Deploy hooks でフックを作成し、その URL を GitHub の
Settings → Secrets and variables → Actions に `CF_DEPLOY_HOOK_URL` として登録する。
`.github/workflows/daily-deploy.yml` が毎朝 6:17（JST）に再ビルドを起動する。

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
src/templates.mjs   HTML テンプレート
content/articles/   ガイド記事
content/pages/      固定ページ
public/             CSS・年齢確認スクリプト
```

取得に失敗したフロアはスキップして残りでビルドする。全フロアが失敗した場合はビルド自体を失敗させ、公開中の前回ビルドをそのまま残す。
