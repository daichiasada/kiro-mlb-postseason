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
  | 'app.loading'
  | 'app.notStarted'
  | 'app.offlineNotice'
  | 'app.footer'
  | 'results.title'
  | 'results.hint'
  | 'bracket.region'
  | 'bracket.legend.al'
  | 'bracket.legend.ws'
  | 'bracket.legend.nl'
  | 'series.region'
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
  | 'round.wildCard'
  | 'round.divisionSeries'
  | 'round.championshipSeries'
  | 'round.worldSeries'
  | 'status.scheduled'
  | 'status.in_progress'
  | 'status.final'
  | 'team.unknown';

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
    'bracket.legend.al': 'American League',
    'bracket.legend.ws': 'World Series',
    'bracket.legend.nl': 'National League',
    'series.region': '{high} versus {low}',
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
    'bracket.legend.al': 'アメリカンリーグ',
    'bracket.legend.ws': 'ワールドシリーズ',
    'bracket.legend.nl': 'ナショナルリーグ',
    'series.region': '{high} 対 {low}',
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
