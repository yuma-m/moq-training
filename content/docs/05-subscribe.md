---
title: "05. 購読: SUBSCRIBE と PUBLISH"
weight: 50
quiz:
  - q: "購読（subscription）を始められるのは誰？"
    choices:
      - "サブスクライバだけ（SUBSCRIBE）"
      - "パブリッシャだけ（PUBLISH）"
      - "どちらからでも。サブスクライバは SUBSCRIBE、パブリッシャは PUBLISH で始める"
      - "リレーだけ"
    answer: 2
    explain: "draft-22 では購読はどちらの側からでも始められます。サブスクライバが SUBSCRIBE を送る「pull」と、パブリッシャが PUBLISH を送る「push」があり、どちらも成功すれば Established 状態になります。"
  - q: "Track Alias の目的は？"
    choices:
      - "トラックを暗号化するための鍵"
      - "データストリームやデータグラムで、長い Full Track Name の代わりに使う短い数値 ID"
      - "トラックの別名を人間向けに表示するため"
      - "リレー間でトラックを転送するためのアドレス"
    answer: 1
    explain: "Object ごとに長い名前を送るのは無駄なので、パブリッシャが SUBSCRIBE_OK や PUBLISH で数値の Track Alias を割り当て、データ側ではそれを使います。"
  - q: "今まさに配信中のトラックに「今の Group の先頭から」参加したい。どう SUBSCRIBE する？"
    choices:
      - "フィルタなしで SUBSCRIBE する"
      - "Next Group から始まる Location フィルタで SUBSCRIBE する"
      - "Next Object から始まる Location フィルタに、StartGroup=1 の Location フィルタを入れた FILL_PARAMETERS を付けて SUBSCRIBE する"
      - "FETCH だけを送る"
    answer: 2
    explain: "購読自体は Next Object から始め、FILL_PARAMETERS（StartGroup=1 = 現在の Group）で現在の Group の先頭から Largest Object までを fill fetch ストリームで補います。Next Group から始めると次の Group まで待つことになります。"
  - q: "購読を一時停止（pause）するには？"
    choices:
      - "STOP_SENDING を送る"
      - "REQUEST_UPDATE で FORWARD パラメータを 0 にする"
      - "PUBLISH_DONE を送る"
      - "QUIC の接続を切る"
    answer: 1
    explain: "FORWARD=0 にすると、購読状態は保ったまま Object の送信だけが止まります。FORWARD=1 で再開します。STOP_SENDING は購読の終了（キャンセル）です。"
  - q: "PUBLISH_DONE に含まれる Stream Count は何に使う？"
    choices:
      - "サブスクライバの人数を知らせる"
      - "この購読のためにパブリッシャが開いたデータストリーム数を伝え、受信側がすべて届いたか判断できるようにする"
      - "残りの Group 数を知らせる"
      - "再接続までの秒数"
    answer: 1
    explain: "PUBLISH_DONE は制御用のリクエストストリームで届くので、遅れて開くデータストリームより先に着くことがあります。Stream Count と受信済みストリーム数を比べれば、購読状態をいつ消してよいか分かります。"
---

# 05. 購読: SUBSCRIBE と PUBLISH

## 🎯 この章のゴール

- 購読（subscription）の状態遷移と、SUBSCRIBE（pull）/ PUBLISH（push）の違いを説明できる
- Track Alias・Largest Object・Location フィルタを理解する
- ライブ中のトラックへの 4 通りの途中参加方法を選べる
- REQUEST_UPDATE による更新・一時停止と、PUBLISH_DONE による終了を知る

## 💡 ひとことで言うと

> **購読は「新しく出た Object を届け続けてもらう契約」**。どこから届けるか（フィルタ）、どれくらい急ぐか（優先度）を契約時に決め、あとから変更もできます。

## 購読の状態遷移

購読は **SUBSCRIBE（サブスクライバ発）** でも **PUBLISH（パブリッシャ発）** でも始められます。

