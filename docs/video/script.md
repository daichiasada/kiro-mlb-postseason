# 審査員向け紹介動画 原稿（NotebookLM 用）

**合計尺: 158 秒（2 分 38 秒）。3 分（180 秒）の上限内であることを確認済み（158 <= 180）。**

この原稿は [NotebookLM](https://notebooklm.google/) による動画生成を想定した、審査員向けのナレーション台本です。各シーンの「画面」欄には、このリポジトリにコミット済みの実際の PNG ファイルを指定しています。並び順どおりにスライドを組み立てれば、そのまま動画デッキになります。レッスンの正確な表現は [DEMONSTRATED_LESSONS.md](../../DEMONSTRATED_LESSONS.md) と [README.ja.md](../../README.ja.md) に準拠しています。

対象プロジェクト: **MLB ポストシーズン サマリーサイト**。React/Vite の SPA、AWS Lambda、DynamoDB、Amazon Bedrock、AWS CDK によるサーバーレスのフルスタック TypeScript アプリで、[Kiro University Challenge](https://kiro.dev/2026/university/) 最終試験への提出作品です。

---

## シーン一覧

| # | 画面（コミット済みファイル） | ナレーション（日本語） | 尺（秒） |
| - | ---------------------------- | ---------------------- | -------- |
| 1 | docs/video/title-card.png | MLB ポストシーズン サマリーサイト。Kiro University Challenge 最終試験への提出作品です。実機能を持つサーバーレスのフルスタック TypeScript アプリを、これからご紹介します。 | 10 |
| 2 | docs/video/screenshots/bracket-overview.png | トップ画面では、ワイルドカードからワールドシリーズまでのブラケットをグラフィカルに表示します。各シリーズのチーム、スコア、ステータスが一目で分かり、シーズンセレクターで 2024・2025・2026 を切り替えられます。進行中シーズンはライブ自動更新に対応します。 | 16 |
| 3 | docs/video/screenshots/series-detail.png | シリーズ詳細では、試合単位の結果をアコーディオンで展開します。イニングごとのラインスコア、勝利・敗戦・セーブ投手、球場、そしてハイライトのリンクまで、公開 MLB Stats API から組み立てて表示します。 | 15 |
| 4 | docs/video/screenshots/ai-prediction.png | 追加機能の勝敗予測です。勝率はコード内の決定論的モデルで算出し、Amazon Bedrock が選定理由を文章化します。ナラティブは UI 言語に合わせて英語と日本語にローカライズされ、Bedrock がエラーのときも決定論的フォールバックで必ず予測を返します。精度スライダーとモデルセレクターも備えています。 | 20 |
| 5 | docs/video/screenshots/dark-mode.png | ダークモードとアクセシビリティにも配慮しています。システム・ライト・ダークのテーマ切り替え、両テーマでの WCAG AA コントラスト、キーボード操作、スクリーンリーダー対応を実装し、axe による自動チェックで検証しています。 | 14 |
| 6 | docs/video/screenshots/favorites.png | お気に入りチーム機能では、応援するチームを登録すると、色だけに頼らない星アイコンと破線のボーダーでブラケット上に強調表示されます。ヘッダーのピンが各チームの状況を要約し、お気に入りだけを表示するフィルターも使えます。 | 14 |
| 7 | docs/video/lessons-overview.png | ここからは Kiro University の採点基準です。本プロジェクトは 7 つの必須レッスンと 2 つのボーナスを、すべて実在するファイルで実証しています。 | 9 |
| 8 | docs/video/architecture.png | 必須レッスンの実証です。1 仕様主導型開発は .kiro/specs の要件・設計・タスクが実装そのものを駆動します。2 運営文書は常時適用のステアリングファイル群。3 フックは保存時にテストや型チェックを走らせる Agent Hooks。4 プロパティベーステストは fast-check が予測モデルと集約の不変条件を検証します。 | 20 |
| 9 | docs/video/lessons-overview.png | 続く 3 つです。5 パワーは e2e テストに使った Playwright パワーと github-cli パワー。6 MCP は aws-docs と fetch の MCP サーバーを設定。7 カスタムエージェントは本プロジェクト専用の mlb-postseason-dev エージェントを定義しています。 | 16 |
| 10 | docs/video/bonus.png | ボーナスも 2 つ実証しています。ボーナス A は Kiro Web とクラウドセッションでの開発、およびクラウド構成。ボーナス B は、マニフェスト・ステアリング・スキル・MCP サーバー・README を含む自己完結型の Kiro Power をパッケージ化したことです。 | 14 |
| 11 | docs/video/title-card.png | 仕様・ステアリング・フック・テスト・パワー・MCP・カスタムエージェントのすべてを、動く成果物として示しました。ご覧いただきありがとうございました。 | 10 |

---

**合計尺の検算: 10 + 16 + 15 + 20 + 14 + 14 + 9 + 20 + 16 + 14 + 10 = 158 秒。** 30 秒以上 180 秒以下の範囲内で、3 分の上限を満たしています（158 <= 180）。

## NotebookLM での使い方

- 各シーンの「画面」欄は、このリポジトリにコミット済みの PNG を指しています。番号順に並べれば動画デッキになります。
- スライド系（title-card / lessons-overview / architecture / bonus / features-product）は `docs/video/` 直下、アプリのスクリーンショットは `docs/video/screenshots/` にあります。
- 画像とこの原稿を NotebookLM に読み込ませ、ナレーション欄のテキストをシーン順の読み上げ台本として利用してください。
- 詳しいアセットの説明と再生成コマンドは [README.md](./README.md) を参照してください。
