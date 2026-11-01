---
title: "01. なぜ MoQ なのか"
weight: 10
quiz:
  - q: "MoQ が解決しようとしている、既存のライブ配信技術のジレンマはどれ？"
    choices:
      - "暗号化すると画質が落ちる"
      - "低遅延な技術はスケールしにくく、スケールする技術は遅延が大きい"
      - "ブラウザでは動画を再生できない"
      - "音声と映像を同時に送れない"
    answer: 1
    explain: "WebRTC は低遅延だが大規模配信が難しく、HLS/DASH は CDN で大規模に配れるが数秒以上の遅延がある。MoQ はこの **遅延とスケールのトレードオフ** を 1 つのプロトコルで解消しようとしています。"
  - q: "MOQT 自体は何を運ぶプロトコル？"
    choices:
      - "H.264 映像専用"
      - "Opus 音声専用"
      - "中身を問わない汎用の pub/sub プロトコル（メディアの詰め方は別仕様）"
      - "HTTP リクエスト"
    answer: 2
    explain: "名前に Media とありますが、MOQT は **content agnostic（中身を問わない）** と明記されています。メディアをどう Object に詰めるかは MSF や LOC などのストリーミングフォーマット側で定義します。"
  - q: "MOQT の設計目標の 1 つ「Convergence（収束）」が意味するのは？"
    choices:
      - "全員が同じ画質で視聴すること"
      - "取り込み（ingest）から配信（distribution）までを 1 つのプロトコルで行い、途中の再パッケージを不要にすること"
      - "複数の CDN を 1 社に統合すること"
      - "音声と映像を 1 本のストリームに多重化すること"
    answer: 1
    explain: "今は RTMP で取り込んで HLS/DASH に変換して配る、のように区間ごとにプロトコルが違い、変換用のオリジンが必要です。MOQT はこれを 1 つのプロトコルにまとめることを狙っています。"
  - q: "MOQT がリレーを「第一級市民」として扱うとは、具体的にどういうこと？"
    choices:
      - "リレーがメディアをデコードして再エンコードできる"
      - "配信に必要な情報（メタデータ）はリレーに見せ、メディアの中身は不透明・秘匿のままにできる構造にする"
      - "リレーなしでは通信できない"
      - "リレーは HTTP キャッシュとしてのみ動作する"
    answer: 1
    explain: "Object のメタデータは常に暗号化されずリレーから見え、ペイロードはエンドツーエンド暗号化できます。リレーは中身を見ずにキャッシュ・転送・優先度制御ができます。"
---

# 01. なぜ MoQ なのか

## 🎯 この章のゴール

- 既存のライブ配信技術（RTMP / HLS・DASH / WebRTC）の得意・不得意を知る
- Media over QUIC（MoQ）が何を目指しているのかを説明できる
- IETF moq ワーキンググループのドラフト群の全体像を掴む

## 💡 ひとことで言うと

> **MoQ は「CDN で配れる WebRTC」**。数百ミリ秒の遅延で、数百万人に、同じ仕組みで届けることを目指す新しい pub/sub プロトコルです。

## ライブ配信の 3 つの世界

今日のライブ配信は、用途ごとに別々の技術でできています。

| 用途 | 主な技術 | 遅延 | スケール | 弱点 |
| --- | --- | --- | --- | --- |
| 取り込み（配信者 → サーバー） | RTMP / SRT | 1〜数秒 | 1 対 1 | 視聴側では使えない。TCP の HoL ブロッキング（RTMP） |
| 大規模配信 | HLS / DASH | 数秒〜数十秒 | ◎（HTTP CDN） | セグメント単位なので遅い |
| 双方向・会議 | WebRTC | 数百 ms 以下 | △ | 大規模配信に向かない。SFU の運用が大変 |

**低遅延なものはスケールせず、スケールするものは遅い**。さらに区間ごとにプロトコルが違うので、途中で「RTMP を受けて HLS に変換する」といった再パッケージが必要です。