{{< mermaid >}}
stateDiagram-v2
  [*] --> Idle
  Idle --> PendingSub: SUBSCRIBE（サブスクライバ）
  Idle --> PendingPub: PUBLISH（パブリッシャ）
  PendingSub --> Established: SUBSCRIBE_OK
  PendingSub --> Terminated: SUBSCRIBE_ERROR
  PendingPub --> Established: PUBLISH_OK
  PendingPub --> Terminated: PUBLISH_ERROR
  Established --> Established: REQUEST_UPDATE
  Established --> Terminated: STOP_SENDING（サブスクライバ）
  Established --> Terminated: PUBLISH_DONE（パブリッシャ）
  PendingSub: Pending (Subscriber)
  PendingPub: Pending (Publisher)
{{< /mermaid >}}

- 終了はサブスクライバなら **STOP_SENDING**（リクエストのキャンセル）、パブリッシャなら **PUBLISH_DONE を送ってストリームを閉じる**
- REQUEST_ERROR で終わったリクエストでは Object は一切送られない

## SUBSCRIBE: サブスクライバから頼む

```text
SUBSCRIBE {
  Type = 0x3, Length,
  Request ID,
  Track Namespace, Track Name,      ← どのトラックか
  Number of Parameters, Parameters  ← どう届けてほしいか
}
```

主なパラメータ:

| パラメータ | 意味 |
| --- | --- |
| `LOCATION_FILTER` | どの範囲の Object を送るか（後述） |
| `FILL_PARAMETERS` | 過去分を fill fetch ストリームで補う（06 章） |
| `SUBSCRIBER_PRIORITY` | この購読の優先度（0 が最高、省略時 128） |
| `GROUP_ORDER` | Group を昇順（古い順）/ 降順（新しい順）どちらで優先するか |
| `FORWARD` | 0 なら一時停止状態で開始（省略時 1） |
| `SUBGROUP_DELIVERY_TIMEOUT` / `OBJECT_DELIVERY_TIMEOUT` | 遅れたデータを諦めるまでの時間（09 章） |
| `RENDEZVOUS_TIMEOUT` | パブリッシャがまだいないとき、リレーに待ってもらう時間 |
| `NEW_GROUP_REQUEST` | 新しい Group を始めてほしいと依頼（後述） |
| `AUTHORIZATION_TOKEN` | 認可トークン |

成功すると、パブリッシャは同じストリームで **SUBSCRIBE_OK** を返します。

```text
SUBSCRIBE_OK {
  Type = 0x4, Length,
  Track Alias,                       ← データ側で使う短い ID
  Number of Parameters, Parameters,  ← LARGEST_OBJECT, EXPIRES
  Track Properties                   ← 既定の優先度、キャッシュ期間など
}
```

{{< mermaid >}}
sequenceDiagram
  participant S as サブスクライバ
  participant P as パブリッシャ
  S->>P: [新しい双方向ストリーム] SUBSCRIBE (Request ID=4, (live, alice) / video, LOCATION_FILTER=Next Group)
  P-->>S: SUBSCRIBE_OK (Track Alias=7, LARGEST_OBJECT={41, 12})
  P->>S: [単方向ストリーム] SUBGROUP_HEADER (Alias=7, Group=42) + Object 0, 1, 2…
  P->>S: [単方向ストリーム] SUBGROUP_HEADER (Alias=7, Group=43) + Object 0, 1, 2…
  S->>P: STOP_SENDING（購読終了）
{{< /mermaid >}}

### Track Alias

データストリームやデータグラムは、長い Full Track Name の代わりに **Track Alias（数値）** でトラックを指します。Alias はパブリッシャが決め、SUBSCRIBE_OK か PUBLISH で伝えます。

- 同じセッションで、同時に 2 つの異なるトラックに同じ Alias を使ってはいけない（`DUPLICATE_TRACK_ALIAS`）
- 制御メッセージより先にデータが届くことがあるので、受信側は未知の Alias のデータをしばらくバッファしてよい

### Largest Object

**Largest Object** は、パブリッシャから見てそのトラックで最も大きい Location の Object です（まだ受信途中かもしれない）。SUBSCRIBE_OK の `LARGEST_OBJECT` パラメータで分かります。ここから 2 つの便利な位置が決まります。

- **Next Object** = `{Largest.Group, Largest.Object + 1}`（何もなければ `{0, 0}`）
- **Next Group** = `{Largest.Group + 1, 0}`

## PUBLISH: パブリッシャから押し込む

