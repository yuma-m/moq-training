---
title: "楽しく学ぶ Media over QUIC"
bookToC: false
---

# 📡 楽しく学ぶ Media over QUIC

**Media over QUIC（MoQ）** は、ライブ映像・音声などのリアルタイムデータを **「WebRTC 並みの低遅延」と「HLS/DASH 並みのスケール」** の両方で届けることを目指して、IETF で標準化が進んでいるプロトコルです。

このコースでは、IETF の最新ドラフト **draft-ietf-moq-transport-22（2026 年 10 月）** を中心に、MoQ の主要な概念と仕様を **短く・楽しく** 学びます。後半では [moq.dev](https://moq.dev/) が開発しているオープンソース実装（moq-lite / hang / moq-relay）も紹介します。
各章は 5〜10 分で読める分量で、章末の **理解度クイズ** で手応えを確かめながら進めます。

> [!WARNING] 仕様は策定中です
> MoQ の仕様はまだ Internet-Draft（策定中の文書）で、版ごとにメッセージ名や構造が大きく変わります。本コースの内容は **2026 年 10 月時点** の次のドラフトに基づいています。
>
> - [draft-ietf-moq-transport-22](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/)（MOQT 本体）
> - [draft-ietf-moq-msf-01](https://datatracker.ietf.org/doc/draft-ietf-moq-msf/)（ストリーミングフォーマットとカタログ）
> - [draft-ietf-moq-cmsf-01](https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/)（CMAF 版 MSF）
> - [draft-ietf-moq-loc-02](https://datatracker.ietf.org/doc/draft-ietf-moq-loc/)（低オーバーヘッドなメディアコンテナ）

## 進め方

1. 左のメニューの **01** から順番に読む
2. 図やシーケンス図で、メッセージの流れをイメージする
3. 章末のクイズに挑戦！ 選ぶとすぐに正誤と解説が表示されます
4. 全問正解できなかったら、解説を読んで「もう一度挑戦する」

> [!NOTE] アイコンの見方
>
> - 🎯 **ゴール** — その章で身につけること
> - 💡 **ひとことで言うと** — 概念をざっくり掴む比喩
> - 📜 **仕様メモ** — ドラフトの細かい規定やワイヤーフォーマット
> - 🧪 **考えてみよう** — 理解を確かめる小さな問い

## コースの地図

| パート | 章 | 内容 |
| --- | --- | --- |
| 基礎 | 01〜02 | なぜ MoQ が必要か、土台となる QUIC / WebTransport |
| データモデル | 03 | Track / Group / Subgroup / Object と名前空間 |
| プロトコル | 04〜08 | セッション、SUBSCRIBE / PUBLISH、FETCH と Fill、発見、データの運び方 |
| 配信制御 | 09〜11 | 優先度とタイムアウト、リレー、プロパティ・エラー・拡張性 |
| メディア | 12 | LOC / MSF / CMSF |
| 実践 | 13〜14 | moq.dev の実装、ユースケースと既存技術との比較 |

## あなたの進捗

クイズの結果はこのブラウザに保存されます。

{{< progress >}}

## 参考

- [IETF Media Over QUIC (moq) WG](https://datatracker.ietf.org/group/moq/about/)
- [moq-wg/moq-transport（GitHub）](https://github.com/moq-wg/moq-transport)
- [moq.dev](https://moq.dev/) / [doc.moq.dev](https://doc.moq.dev/)
