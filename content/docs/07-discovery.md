---
title: "07. 発見: 名前空間の公開と購読"
weight: 70
quiz:
  - q: "パブリッシャがリレーに「`(example.com, live)` 以下のトラックは私が持っている」と知らせるメッセージは？"
    choices:
      - "PUBLISH"
      - "PUBLISH_NAMESPACE"
      - "NAMESPACE"
      - "SUBSCRIBE_NAMESPACE"
    answer: 1
    explain: "PUBLISH_NAMESPACE は名前空間プレフィックス単位で「ここにトラックがある」と広告します。リレーはこれを見て、そのプレフィックスに一致する SUBSCRIBE をそのパブリッシャへ転送します。"
  - q: "SUBSCRIBE_NAMESPACE と SUBSCRIBE_TRACKS の違いは？"
    choices:
      - "同じもの"
      - "SUBSCRIBE_NAMESPACE は名前空間の一覧（NAMESPACE / NAMESPACE_DONE）を受け取る。SUBSCRIBE_TRACKS は一致するトラックの PUBLISH（＝購読そのもの）を受け取る"
      - "SUBSCRIBE_NAMESPACE はパブリッシャが送り、SUBSCRIBE_TRACKS はサブスクライバが送る"
      - "SUBSCRIBE_TRACKS は過去のトラックだけを返す"
    answer: 1
    explain: "SUBSCRIBE_NAMESPACE は「どんな名前空間があるか」を知る **発見** のため、SUBSCRIBE_TRACKS は「一致するトラックを全部押し込んで」という **購読の依頼** です。"
  - q: "SUBSCRIBE_NAMESPACE (example) に対する NAMESPACE メッセージに、`(example, 42)` の名前空間はどう入る？"
    choices:
      - "`(example, 42)` 全体"
      - "サフィックスの `(42)` だけ"
      - "Track Alias"
      - "ハッシュ値"
    answer: 1
    explain: "プレフィックス `example` はすでに分かっているので、NAMESPACE / NAMESPACE_DONE にはそれ以降のサフィックスだけが入ります。"
  - q: "PUBLISH_NAMESPACE について正しいものは？"
    choices:
      - "これを受け取らないと SUBSCRIBE を送ってはいけない"
      - "完全なルーティングプロトコルで、ループも防げる"
      - "受け取っていなくても SUBSCRIBE・FETCH・TRACK_STATUS を送ってよい。またループ防止の仕組みはない"
      - "リレーはサブスクライバへ PUBLISH_NAMESPACE を転送する"
    answer: 2
    explain: "トラック名を帯域外で知っていれば、PUBLISH_NAMESPACE なしで購読できます。また仕様は PUBLISH_NAMESPACE を「完全なルーティングプロトコルではなく、ループも防がない」と明記しています。リレーはサブスクライバには NAMESPACE で知らせます。"
---

# 07. 発見: 名前空間の公開と購読

## 🎯 この章のゴール

- PUBLISH_NAMESPACE / SUBSCRIBE_NAMESPACE / NAMESPACE / NAMESPACE_DONE / SUBSCRIBE_TRACKS の役割を区別できる
- リレーを経由した発見と購読の流れを図で追える

## 💡 ひとことで言うと

> **PUBLISH_NAMESPACE は「この住所の荷物はうちが扱います」という看板、SUBSCRIBE_NAMESPACE は「この地域に新しいお店ができたら教えて」という登録、SUBSCRIBE_TRACKS は「この地域の新商品は全部届けて」という定期便**。

## 発見は「あると便利」な機能

MOQT ではトラック名を **帯域外で知っていれば**（URL に書いてある、アプリが決めている、カタログに載っている……）、SETUP 以外のメッセージなしでいきなり SUBSCRIBE できます。

それでも「どの名前空間にトラックがあるか」をセッション内で知らせたり知ったりできると便利です。そのためのメッセージが 4 種類あります。なお **MOQT サーバー自体をどう見つけるか**（どこに接続するか）は常に帯域外で、仕様の範囲外です。

| メッセージ | 送る側 | 意味 |
| --- | --- | --- |
| `PUBLISH_NAMESPACE` | パブリッシャ | このプレフィックス以下のトラックを持っている |
| `SUBSCRIBE_NAMESPACE` | サブスクライバ | このプレフィックスに一致する名前空間を教えて（以後の変化も） |
| `NAMESPACE` / `NAMESPACE_DONE` | パブリッシャ（SUBSCRIBE_NAMESPACE への応答として） | 名前空間が増えた / なくなった |
| `SUBSCRIBE_TRACKS` | サブスクライバ | このプレフィックスに一致するトラックを PUBLISH で全部送って |

## PUBLISH_NAMESPACE: 看板を出す

パブリッシャは新しい双方向ストリームで PUBLISH_NAMESPACE を送り、名前空間プレフィックスを広告します。受け取った側（多くはリレー）は、パブリッシャがそのプレフィックスで公開する権限を持つか確認し、PUBLISH_NAMESPACE_OK（REQUEST_OK）か ERROR を返します。

- 取り下げるときはリクエストをキャンセル（ストリームをリセット）するだけ
- リレーは、プレフィックスに一致する SUBSCRIBE を受けたら、そのパブリッシャへ上流 SUBSCRIBE を送る
- 1 つのトラックの PUBLISH が認められても、他のトラックや名前空間の公開権限まで認めてはいけない

> [!WARNING] ルーティングプロトコルではない
> PUBLISH_NAMESPACE はリレーがパブリッシャとサブスクライバをつなぐ手がかりですが、**完全なルーティングプロトコルではなくループも防ぎません**。複雑に相互接続されたリレー網の経路探索に使うべきではない（SHOULD NOT）とされています。リレー同士の接続方法は仕様の範囲外です。