パブリッシャは **PUBLISH** で、相手に頼まれる前に購読を始められます。PUBLISH 自体に Track Alias やトラックのプロパティが入っていて、サブスクライバは REQUEST_OK（PUBLISH_OK）か REQUEST_ERROR（PUBLISH_ERROR）で応えます。

- 遅延を減らすため、**PUBLISH_OK を待たずに Object を送り始めてもよい**
- 興味のない PUBLISH には `UNINTERESTED` で断り、関連ストリームを STOP_SENDING する
- **リレーは、相手が興味を持ち認可されていると分かるまで PUBLISH を送ってはいけない**。その意思表示に使うのが SUBSCRIBE_TRACKS などです（07 章）

## Location フィルタ: どこから届けるか

`LOCATION_FILTER` パラメータで、購読が送る範囲を指定します。

| Filter Type | 開始 | 終了 |
| --- | --- | --- |
| 0x00 None | フィルタなし | フィルタなし |
| 0x01 Relative Start | `{Largest.Group + 1 − StartGroup, 0}` | 無期限 |
| 0x02 Absolute Start | `{StartGroup, StartObject}` | 無期限 |
| 0x03 Absolute Start, Group End | `{StartGroup, StartObject}` | Group `StartGroup + EndGroupDelta` の最後 |
| 0x04 Absolute Range | `{StartGroup, StartObject}` | `{StartGroup + EndGroupDelta, EndObject}` |
| 0x05 Next Object | Next Object | 無期限 |

Relative Start の StartGroup は「Next Group から何 Group さかのぼるか」です。**0 = Next Group、1 = 現在の Group、2 = 1 つ前の Group** …… と読みます。

## ライブへの途中参加: 4 つのパターン

Group の先頭が参加ポイントなので、「どこから見始めるか」でやり方が変わります。

{{< diagram caption="Largest Object が Group 41 の途中（Object 12）のときの参加パターン" >}}
<svg viewBox="0 0 640 230" role="img" aria-label="Joining patterns">
  <defs><marker id="ah5" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L8,4 L0,8z"/></marker></defs>
  <rect class="box" x="20" y="20" width="180" height="34" rx="4"/><text x="110" y="42" text-anchor="middle">Group 40</text>
  <rect class="box" x="210" y="20" width="230" height="34" rx="4"/><text x="300" y="42" text-anchor="middle">Group 41</text>
  <rect class="ng" x="450" y="20" width="170" height="34" rx="4"/><text x="535" y="42" text-anchor="middle">Group 42（未来）</text>
  <line class="line" x1="400" y1="14" x2="400" y2="60"/><text x="400" y="10" text-anchor="middle" class="muted">Largest {41,12}</text>
  <text x="20" y="85">① すぐ参加（Next Object）</text>
  <line class="arrow" x1="402" y1="80" x2="620" y2="80" marker-end="url(#ah5)"/>
  <text x="20" y="120">② 今の Group の先頭から</text>
  <rect class="accent" x="210" y="108" width="190" height="16" rx="3"/><text x="305" y="121" text-anchor="middle" font-size="11">fill</text>
  <line class="arrow" x1="402" y1="116" x2="620" y2="116" marker-end="url(#ah5)"/>
  <text x="20" y="155">③ 過去の Group から</text>
  <rect class="accent" x="20" y="143" width="380" height="16" rx="3"/><text x="300" y="156" text-anchor="middle" font-size="11">fill</text>
  <line class="arrow" x1="402" y1="151" x2="620" y2="151" marker-end="url(#ah5)"/>
  <text x="20" y="190">④ 次の Group から（Next Group）</text>
  <line class="arrow" x1="450" y1="186" x2="620" y2="186" marker-end="url(#ah5)"/>
  <text x="20" y="220" class="muted">矢印 = 購読で届く分（subscription-delivered）、帯 = fill fetch ストリームで届く分（fill-delivered）</text>
</svg>
{{< /diagram >}}

| パターン | SUBSCRIBE の中身 | 向いている用途 |
| --- | --- | --- |
| ① すぐ参加 | Location フィルタ = Next Object | 音声やデータなど、どこからでも使えるもの。Group の途中から届く |
| ② 今の Group の先頭から | Next Object + FILL_PARAMETERS（Relative Start、StartGroup=1） | 映像。キーフレームから復号したい |
| ③ 過去の Group から | FILL_PARAMETERS で欲しい Group を指定 | 少しさかのぼって再生、バッファを厚くしたい |
| ④ 次の Group から | Location フィルタ = Next Group | 次のキーフレームまで待ってもよい、無駄な過去データは不要 |

