export interface ChangelogEntry {
  version: string;
  /** ISO 形式: YYYY-MM-DD（推奨）または YYYY-MM */
  date?: string;
  changes: string[];
}

/** 更新履歴の日付を表示用に整形（YYYY-MM-DD → 2026年6月4日） */
export function formatChangelogDate(date: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (full) {
    return `${Number(full[1])}年${Number(full[2])}月${Number(full[3])}日`;
  }
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(date);
  if (monthOnly) {
    return `${Number(monthOnly[1])}年${Number(monthOnly[2])}月`;
  }
  return date;
}

export const APP_CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.8.0",
    date: "2026-06-07",
    changes: [
      "GitHub Actions のデプロイ用秘密情報を 1Password から読み込むように変更",
      "1Password（保管庫 apps / アイテム MyRoom）の設定手順を README に追加",
    ],
  },
  {
    version: "1.7.2",
    date: "2026-06-07",
    changes: [
      "エアコンの設定温度を室温の表示・非表示と独立して切り替え可能に",
    ],
  },
  {
    version: "1.7.1",
    date: "2026-06-05",
    changes: [
      "表示時間範囲（日・週・月・年）を切り替えても、グラフで選択した日時を保持",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-06-04",
    changes: [
      "更新履歴の日付を年月日で表示（例: 2026年6月4日）",
      "環境グラフのセンサー・屋外気温の線を細く表示（1.5px）",
    ],
  },
  {
    version: "1.6.2",
    date: "2026-06-04",
    changes: [
      "Raspberry Pi エアコン収集で .env の Permission denied を修正（install.sh の所有者設定）",
    ],
  },
  {
    version: "1.6.1",
    date: "2026-06-03",
    changes: [
      "センサーカードの表示順をリロード後も保持",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-06-03",
    changes: [
      "SwitchBot センサーを複数台対応（CO2・防水温湿度計）",
      "新しい device_id は初回送信時に自動登録",
      "ダッシュボードが API のデバイス一覧からセンサーを表示",
    ],
  },
  {
    version: "1.5.1",
    date: "2026-05-31",
    changes: [
      "グラフを30秒ごとに自動更新して最新データを表示",
      "エアコン停止中は設定温度グラフを表示しない（補完なし）",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-05-31",
    changes: [
      "グラフの色を24色パレットから自由に設定",
      "エアコンの室温と設定温度を別々の色で設定可能に",
      "センサーカード・グラフ凡例の表示順を変更可能に",
      "エアコン停止時は設定温度の線と値を非表示",
      "エアコン設定温度グラフの表示不具合を修正",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-05-31",
    changes: [
      "最近の記録を複数センサー（リビング・寝室）対応",
      "エアコン室温の日次集計を最近の記録に追加",
      "センサー記録の一覧表示と手動削除",
      "ヘッダー表示を MyRoom に変更",
      "バージョン表示と更新履歴",
      "グラフの線スタイル調整（設定温度・屋外気温）",
    ],
  },
  {
    version: "1.3.1",
    date: "2026-05-31",
    changes: [
      "エアコン履歴をグラフに表示（室温・設定温度）",
      "グラフ凡例の表示切替（目のアイコン）",
      "エアコンの表示名をカスタマイズ可能に",
      "ラズパイでのエアコン自動取得（systemd）",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-05-31",
    changes: [
      "AirCloud Home（白くまくん）連携でエアコン状態を取得",
      "ダッシュボードにエアコンカードを追加",
      "エアコンデータの保存 API（POST /api/aircon）",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-05-31",
    changes: ["ダークモードに対応"],
  },
  {
    version: "1.1.0",
    date: "2026-05-31",
    changes: [
      "複数センサー（リビング・寝室）のグラフ表示",
      "屋外気象データの表示",
      "デバイス表示名の変更",
    ],
  },
  {
    version: "1.0.0",
    date: "2026-05-30",
    changes: [
      "温度・湿度・気圧・CO2 のダッシュボード",
      "履歴グラフと日次記録",
      "PWA 対応",
    ],
  },
];
