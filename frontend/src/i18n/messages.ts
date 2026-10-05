import type { RoundName, Series } from '@mlb/shared';

/**
 * The two supported UI languages. Japanese ('ja') is the default because the
 * site's own feature requests arrived in Japanese; English ('en') is the
 * secondary language.
 */
export type Lang = 'ja' | 'en';

export const LANGS: readonly Lang[] = ['ja', 'en'] as const;

/**
 * The flat message dictionary. Keys are dotted paths (string literals, not a
 * nested object) so lookups are a single map access and missing keys are easy
 * to spot. Values may contain `{param}` placeholders filled by {@link t}.
 *
 * NOTE: team club names (TEAMS[id].name) are intentionally shown in English in
 * BOTH languages - official MLB club names are commonly rendered in English on
 * Japanese-language broadcasts/sites, and maintaining a parallel JA club-name
 * map is out of scope. Only the UI chrome and the unknown/preview-team fallback
 * are localized here.
 */
export type MessageKey =
  | 'app.title'
  | 'app.logoAlt'
  | 'app.heroAlt'
  | 'app.subtitle.predictions'
  | 'app.subtitle.results'
  | 'app.season'
  | 'app.lang.group'
  | 'app.lang.ja'
  | 'app.lang.en'
  | 'app.theme.group'
  | 'app.theme.system'
  | 'app.theme.light'
  | 'app.theme.dark'
  | 'app.loading'
  | 'app.notStarted'
  | 'app.offlineNotice'
  | 'app.footer'
  | 'results.title'
  | 'results.hint'
  | 'bracket.region'
  | 'bracket.gridLabel'
  | 'bracket.legend.al'
  | 'bracket.legend.ws'
  | 'bracket.legend.nl'
  | 'series.region'
  | 'series.cardLabel'
  | 'series.bestOf'
  | 'series.showGames'
  | 'series.hideGames'
  | 'series.viewDetail'
  | 'series.predict'
  | 'series.selected'
  | 'series.vsLabel'
  | 'standings.title'
  | 'standings.region'
  | 'standings.al'
  | 'standings.nl'
  | 'standings.champion'
  | 'standings.out'
  | 'standings.active'
  | 'favorites.add'
  | 'favorites.remove'
  | 'favorites.marker'
  | 'favorites.badge'
  | 'favorites.eliminated'
  | 'favorites.champion'
  | 'favorites.header.title'
  | 'favorites.header.status.leading'
  | 'favorites.header.status.trailing'
  | 'favorites.header.status.tied'
  | 'favorites.header.status.inProgress'
  | 'favorites.header.status.scheduled'
  | 'favorites.header.status.nextGame'
  | 'favorites.filter.label'
  | 'favorites.filter.empty'
  | 'prediction.region'
  | 'prediction.title'
  | 'prediction.idleHint'
  | 'prediction.loading'
  | 'prediction.errorPrefix'
  | 'prediction.favorite'
  | 'prediction.winProbability'
  | 'prediction.over'
  | 'prediction.model'
  | 'prediction.accuracy.label'
  | 'prediction.accuracy.help'
  | 'prediction.accuracy.value'
  | 'prediction.accuracy.conservative'
  | 'prediction.accuracy.aggressive'
  | 'prediction.model.selectLabel'
  | 'prediction.metrics.title'
  | 'prediction.metrics.winPct'
  | 'prediction.metrics.unknown'
  | 'prediction.metrics.team'
  | 'integrity.banner'
  | 'refresh.lastUpdated'
  | 'refresh.button'
  | 'refresh.updating'
  | 'refresh.error'
  | 'detail.breadcrumb'
  | 'detail.back'
  | 'detail.return'
  | 'detail.loading'
  | 'detail.notFound.title'
  | 'detail.notFound.hint'
  | 'detail.notFound.region'
  | 'detail.region'
  | 'detail.vs'
  | 'detail.wonSeries'
  | 'detail.seriesScore'
  | 'detail.gameByGame'
  | 'detail.game'
  | 'detail.at'
  | 'detail.noGames'
  | 'gametime.tbd'
  | 'gametime.startLabel'
  | 'ics.add'
  | 'ics.ariaLabel'
  | 'upcoming.title'
  | 'upcoming.region'
  | 'upcoming.today'
  | 'upcoming.tomorrow'
  | 'upcoming.countdown'
  | 'upcoming.vs'
  | 'round.wildCard'
  | 'round.divisionSeries'
  | 'round.championshipSeries'
  | 'round.worldSeries'
  | 'status.scheduled'
  | 'status.in_progress'
  | 'status.final'
  | 'team.unknown'
  | 'accuracy.nav'
  | 'accuracy.pageTitle'
  | 'accuracy.intro'
  | 'accuracy.region'
  | 'accuracy.metric.hitRate'
  | 'accuracy.metric.hitRate.def'
  | 'accuracy.metric.brier'
  | 'accuracy.metric.brier.def'
  | 'accuracy.metric.calibration'
  | 'accuracy.metric.calibration.def'
  | 'accuracy.definitionsTitle'
  | 'accuracy.table.accuracy'
  | 'accuracy.table.sampleCount'
  | 'accuracy.table.season'
  | 'accuracy.table.hitRate'
  | 'accuracy.table.brier'
  | 'accuracy.season.combined'
  | 'accuracy.sliderCompareTitle'
  | 'accuracy.sliderCompareSummary'
  | 'accuracy.calibrationTitle'
  | 'accuracy.calibrationSummary'
  | 'accuracy.calibration.bucket'
  | 'accuracy.calibration.predicted'
  | 'accuracy.calibration.empirical'
  | 'accuracy.calibration.count'
  | 'accuracy.calibration.empty'
  | 'accuracy.calibration.binLabel'
  | 'accuracy.backToBracket'
  | 'accuracy.methodology'
  | 'accuracy.decidingGameCaveat';

