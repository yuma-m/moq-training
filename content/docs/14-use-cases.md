---
title: "14. ユースケースと既存技術との比較"
weight: 140
quiz:
  - q: "HLS / DASH と比べた MoQ の配信の違いとして正しいものは？"
    choices:
      - "MoQ はセグメントが完成してから配る"
      - "MoQ は Group を作られた端から専用の QUIC ストリームで流し、輻輳時は新しい Group を優先して古い Group をスキップできる"
      - "MoQ は CDN を使えない"
      - "MoQ は TCP だけで動く"
    answer: 1
    explain: "HLS / DASH は完成したセグメントを TCP で順にダウンロードします。MoQ は Group を作りながら流し、優先度とタイムアウトで「最新を届ける」判断ができます。"
  - q: "WebRTC と比べた MoQ の大きな違いは？"
    choices:
      - "MoQ はブラウザで使えない"
      - "MoQ はリレー（CDN）でのキャッシュとファンアウトを前提にした pub/sub で、大規模配信と同じ仕組みで低遅延も扱える"
      - "MoQ は P2P 専用"
      - "MoQ は暗号化できない"
    answer: 1
    explain: "WebRTC は主に 1 対 1 や小規模な会議向けで、大規模化には SFU の運用が必要です。MoQ は汎用リレーによるキャッシュとファンアウトを前提にしており、同じリレーで会議から大規模配信まで扱えることを目指しています。"
  - q: "同じ MoQ のプロトコルとリレーで「遅延 100ms の通話」と「遅延 10 秒の配信」を作り分けるときの主なつまみは？"
    choices:
      - "コーデックの種類だけ"
      - "視聴側の遅延予算（バッファ）と、優先度・Group Order・遅延タイムアウトの設定"
      - "QUIC のバージョン"
      - "リレーの台数"
    answer: 1
    explain: "どれだけ待つか（遅延予算）と、輻輳時に何を捨てるか（タイムアウト・Group Order・優先度）を変えるだけで、同じ仕組みが通話にも配信にもなります。"
  - q: "2026 年 10 月時点の MoQ の標準化状況として正しいものは？"
    choices:
      - "すでに RFC として発行済み"
      - "moq-transport は Internet-Draft（draft-22）で、版ごとに互換性がないため ALPN（moqt-N）で版を交渉する"
      - "標準化は中止された"
      - "W3C で標準化されている"
    answer: 1
    explain: "moq-transport はまだ策定中のドラフトです。ドラフト間で非互換な変更が多いため、ALPN にドラフト番号を入れて交渉します。最終版の ALPN は `moqt` の予定です。"
---

# 14. ユースケースと既存技術との比較

## 🎯 この章のゴール

- MoQ が向いているユースケースを挙げられる
- HLS / DASH、RTMP / SRT、WebRTC と MoQ の違いを説明できる
- 標準化の現状と、これから学ぶべきことを把握する

## 💡 ひとことで言うと

> MoQ は、取り込みから配信、会議までを 1 つのプロトコルと 1 つのリレー網で扱うことを目指しています。用途ごとに変えるのは、どれだけ待つかと、何を捨てるかの設定です。

## ユースケース

| ユースケース | MoQ の効きどころ |
| --- | --- |
| 大規模ライブ配信（スポーツ、イベント） | HLS 並みの CDN スケールを保ったまま、遅延を HLS より短くする。ネタバレ問題の解消 |
| 取り込み（コントリビューション） | RTMP / SRT の代わりに同じ MOQT で配信者 → リレーへ。再パッケージ不要 |
| 会議・インタラクティブ配信 | 視聴者が多い「ウェビナー」「ライブコマース」「双方向ライブ」を SFU なしでリレー網で |
| クラウドゲーム・リモート操作 | 優先度とタイムアウトで最新フレームを優先。データグラムで入力やカーソル |
| AI 音声・映像エージェント | TTS の音声や生成映像を低遅延で配信。視聴側は必要に応じてバッファを厚く |
| ロボティクス・IoT | 映像とセンサーデータを同じ pub/sub で。名前空間で機体やセンサーを整理 |
| 非メディア | チャット、ゲーム状態、ライブ字幕など、「トラック」にできるものなら何でも |

## 既存技術との比較

### vs HLS / DASH（大規模配信）

| 観点 | HLS / DASH | MoQ |
| --- | --- | --- |
| 配る単位 | 完成したセグメント（数秒）を HTTP で | Group を作りながら QUIC ストリームで |
| 遅延 | 通常は数秒〜数十秒、LL-HLS / LL-DASH でも数秒程度 | 設定次第で数百 ms〜 |
| CDN | 既存の HTTP CDN をそのまま使える（最大の強み） | MoQ 対応のリレー網が必要（HTTP/3 の CDN は QUIC を運用済みなので延長線上にある） |
| ABR | 次のセグメント境界まで切り替えられない | 新しい Group を優先、古い Group はスキップ。Group 境界で品質を切り替え |
| 輻輳時 | 古いセグメントのダウンロードが詰まる | 優先度で音声を守り、古いデータはタイムアウトで捨てる |

### vs RTMP / SRT（取り込み）