{{< diagram caption="今日の典型的なライブ配信パイプライン（上）と MoQ が目指す形（下）" >}}
<svg viewBox="0 0 640 200" role="img" aria-label="Pipeline comparison">
  <defs><marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L8,4 L0,8z"/></marker></defs>
  <text x="10" y="22" font-weight="bold">今日</text>
  <rect class="box" x="10" y="35" width="100" height="40" rx="6"/><text x="60" y="60" text-anchor="middle">エンコーダ</text>
  <rect class="warn" x="170" y="35" width="120" height="40" rx="6"/><text x="230" y="60" text-anchor="middle">オリジン(変換)</text>
  <rect class="box" x="350" y="35" width="120" height="40" rx="6"/><text x="410" y="60" text-anchor="middle">HTTP CDN</text>
  <rect class="box" x="530" y="35" width="100" height="40" rx="6"/><text x="580" y="60" text-anchor="middle">視聴者</text>
  <line class="arrow" x1="110" y1="55" x2="166" y2="55" marker-end="url(#ah)"/><text x="138" y="48" text-anchor="middle" class="muted">RTMP</text>
  <line class="arrow" x1="290" y1="55" x2="346" y2="55" marker-end="url(#ah)"/><text x="318" y="48" text-anchor="middle" class="muted">HLS</text>
  <line class="arrow" x1="470" y1="55" x2="526" y2="55" marker-end="url(#ah)"/><text x="498" y="48" text-anchor="middle" class="muted">HLS</text>
  <text x="10" y="122" font-weight="bold">MoQ</text>
  <rect class="box" x="10" y="135" width="100" height="40" rx="6"/><text x="60" y="160" text-anchor="middle">パブリッシャ</text>
  <rect class="accent" x="170" y="135" width="120" height="40" rx="6"/><text x="230" y="160" text-anchor="middle">リレー</text>
  <rect class="accent" x="350" y="135" width="120" height="40" rx="6"/><text x="410" y="160" text-anchor="middle">リレー</text>
  <rect class="box" x="530" y="135" width="100" height="40" rx="6"/><text x="580" y="160" text-anchor="middle">視聴者</text>
  <line class="arrow" x1="110" y1="155" x2="166" y2="155" marker-end="url(#ah)"/><text x="138" y="148" text-anchor="middle" class="muted">MOQT</text>
  <line class="arrow" x1="290" y1="155" x2="346" y2="155" marker-end="url(#ah)"/><text x="318" y="148" text-anchor="middle" class="muted">MOQT</text>
  <line class="arrow" x1="470" y1="155" x2="526" y2="155" marker-end="url(#ah)"/><text x="498" y="148" text-anchor="middle" class="muted">MOQT</text>
</svg>
{{< /diagram >}}

## MOQT の 4 つの設計目標

MOQT（Media over QUIC Transport）のドラフトは、冒頭で次の 4 つの動機を挙げています。

1. **Latency（遅延）** — 遅延は「ネットワークの帯域変動を吸収するため」に生まれます。TCP ベースは輻輳の検知が遅く HoL ブロッキングもある。UDP 直だと再送や輻輳制御を全部自前で作る羽目になる。**QUIC を使って両方のいいとこ取り** をし、輻輳にすばやく反応します。
2. **Leveraging QUIC（QUIC の活用）** — 並列なストリームと柔軟な損失回復を活かします（次章）。
3. **Convergence（収束）** — 取り込みから配信までを **1 つのプロトコル** で行い、再パッケージ用のオリジンを不要にします。
4. **Relays（リレー）** — 第三者のネットワーク（CDN）がスケールの鍵。リレーを **第一級市民** として扱い、配信に必要なメタデータはリレーに見せつつ、メディアの中身は不透明・秘匿のままにします。

## MOQT は「メディア専用」ではない

名前に反して、MOQT は **content agnostic（中身を問わない）** と明記されています。MOQT が知っているのは「名前の付いたトラックに、番号の付いたバイト列（Object）が流れる」ことだけです。

映像や音声をどう Object に詰めるか、どんなトラックがあるかをどう知らせるかは、別の **ストリーミングフォーマット** 仕様が決めます。チャット、ゲームの状態同期、センサーデータ、AI の音声応答なども MOQT に載せられます。

## IETF moq WG のドラフト群

| ドラフト | 役割 | 本コース |
| --- | --- | --- |
| draft-ietf-moq-transport | pub/sub の本体（MOQT） | 02〜11 章 |
| draft-ietf-moq-loc | 低オーバーヘッドなメディアコンテナ（LOC） | 12 章 |
| draft-ietf-moq-msf | ストリーミングフォーマットとカタログ（MSF） | 12 章 |
| draft-ietf-moq-cmsf | CMAF で詰める MSF の拡張（CMSF） | 12 章 |

これとは別に、[moq.dev](https://moq.dev/) は MOQT の **シンプルなサブセット「moq-lite」** と独自のメディアフォーマット「hang」を実装し、本番運用しています（13 章）。

{{< mermaid >}}
flowchart LR
  app["アプリ"] --> fmt["フォーマット<br/>MSF・LOC など"] --> moqt["MOQT<br/>pub/sub"] --> tr["QUIC /<br/>WebTransport"]
{{< /mermaid >}}

## 🧪 考えてみよう

スポーツのライブ中継で、隣の家の歓声が自分の画面より 10 秒早く聞こえる——いわゆる「ネタバレ問題」です。HLS ではなぜこれが起きやすいのでしょう？ HLS は数秒のセグメントが **完成してから** 配るので、どうしても「セグメント長 × 数個」分の遅延が積み上がります。MoQ はセグメントを待たずに、フレームができた端から流します。

## 📝 まとめ

- 既存技術には「低遅延 ↔ スケール」のジレンマと、区間ごとのプロトコル分断がある
- MOQT は QUIC の上の **汎用 pub/sub プロトコル**。リレー（CDN）を前提に設計されている
- メディアの詰め方は LOC / MSF / CMSF など別仕様のレイヤーが担当する

## 参考

- [draft-ietf-moq-transport-22 §1 Introduction](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-1)
- [moq.dev](https://moq.dev/)

## ✅ 理解度クイズ

{{< quiz >}}