export const MESSAGES: Record<Lang, Record<MessageKey, string>> = {
  en: {
    'app.title': 'MLB Postseason Pulse',
    'app.logoAlt': 'MLB Postseason Pulse logo',
    'app.heroAlt': 'Baseball diamond at dusk',
    'app.subtitle.predictions':
      '{season} postseason bracket, standings, and AI predictions',
    'app.subtitle.results':
      '{season} postseason bracket, standings, and final results',
    'app.season': 'Season',
    'app.lang.group': 'Language',
    'app.lang.ja': '日本語',
    'app.lang.en': 'English',
    'app.theme.group': 'Theme',
    'app.theme.system': 'System',
    'app.theme.light': 'Light',
    'app.theme.dark': 'Dark',
    'app.loading': 'Loading the {season} postseason…',
    'app.notStarted':
      'The {season} postseason has not started yet. Check back once the games begin.',
    'app.offlineNotice':
      'Showing bundled offline data (the live API was unreachable).',
    'app.footer':
      'Data from the public MLB Stats API with bundled 2024 and 2025 seed fallbacks. Built for the Kiro University challenge.',
    'results.title': 'Final results',
    'results.hint':
      'The {season} postseason is complete. Final results are shown on the bracket; AI predictions are available only for the current season.',
    'bracket.region': 'Postseason bracket',
    'bracket.gridLabel':
      'Postseason bracket series. Use the arrow keys to move between series, and press Enter to open a finished series or select a series to predict.',
    'bracket.legend.al': 'American League',
    'bracket.legend.ws': 'World Series',
    'bracket.legend.nl': 'National League',
    'series.region': '{high} versus {low}',
    'series.cardLabel': '{high} versus {low}, {status}, best of {bestOf}, {highWins}–{lowWins}',
    'series.bestOf': 'Best of {bestOf} · {highWins}–{lowWins}',
    'series.showGames': 'Show games',
    'series.hideGames': 'Hide games',
    'series.viewDetail': 'View series detail',
    'series.predict': 'Predict winner',
    'series.selected': 'Selected for prediction',
    'series.vsLabel': 'versus',
    'standings.title': 'Standings',
    'standings.region': 'Postseason standings',
    'standings.al': 'American League',
    'standings.nl': 'National League',
    'standings.champion': 'Champion',
    'standings.out': 'Out ({round})',
    'standings.active': 'Active ({round})',
    'favorites.add': 'Add {team} to favorites',
    'favorites.remove': 'Remove {team} from favorites',
    'favorites.marker': "Favorite team's series",
    'favorites.badge': 'Favorite',
    'favorites.eliminated': 'Eliminated',
    'favorites.champion': 'Champion',
    'favorites.header.title': 'Your teams',
    'favorites.header.status.leading': '{round}, leading {wins}-{losses}',
    'favorites.header.status.trailing': '{round}, trailing {wins}-{losses}',
    'favorites.header.status.tied': '{round}, tied {wins}-{losses}',
    'favorites.header.status.inProgress': '{round}, {wins}-{losses}',
    'favorites.header.status.scheduled': '{round}, starts soon',
    'favorites.header.status.nextGame': 'Next game {time}',
    'favorites.filter.label': 'Show only my teams',
    'favorites.filter.empty':
      'None of your favorite teams have a series in this bracket.',
    'prediction.region': 'Win/loss prediction',
    'prediction.title': 'AI Prediction',
    'prediction.idleHint':
      'Select a series from the bracket to see an AI-generated win/loss prediction.',
    'prediction.loading': 'Generating prediction…',
    'prediction.errorPrefix': 'Could not load prediction: {message}',
    'prediction.favorite': 'Favorite',
    'prediction.winProbability': 'Win probability',
    'prediction.over': 'over {team}',
    'prediction.model': 'Model: {model}',
    'prediction.accuracy.label': 'Model accuracy',
    'prediction.accuracy.help':
      'Higher accuracy sharpens the prediction toward the favorite (more confident); lower accuracy softens it toward a coin flip. The probability always stays between 50% and 95%.',
    'prediction.accuracy.value': 'Accuracy: {value}',
    'prediction.accuracy.conservative': 'Conservative',
    'prediction.accuracy.aggressive': 'Confident',
    'prediction.model.selectLabel': 'AI model',
    'prediction.metrics.title': 'Prediction basis',
    'prediction.metrics.winPct': 'Regular-season win %',
    'prediction.metrics.unknown': 'Not available',
    'prediction.metrics.team': '{team}: {pct}',
    'integrity.banner':
      'Data integrity: {count} finished matchup(s) still reference an undetermined team.',
    'refresh.lastUpdated': 'Last updated: {relative}',
    'refresh.button': 'Refresh',
    'refresh.updating': 'Updating…',
    'refresh.error': 'Could not refresh - showing the last loaded data.',
    'detail.breadcrumb': 'Breadcrumb',
    'detail.back': '← Back to the {season} bracket',
    'detail.return': 'Return to the {season} bracket',
    'detail.loading': 'Loading series detail…',
    'detail.notFound.title': 'Series not found',
    'detail.notFound.hint':
      'We could not find a series with id “{seriesId}” in the {season} postseason.',
    'detail.notFound.region': 'Series not found',
    'detail.region': '{high} versus {low} detail',
    'detail.vs': 'vs',
    'detail.wonSeries': 'won the series {hi}–{lo}',
    'detail.seriesScore': 'Series {hi}–{lo} · Best of {bestOf}',
    'detail.gameByGame': 'Game by game',
    'detail.game': 'Game {n}',
    'detail.at': '@',
    'detail.noGames': 'No game detail is available for this series.',
    'gametime.tbd': 'Time TBD',
    'gametime.startLabel': 'First pitch',
    'ics.add': 'Add to calendar',
    'ics.ariaLabel': 'Add {matchup} ({time}) to your calendar',
    'upcoming.title': "Today's and tomorrow's games",
    'upcoming.region': "Today's and tomorrow's games",
    'upcoming.today': 'Today',
    'upcoming.tomorrow': 'Tomorrow',
    'upcoming.countdown': 'Starts in {days}d {hours}h {minutes}m',
    'upcoming.vs': 'vs',
    'round.wildCard': 'Wild Card',
    'round.divisionSeries': 'Division Series',
    'round.championshipSeries': 'Championship Series',
    'round.worldSeries': 'World Series',
    'status.scheduled': 'Scheduled',
    'status.in_progress': 'In progress',
    'status.final': 'Final',
    // Unknown/preview team ids (not in the TEAMS map) must NEVER leak a raw
    // "Team <id>" string; show a clear placeholder instead.
    'team.unknown': 'TBD (#{id})',
    'accuracy.nav': 'Model accuracy',
    'accuracy.pageTitle': 'Model accuracy / backtest',
    'accuracy.intro':
      'How well did the deterministic prediction model call completed series? These metrics are computed entirely in your browser by replaying the bundled 2024 and 2025 postseason seed data through the model. No backend, no network, and no Amazon Bedrock call is involved — the numbers are fully deterministic.',
    'accuracy.region': 'Model accuracy and backtest results',
    'accuracy.metric.hitRate': 'Hit rate',
    'accuracy.metric.hitRate.def':
      'The fraction of game-by-game snapshots where the team the model favored turned out to be the eventual series winner. Higher is better; range 0 to 1.',
    'accuracy.metric.brier': 'Brier score',
    'accuracy.metric.brier.def':
      'The mean squared error between the predicted probability of the eventual series winner and 1. Range 0 to 1, lower is better, and 0 is a perfect score.',
    'accuracy.metric.calibration': 'Calibration',
    'accuracy.metric.calibration.def':
      'Groups predictions into probability buckets and compares the mean predicted probability in each bucket to the actual win rate observed in that bucket. A well-calibrated model has predicted and empirical rates that match.',
    'accuracy.definitionsTitle': 'Metric definitions',
    'accuracy.table.accuracy': 'Accuracy',
    'accuracy.table.sampleCount': 'Samples',
    'accuracy.table.season': 'Season',
    'accuracy.table.hitRate': 'Hit rate',
    'accuracy.table.brier': 'Brier score',
    'accuracy.season.combined': 'Combined',
    'accuracy.sliderCompareTitle': 'Comparison across accuracy settings',
    'accuracy.sliderCompareSummary':
      'Hit rate and Brier score for each accuracy setting ({accuracies}) across the 2024 season, the 2025 season, and the two combined.',
    'accuracy.calibrationTitle': 'Calibration (accuracy {accuracy}, combined 2024 + 2025)',
    'accuracy.calibrationSummary':
      'Per-bucket calibration at accuracy {accuracy}: each row shows the favorite-probability bucket, how many predictions fell in it, the mean predicted probability, and the empirical win rate.',
    'accuracy.calibration.bucket': 'Probability bucket',
    'accuracy.calibration.predicted': 'Mean predicted',
    'accuracy.calibration.empirical': 'Empirical win rate',
    'accuracy.calibration.count': 'Predictions',
    'accuracy.calibration.empty': 'No predictions',
    'accuracy.calibration.binLabel':
      'Bucket {lower} to {upper}: {count} predictions, mean predicted {predicted}, empirical win rate {empirical}.',
    'accuracy.backToBracket': '← Back to the bracket',
    'accuracy.methodology':
      'Methodology: for each completed series the model predicts at the end of every game (game 1, game 2, and so on), using only the games played so far. Each prediction is scored against the team that actually won the series. The favorite probability is always clamped to the 50%–95% range the model emits.',
    'accuracy.decidingGameCaveat':
      'Caveat: each series includes a snapshot taken at the end of every game, including the final, already-decided game. That last snapshot is a settled outcome rather than a prediction, so the headline hit rate includes decided results and overstates mid-series predictive skill.',
  },
  ja: {
    'app.title': 'MLB Postseason Pulse',
    'app.logoAlt': 'MLB Postseason Pulse のロゴ',
    'app.heroAlt': '夕暮れの野球場',
    'app.subtitle.predictions':
      '{season}年ポストシーズンのトーナメント表・順位・AI予測',
    'app.subtitle.results':
      '{season}年ポストシーズンのトーナメント表・順位・最終結果',
    'app.season': 'シーズン',
    'app.lang.group': '言語',
    'app.lang.ja': '日本語',
    'app.lang.en': 'English',
    'app.theme.group': 'テーマ',
    'app.theme.system': 'システム',
    'app.theme.light': 'ライト',
    'app.theme.dark': 'ダーク',
    'app.loading': '{season}年のポストシーズンを読み込み中…',
    'app.notStarted':
      '{season}年のポストシーズンはまだ始まっていません。試合開始後にまたご確認ください。',
    'app.offlineNotice':
      'オフラインの収録データを表示しています（ライブAPIに接続できませんでした）。',
    'app.footer':
      '公開されているMLB Stats APIと、2024・2025年の収録データを利用しています。Kiro University チャレンジ向けに制作。',
    'results.title': '最終結果',
    'results.hint':
      '{season}年のポストシーズンは終了しました。最終結果をトーナメント表に表示しています。AI予測は現在のシーズンのみ利用できます。',
    'bracket.region': 'ポストシーズンのトーナメント表',
    'bracket.gridLabel':
      'ポストシーズンのトーナメント表のシリーズ一覧。矢印キーでシリーズ間を移動し、Enterキーで終了したシリーズを開くか、予測するシリーズを選択します。',
    'bracket.legend.al': 'アメリカンリーグ',
    'bracket.legend.ws': 'ワールドシリーズ',
    'bracket.legend.nl': 'ナショナルリーグ',
    'series.region': '{high} 対 {low}',
    'series.cardLabel': '{high} 対 {low}、{status}、{bestOf}試合制、{highWins}–{lowWins}',
    'series.bestOf': '{bestOf}試合制 · {highWins}–{lowWins}',
    'series.showGames': '試合を表示',
    'series.hideGames': '試合を隠す',
    'series.viewDetail': 'シリーズ詳細を見る',
    'series.predict': '勝者を予測',
    'series.selected': '予測対象に選択中',
    'series.vsLabel': '対',
    'standings.title': '順位',
    'standings.region': 'ポストシーズンの順位',
    'standings.al': 'アメリカンリーグ',
    'standings.nl': 'ナショナルリーグ',
    'standings.champion': '優勝',
    'standings.out': '敗退（{round}）',
    'standings.active': '勝ち残り（{round}）',
    'favorites.add': '{team}をお気に入りに追加',
    'favorites.remove': '{team}をお気に入りから外す',
    'favorites.marker': 'お気に入りチームのシリーズ',
    'favorites.badge': 'お気に入り',
    'favorites.eliminated': '敗退',
    'favorites.champion': '優勝',
    'favorites.header.title': 'あなたのチーム',
    'favorites.header.status.leading': '{round}、{wins}-{losses}でリード',
    'favorites.header.status.trailing': '{round}、{wins}-{losses}でビハインド',
    'favorites.header.status.tied': '{round}、{wins}-{losses}で五分',
    'favorites.header.status.inProgress': '{round}、{wins}-{losses}',
    'favorites.header.status.scheduled': '{round}、まもなく開始',
    'favorites.header.status.nextGame': '次の試合 {time}',
    'favorites.filter.label': 'お気に入りのチームだけ表示',
    'favorites.filter.empty':
      'お気に入りのチームのシリーズはこのトーナメント表にありません。',
    'prediction.region': '勝敗予測',
    'prediction.title': 'AI予測',
    'prediction.idleHint':
      'トーナメント表からシリーズを選ぶと、AIによる勝敗予測が表示されます。',
    'prediction.loading': '予測を生成中…',
    'prediction.errorPrefix': '予測を読み込めませんでした: {message}',
    'prediction.favorite': '優勢',
    'prediction.winProbability': '勝利確率',
    'prediction.over': '対 {team}',
    'prediction.model': 'モデル: {model}',
    'prediction.accuracy.label': 'モデル精度',
    'prediction.accuracy.help':
      '精度を上げると予測は優勢チーム寄りに鋭くなり（より自信を持った予測）、下げると五分五分に近づきます。確率は常に50%〜95%の範囲に収まります。',
    'prediction.accuracy.value': '精度: {value}',
    'prediction.accuracy.conservative': '控えめ',
    'prediction.accuracy.aggressive': '強気',
    'prediction.model.selectLabel': 'AIモデル',
    'prediction.metrics.title': '予測の根拠',
    'prediction.metrics.winPct': 'レギュラーシーズン勝率',
    'prediction.metrics.unknown': 'データなし',
    'prediction.metrics.team': '{team}: {pct}',
    'integrity.banner':
      'データ整合性: 終了した{count}件の対戦が未確定のチームを参照しています。',
    'refresh.lastUpdated': '最終更新: {relative}',
    'refresh.button': '更新',
    'refresh.updating': '更新中…',
    'refresh.error': '更新できませんでした。直前のデータを表示しています。',
    'detail.breadcrumb': 'パンくずリスト',
    'detail.back': '← {season}年のトーナメント表に戻る',
    'detail.return': '{season}年のトーナメント表に戻る',
    'detail.loading': 'シリーズ詳細を読み込み中…',
    'detail.notFound.title': 'シリーズが見つかりません',
    'detail.notFound.hint':
      '{season}年のポストシーズンに ID「{seriesId}」のシリーズは見つかりませんでした。',
    'detail.notFound.region': 'シリーズが見つかりません',
    'detail.region': '{high} 対 {low} の詳細',
    'detail.vs': '対',
    'detail.wonSeries': 'がシリーズを {hi}–{lo} で制しました',
    'detail.seriesScore': 'シリーズ {hi}–{lo} · {bestOf}試合制',
    'detail.gameByGame': '試合ごとの詳細',
    'detail.game': '第{n}戦',
    'detail.at': '@',
    'detail.noGames': 'このシリーズの試合詳細はありません。',
    'gametime.tbd': '時刻未定',
    'gametime.startLabel': '試合開始',
    'ics.add': 'カレンダーに追加',
    'ics.ariaLabel': '{matchup}（{time}）をカレンダーに追加',
    'upcoming.title': '今日・明日の試合',
    'upcoming.region': '今日・明日の試合',
    'upcoming.today': '今日',
    'upcoming.tomorrow': '明日',
    'upcoming.countdown': 'あと {days}日 {hours}時間 {minutes}分',
    'upcoming.vs': '対',
    'round.wildCard': 'ワイルドカード',
    'round.divisionSeries': '地区シリーズ',
    'round.championshipSeries': 'リーグ優勝決定シリーズ',
    'round.worldSeries': 'ワールドシリーズ',
    'status.scheduled': '開始前',
    'status.in_progress': '進行中',
    'status.final': '終了',
    // 未知／プレビューのチームID（TEAMSマップに無い）で生の "Team <id>" を
    // 絶対に表示しないためのプレースホルダー。
    'team.unknown': '未定 (#{id})',
    'accuracy.nav': 'モデル精度',
    'accuracy.pageTitle': 'モデル精度 / バックテスト',
    'accuracy.intro':
      '決定論的な予測モデルは、終了したシリーズをどれだけ正しく当てられたのでしょうか。これらの指標は、収録済みの2024・2025年ポストシーズンのシードデータをモデルで再生して、すべてブラウザー内で算出しています。バックエンドもネットワークも、Amazon Bedrock の呼び出しも一切使いません。数値は完全に決定論的です。',
    'accuracy.region': 'モデル精度とバックテスト結果',
    'accuracy.metric.hitRate': '的中率',
    'accuracy.metric.hitRate.def':
      '試合ごとのスナップショットのうち、モデルが優勢とみなしたチームが最終的にシリーズを制した割合です。高いほど良く、範囲は0〜1です。',
    'accuracy.metric.brier': 'ブライアスコア',
    'accuracy.metric.brier.def':
      '最終的なシリーズ勝者に対して予測した確率と1との平均二乗誤差です。範囲は0〜1で、低いほど良く、0が完璧なスコアです。',
    'accuracy.metric.calibration': 'キャリブレーション',
    'accuracy.metric.calibration.def':
      '予測を確率のバケットにグループ分けし、各バケットの平均予測確率と、そのバケットで実際に観測された勝率を比較します。よく較正されたモデルでは、予測確率と実測勝率が一致します。',
    'accuracy.definitionsTitle': '指標の定義',
    'accuracy.table.accuracy': '精度',
    'accuracy.table.sampleCount': 'サンプル数',
    'accuracy.table.season': 'シーズン',
    'accuracy.table.hitRate': '的中率',
    'accuracy.table.brier': 'ブライアスコア',
    'accuracy.season.combined': '合算',
    'accuracy.sliderCompareTitle': '精度設定ごとの比較',
    'accuracy.sliderCompareSummary':
      '各精度設定（{accuracies}）における、2024年・2025年・両シーズン合算の的中率とブライアスコアです。',
    'accuracy.calibrationTitle': 'キャリブレーション（精度 {accuracy}、2024 + 2025 合算）',
    'accuracy.calibrationSummary':
      '精度 {accuracy} でのバケットごとのキャリブレーション: 各行は優勢確率のバケット、その中に入った予測数、平均予測確率、実測勝率を示します。',
    'accuracy.calibration.bucket': '確率バケット',
    'accuracy.calibration.predicted': '平均予測',
    'accuracy.calibration.empirical': '実測勝率',
    'accuracy.calibration.count': '予測数',
    'accuracy.calibration.empty': '予測なし',
    'accuracy.calibration.binLabel':
      'バケット {lower}〜{upper}: 予測数 {count}、平均予測 {predicted}、実測勝率 {empirical}。',
    'accuracy.backToBracket': '← トーナメント表に戻る',
    'accuracy.methodology':
      '手法: 終了した各シリーズについて、モデルは毎試合の終了時点（第1戦、第2戦…）で、それまでに行われた試合だけを使って予測します。各予測は実際にシリーズを制したチームに対して採点されます。優勢確率は常にモデルが出力する50%〜95%の範囲にクランプされます。',
    'accuracy.decidingGameCaveat':
      '注意: 各シリーズには毎試合の終了時点のスナップショットが含まれ、これにはすでに勝敗が決した最終戦も含まれます。その最終スナップショットは予測ではなく確定した結果のため、ヘッドラインの的中率は確定済みの結果を含んでおり、シリーズ途中の予測能力を実際より高く見せています。',
  },
};

/** Maps a canonical RoundName to its message key. */
export const ROUND_KEY: Record<RoundName, MessageKey> = {
  'Wild Card': 'round.wildCard',
  'Division Series': 'round.divisionSeries',
  'Championship Series': 'round.championshipSeries',
  'World Series': 'round.worldSeries',
};

/** Maps a Series status to its message key. */
export const STATUS_KEY: Record<Series['status'], MessageKey> = {
  scheduled: 'status.scheduled',
  in_progress: 'status.in_progress',
  final: 'status.final',
};