Fill の詳しい仕組みは次章で扱います。

### Dynamic Groups: 新しい Group を頼む

Group の真ん中で参加すると、②では Group の先頭からのデータを大量に受け取ることになり、④では次の Group まで待たされます。トラックが **DYNAMIC_GROUPS** プロパティ（値 1）を持っていれば、サブスクライバは `NEW_GROUP_REQUEST` パラメータで「新しい Group（= 新しいキーフレーム）を始めて」とオリジナルのパブリッシャに頼めます。リレーは同じ依頼を重複して上流に送らないようにまとめます。

## 購読の更新: REQUEST_UPDATE

購読した側は、同じリクエストストリームで **REQUEST_UPDATE** を送ってパラメータを変更できます（応答は REQUEST_OK / REQUEST_ERROR）。含めなかったパラメータは変わりません。

- **一時停止 / 再開**: `FORWARD` を 0 / 1 に。停止中も PUBLISH_DONE などの制御メッセージは届く
- **優先度の変更**: `SUBSCRIBER_PRIORITY`
- **範囲の変更**: `LOCATION_FILTER`。開始位置を前にずらすなら `FILL_PARAMETERS` で過去分を補える
- **期限の延長**: パブリッシャが `EXPIRES`（ミリ秒）を伝えてきたら、REQUEST_UPDATE（必要なら新しいトークン付き）で延長を頼む

更新が失敗した購読は、パブリッシャが `UPDATE_FAILED` の PUBLISH_DONE で終了させます。

パブリッシャ側の都合で状態が変わったときは、応答不要の通知 **PUBLISH_STATE_NOTIFY** で `LARGEST_OBJECT`・`FORWARD`・`LOCATION_FILTER` の現在値を知らせます。

## 購読の終了: PUBLISH_DONE

パブリッシャは購読をやめるとき、リクエストストリームの **最後のメッセージ** として PUBLISH_DONE を送ってから FIN します。

```text
PUBLISH_DONE {
  Type = 0xB, Length,
  Status Code,     ← TRACK_ENDED, EXPIRED, TOO_FAR_BEHIND, UPDATE_FAILED …
  Stream Count,    ← この購読のために開いたデータストリームの総数
  Error Reason
}
```

PUBLISH_DONE は遅れて開くデータストリームより先に届くことがあるので、サブスクライバは **Stream Count と受信済みのストリーム数を比べ**、一致したら状態を消します（不明ならタイムアウトで消す）。

## おまけ: TRACK_STATUS

**TRACK_STATUS** は「購読はしないけど、今の状態を教えて」というリクエストです。形式は SUBSCRIBE と同じで、パブリッシャは SUBSCRIBE_OK と同じパラメータ（`LARGEST_OBJECT` など）とプロパティを REQUEST_OK で返し、ストリームを閉じます。

## 🧪 考えてみよう

ビデオ会議で、画面に表示していない参加者の映像を購読し続けると帯域がもったいない。かといって購読をやめると、再表示したときに購読し直す往復が発生します。こんなときは `FORWARD=0` で **一時停止** しておけば、状態を保ったまま帯域だけを節約できます。再表示するときは `FORWARD=1` に加え、`NEW_GROUP_REQUEST` で新しいキーフレームを頼むと素早く絵が出ます。

## 📝 まとめ

- 購読は SUBSCRIBE（pull）でも PUBLISH（push）でも始まり、Established → Terminated へ進む
- データ側は Track Alias で軽量にトラックを指す。Largest Object から Next Object / Next Group が決まる
- 途中参加は Location フィルタと FILL_PARAMETERS の組み合わせで 4 パターン
- REQUEST_UPDATE で一時停止・優先度・範囲を変更、PUBLISH_DONE の Stream Count で後片付け

## 参考

- [draft-ietf-moq-transport-22 §3.1 Subscriptions / §3.5 Joining an Ongoing Track](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-3.1)
- [§9.6 SUBSCRIBE 〜 §9.10 PUBLISH_STATE_NOTIFY](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-9.6)

## ✅ 理解度クイズ

{{< quiz >}}