## SUBSCRIBE_NAMESPACE: 一覧と変化を受け取る

サブスクライバが SUBSCRIBE_NAMESPACE を送ると、パブリッシャ（リレー）は REQUEST_OK の後、同じストリームで次を送り続けます。

- 一致する名前空間ごとに **NAMESPACE**
- 名前空間がなくなったら **NAMESPACE_DONE**（以後その名前空間の新規購読を受け付けない意味）

NAMESPACE / NAMESPACE_DONE にはプレフィックスより後ろの **サフィックスだけ** が入ります。プレフィックスに 0 フィールドを指定すると「全部」です。

## 流れを追ってみよう

仕様の例（§4.3）を図にしたものです。

{{< mermaid >}}
sequenceDiagram
  participant P as パブリッシャ
  participant R as リレー
  participant S as サブスクライバ
  P->>R: PUBLISH_NAMESPACE (example-42)
  R-->>P: PUBLISH_NAMESPACE_OK
  S->>R: SUBSCRIBE_NAMESPACE (example)
  R-->>S: SUBSCRIBE_NAMESPACE_OK
  R-->>S: NAMESPACE (42)
  P->>R: PUBLISH_NAMESPACE (example-123)
  R-->>P: PUBLISH_NAMESPACE_OK
  R-->>S: NAMESPACE (123)
  P->>R: PUBLISH_NAMESPACE (example-123) をキャンセル
  R-->>S: NAMESPACE_DONE (123)
{{< /mermaid >}}

名前空間を知ったサブスクライバは、カタログなどでトラック名を知り、SUBSCRIBE します。リレーは一致する PUBLISH_NAMESPACE を出したパブリッシャへ上流 SUBSCRIBE を送り、データを中継します。

{{< mermaid >}}
sequenceDiagram
  participant P as パブリッシャ
  participant R as リレー
  participant S as サブスクライバ
  S->>R: SUBSCRIBE (example-42 / video)
  R->>P: SUBSCRIBE (example-42 / video)
  P-->>R: SUBSCRIBE_OK
  R-->>S: SUBSCRIBE_OK
  P->>R: Objects…
  R->>S: Objects…
{{< /mermaid >}}

> [!NOTE] 📜 仕様メモ: リレーは SUBSCRIBE_OK を急がない
> リレーは、上流の購読が Established になるまで下流へ SUBSCRIBE_OK を返してはいけません（MUST）。一方、すでに同じトラックの上流購読があれば、すぐに SUBSCRIBE_OK を返します（10 章）。

## SUBSCRIBE_TRACKS: まとめて押し込んでもらう

会議室の参加者全員の音声のように、「このプレフィックス以下のトラックは、名前を知らなくても、後から増えたものも全部欲しい」という場合は **SUBSCRIBE_TRACKS** を使います。

- 成功するとパブリッシャは、一致するトラックごとに **新しい双方向ストリームで PUBLISH** を送ってくる（サブスクライバ自身が公開したトラックは除く）
- SUBSCRIBE_TRACKS に付けたパラメータ（`FORWARD`、`GROUP_ORDER`、Range Filter など）が、生まれる購読の初期値になる
- `TRACK_PROPERTY_FILTER` で、特定のプロパティを持つトラックだけに絞れる
- ストリーム不足などで購読を作れなかったトラックは **PUBLISH_SKIPPED** で通知される（必要なら自分で SUBSCRIBE する）

{{< mermaid >}}
sequenceDiagram
  participant R as リレー
  participant S as サブスクライバ
  S->>R: SUBSCRIBE_TRACKS (meet, room1)
  R-->>S: SUBSCRIBE_TRACKS_OK
  R->>S: [新しい双方向ストリーム] PUBLISH (meet-room1-alice / audio, Track Alias=1)
  R->>S: [新しい双方向ストリーム] PUBLISH (meet-room1-bob / audio, Track Alias=2)
  Note over R,S: 後から carol が参加
  R->>S: [新しい双方向ストリーム] PUBLISH (meet-room1-carol / audio, Track Alias=3)
{{< /mermaid >}}

### プレフィックスの重なりは禁止

同じセッション内で、すでに確立している SUBSCRIBE_NAMESPACE（または SUBSCRIBE_TRACKS）と **共通のプレフィックスを持つ** 新しいリクエストは `PREFIX_OVERLAP` で断られます。種類ごとに独立して判定されます。プレフィックスを変えたいときは REQUEST_UPDATE の `TRACK_NAMESPACE_PREFIX` で更新できます。

## 🧪 考えてみよう

多人数のビデオ会議を MOQT で作るなら、名前空間をどう設計しますか？ 例えば `(meet.example, room1, alice)` のように「会議室 → 参加者」の順に並べておけば、`(meet.example, room1)` への SUBSCRIBE_NAMESPACE で入退室を、SUBSCRIBE_TRACKS で全員の音声を一度に受け取れます。タプルの **並び順がそのまま購読の粒度** になるのがポイントです。

## 📝 まとめ

- トラック名を知っていれば発見なしで購読できる。発見は便利機能
- **PUBLISH_NAMESPACE** で「ここにある」と広告、**SUBSCRIBE_NAMESPACE** で名前空間の増減（NAMESPACE / NAMESPACE_DONE）を受け取る
- **SUBSCRIBE_TRACKS** で一致するトラックの PUBLISH（購読）をまとめて受け取る
- PUBLISH_NAMESPACE はルーティングプロトコルではなく、ループ防止もない

## 参考

- [draft-ietf-moq-transport-22 §4 Publisher and Namespace Discovery](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-4)
- [§3.6 Subscribing to Tracks by Prefix](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-3.6)

## ✅ 理解度クイズ

{{< quiz >}}
