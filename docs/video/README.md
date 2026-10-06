# docs/video 審査員向け動画アセット

このディレクトリには、[Kiro University Challenge](https://kiro.dev/2026/university/) 審査員向けの紹介動画を [NotebookLM](https://notebooklm.google/) で制作するための画像アセットと原稿が入っています。レッスンの実証内容は [DEMONSTRATED_LESSONS.md](../../DEMONSTRATED_LESSONS.md) を参照してください。

## 中身

### スライド画像（`docs/video/`、各 1920x1080 PNG）

SVG から生成したスライドです。元の SVG は `docs/video/slides/` にあります。

- `title-card.png`: タイトルカード（オープニングとクロージング）。
- `features-product.png`: プロダクト機能の紹介スライド。
- `lessons-overview.png`: 7 つの必須レッスンと 2 つのボーナスの概要。
- `architecture.png`: アーキテクチャとレッスン実証のハイライト。
- `bonus.png`: ボーナス A / B の紹介。

### アプリのスクリーンショット（`docs/video/screenshots/`、PNG）

実際に動作するアプリを Playwright で撮影したスクリーンショットです。

- `bracket-overview.png`: トップ画面のブラケット表示。
- `series-detail.png`: シリーズ詳細（試合単位の結果）。
- `ai-prediction.png`: Amazon Bedrock によるローカライズされた勝敗予測パネル。
- `dark-mode.png`: ダークモード表示。
- `favorites.png`: お気に入りチームの強調表示。

### 原稿

- `script.md`: 日本語・審査員向けのシーン別ナレーション台本（合計尺 177 秒、3 分の上限内）。NotebookLM での動画生成を想定しています。

## 生成方法

- **スライド:** `docs/video/slides/*.svg` を `scripts/render-slides.mjs`（`sharp` を使用）で SVG から PNG にラスタライズします。
- **アプリのスクリーンショット:** Playwright の専用スペック `frontend/e2e/video-shots.spec.ts` が、オフラインのシード/スタブ環境でアプリを描画し、各画面を PNG として撮影します。

## 再生成コマンド

リポジトリルートから実行します。

```bash
# スライド（SVG -> PNG）
node scripts/render-slides.mjs

# アプリのスクリーンショット（Playwright）
npm run shots -w frontend
```

## NotebookLM での使い方

1. `script.md` の各シーンに記載された画像ファイルを、番号順に並べてスライドデッキを組み立てます。
2. 画像一式と `script.md` を NotebookLM に読み込ませます。
3. 各シーンのナレーション欄を読み上げ台本として使い、尺（秒）を目安に動画を生成します。合計尺は 177 秒で、3 分の再生上限を満たしています。