| 観点 | RTMP / SRT | MoQ |
| --- | --- | --- |
| 区間 | 取り込みだけ。配信には別プロトコルへ変換 | 取り込みと配信が同じ MOQT |
| HoL ブロッキング | RTMP は TCP なので受ける | ストリームごとに独立 |
| ブラウザから配信 | 不可（RTMP）／限定的 | WebTransport で可能 |

### vs WebRTC（会議・双方向）

| 観点 | WebRTC | MoQ |
| --- | --- | --- |
| モデル | セッション（SDP の offer / answer）で 1 対 1 をつなぎ、多人数は SFU | 名前付きトラックの pub/sub。リレーが購読を集約 |
| スケール | 視聴者が増えると SFU の負荷・コストが増大 | CDN のような木構造のファンアウト |
| キャッシュ | なし | リレーがキャッシュ。途中参加や巻き戻しが容易 |
| 遅延 | 非常に低い（〜数百 ms） | 設定次第で同等を狙える |
| 成熟度 | 長年の実績とブラウザ実装 | 策定中・実装が進行中 |

> [!NOTE] 「どれだけ待つか」は視聴者が決める
> MoQ では、同じ配信でも視聴者側の遅延予算を変えるだけで体験が変わります。遅延予算 10 秒なら HLS のように途切れにくく、100ms ならビデオ通話のように。途切れやすい回線の視聴者はバッファを厚く、低遅延が欲しい視聴者は薄くでき、どちらも同じリレーから受け取れます。

## 標準化の現状（2026 年 10 月）

| ドラフト | 版 | 状況 |
| --- | --- | --- |
| draft-ietf-moq-transport | -22（2026-10） | WG で策定中。版ごとに非互換な変更が多い |
| draft-ietf-moq-msf | -01 | カタログ・ストリーミングフォーマット |
| draft-ietf-moq-cmsf | -01 | CMAF 版 MSF |
| draft-ietf-moq-loc | -02 | 低オーバーヘッドコンテナ |

ドラフトの版ごとに ALPN（`moqt-N`）が変わり、実装は複数の版を同時にサポートして交渉するのが一般的です。最新の状況は [IETF moq WG のページ](https://datatracker.ietf.org/group/moq/documents/) で確認しましょう。

> [!TIP] 最近のドラフトの主な変化
> このコースで扱った draft-22 は、以前の版から大きく変わっています。古い記事を読むときは次の違いに注意しましょう。
>
> - 制御メッセージを 1 本の双方向ストリームに流す方式 → 制御ストリーム（単方向×2）+ リクエストごとの双方向ストリーム
> - ANNOUNCE / SUBSCRIBE_ANNOUNCES → PUBLISH_NAMESPACE / SUBSCRIBE_NAMESPACE / SUBSCRIBE_TRACKS
> - Joining FETCH → SUBSCRIBE + FILL_PARAMETERS
> - SUBSCRIBE の固定フィールドだったフィルタや優先度 → パラメータ（LOCATION_FILTER、SUBSCRIBER_PRIORITY など）
> - Header Extensions → Properties（Track / Object Properties）
> - QUIC と同じ varint → MOQT 独自の vi64

## 次に学ぶこと

- 仕様を読む: [draft-ietf-moq-transport](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/) 本文。このコースで全体像を掴んだら、§9（制御メッセージ）と §11（データストリーム）のワイヤーフォーマットを読んでみましょう
- 動かす: [moq.dev のデモ](https://moq.dev/demo) や、moq-relay をローカルで立てて OBS から配信してみる
- 実装を読む: [moq-wg の実装一覧](https://github.com/moq-wg/moq-transport/wiki/Implementations) や moq.dev の Rust / TypeScript のコード
- 議論を追う: [moq-wg/moq-transport の Issue](https://github.com/moq-wg/moq-transport/issues) や IETF のメーリングリスト

## 🧪 考えてみよう

あなたが作りたいサービス（または普段使っているサービス）を MoQ で作り直すとしたら、トラックと名前空間をどう設計し、優先度とタイムアウトをどう設定しますか？ このコースの 03・07・09 章を見返しながら、紙に書き出してみましょう。

## 📝 まとめ

- MoQ は大規模配信・取り込み・会議・ゲーム・AI・IoT まで、「トラックにできるもの」なら何でも運べる
- HLS / DASH の CDN スケール、WebRTC の低遅延、RTMP / SRT の取り込みを 1 つにまとめることを目指している
- 標準はまだドラフト（transport-22）。版ごとの違いに注意しながら、仕様と実装の両方を追いかけよう

🎉 お疲れさまでした！トップページの進捗表で、全章のクイズ結果を確認してみましょう。

## 参考

- [doc.moq.dev: vs HLS/DASH](https://doc.moq.dev/concept/use-case/distribution.html) / [vs RTMP/SRT](https://doc.moq.dev/concept/use-case/contribution.html) / [vs WebRTC](https://doc.moq.dev/concept/use-case/conferencing.html)
- [IETF moq WG documents](https://datatracker.ietf.org/group/moq/documents/)

## ✅ 理解度クイズ

{{< quiz >}}
