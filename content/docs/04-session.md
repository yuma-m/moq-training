---
title: "04. セッションとストリームの使い方"
weight: 40
quiz:
  - q: "draft-22 で、制御メッセージ（SETUP や GOAWAY）を交換するのに使うストリームは？"
    choices:
      - "クライアントが開く 1 本の双方向ストリーム"
      - "各ピアが 1 本ずつ開く単方向ストリームのペア"
      - "データグラム"
      - "HTTP/3 の制御ストリーム"
    answer: 1
    explain: "各ピアが SETUP から始まる単方向の **制御ストリーム** を 1 本ずつ開きます。双方向 1 本ではなく単方向 2 本にすることで、0-RTT の有無にかかわらず、どちらも準備ができ次第送信を始められます。"
  - q: "SUBSCRIBE や FETCH などのリクエストはどこで送る？"
    choices:
      - "制御ストリームにまとめて送る"
      - "リクエストごとに新しい双方向ストリームを開き、その最初のメッセージとして送る"
      - "Object と同じ単方向ストリームで送る"
      - "データグラムで送る"
    answer: 1
    explain: "draft-22 では、TRACK_STATUS・SUBSCRIBE・PUBLISH・FETCH・PUBLISH_NAMESPACE・SUBSCRIBE_NAMESPACE・SUBSCRIBE_TRACKS の 7 種類が **新しい双方向リクエストストリームの先頭** で送られます。応答や更新も同じストリーム上でやり取りします。"
  - q: "クライアントが発行する Request ID の並びとして正しいものは？"
    choices:
      - "1, 3, 5, …"
      - "0, 2, 4, …"
      - "0, 1, 2, …"
      - "ランダム"
    answer: 1
    explain: "クライアントは 0 から始まる偶数、サーバーは 1 から始まる奇数を使い、それぞれ 2 ずつ増やします。下位ビットが送信者と合わない、または重複した Request ID を受け取ったら INVALID_REQUEST_ID でセッションを閉じます。"
  - q: "サーバーがメンテナンスのため、セッションを穏やかに別サーバーへ移したい。送るメッセージは？"
    choices:
      - "REQUEST_ERROR"
      - "PUBLISH_DONE"
      - "GOAWAY（必要なら新しいセッション URI 付き）"
      - "CONNECTION_CLOSE だけ"
    answer: 2
    explain: "GOAWAY は「もうすぐ閉じるので移ってほしい」という合図です。新しい URI とタイムアウトを含められ、クライアントは裏で新しいセッションを張って購読を移します。リクエストストリーム上で送れば、そのリクエストだけを移すこともできます。"
  - q: "MOQT の可変長整数（vi64）の説明として正しいものは？"
    choices:
      - "QUIC と同じく先頭 2 ビットで長さ（1/2/4/8 バイト）を表す"
      - "先頭バイトの「先頭から続く 1 のビット数」で長さを表し、1〜9 バイトで 64 ビット全体を表せる"
      - "常に 8 バイト固定"
      - "最上位ビットが継続フラグの LEB128"
    answer: 1
    explain: "draft-22 の vi64 は先頭の 1 ビットの数で長さが決まり、`0xxxxxxx` なら 1 バイト（0〜127）、`11111111` なら 9 バイトで 64 ビットすべてを表せます。QUIC の varint とは別物なので注意。"
---

# 04. セッションとストリームの使い方

## 🎯 この章のゴール

- MOQT セッションが **制御ストリーム（単方向×2）** と **リクエストストリーム（双方向）** と **データストリーム（単方向）** で構成されることを理解する
- SETUP によるセッション初期化と拡張のネゴシエーションを知る
- Request ID、リクエストのキャンセル、GOAWAY によるセッション移行を説明できる

## 💡 ひとことで言うと

> **1 リクエスト = 1 双方向ストリーム**。HTTP/3 と同じ発想で、リクエストごとに専用の「電話回線」を引き、用が済んだら切ります。

## ストリームの 3 つの役割

draft-22 のセッションでは、QUIC（または WebTransport）のストリームを次の 3 種類に使い分けます。

{{< diagram caption="MOQT セッションのストリーム構成" >}}
<svg viewBox="0 0 640 250" role="img" aria-label="Stream usage">
  <defs><marker id="ah4" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L8,4 L0,8z"/></marker></defs>
  <rect class="box" x="10" y="10" width="120" height="230" rx="8"/><text x="70" y="128" text-anchor="middle" font-weight="bold">クライアント</text>
  <rect class="box" x="510" y="10" width="120" height="230" rx="8"/><text x="570" y="128" text-anchor="middle" font-weight="bold">サーバー</text>
  <line class="arrow" x1="135" y1="35" x2="505" y2="35" marker-end="url(#ah4)"/><text x="320" y="28" text-anchor="middle">制御ストリーム（単方向）: SETUP, GOAWAY</text>
  <line class="arrow" x1="505" y1="65" x2="135" y2="65" marker-end="url(#ah4)"/><text x="320" y="58" text-anchor="middle">制御ストリーム（単方向）: SETUP, GOAWAY</text>
  <line class="arrow" x1="135" y1="110" x2="505" y2="110" marker-start="url(#ah4)" marker-end="url(#ah4)"/><text x="320" y="103" text-anchor="middle">リクエストストリーム（双方向）: SUBSCRIBE ⇄ SUBSCRIBE_OK …</text>
  <line class="arrow" x1="135" y1="145" x2="505" y2="145" marker-start="url(#ah4)" marker-end="url(#ah4)"/><text x="320" y="138" text-anchor="middle">リクエストストリーム（双方向）: FETCH ⇄ FETCH_OK …</text>
  <line class="arrow" x1="505" y1="190" x2="135" y2="190" marker-end="url(#ah4)"/><text x="320" y="183" text-anchor="middle">データストリーム（単方向）: SUBGROUP_HEADER + Objects</text>
  <line class="arrow" x1="505" y1="225" x2="135" y2="225" marker-end="url(#ah4)"/><text x="320" y="218" text-anchor="middle">データストリーム（単方向）: FETCH_HEADER + Objects</text>
</svg>
{{< /diagram >}}

| ストリーム | 向き | 先頭 | 中身 |
| --- | --- | --- | --- |
| 制御ストリーム | 単方向（各ピア 1 本） | `SETUP` | SETUP、GOAWAY。セッション中は **閉じてはいけない** |
| リクエストストリーム | 双方向（リクエストごと） | リクエストメッセージ | リクエスト・応答・更新・終了通知 |
| データストリーム | 単方向 | `SUBGROUP_HEADER` / `FETCH_HEADER` | Object の本体（08 章） |

制御ストリームを単方向 2 本にしているのは、**どちらのピアも準備ができ次第すぐ送り始められる** ようにするためです。0-RTT が使えればクライアントが先に、そうでなければサーバーが先に送れることもあります。

## セッションの初期化: SETUP

各ピアは自分の制御ストリームの最初に **SETUP** を送ります。中身は **Setup Option** というキーと値のペアの列です。

| Setup Option | 内容 |
| --- | --- |
| `PATH` / `AUTHORITY` | ネイティブ QUIC のとき、URI の path（+query）と authority を伝える（クライアントのみ） |
| `AUTHORIZATION TOKEN` | セッション確立用の認可トークン |
| `MAX_AUTH_TOKEN_CACHE_SIZE` | トークンのエイリアス登録に使えるキャッシュの上限 |
| `MOQT_IMPLEMENTATION` | 実装名とバージョン（相互接続のデバッグ用） |
| `MAX_FILTER_RANGES` | 受け付けるレンジフィルタ数の上限（0 ならフィルタ不可） |
| `MAX_REQUEST_UPDATES` | 1 リクエストあたりの未応答 REQUEST_UPDATE の上限 |

**未知の Setup Option は無視する**（MUST）のがルールです。拡張機能のサポート表明もこの仕組みで行います。両方の SETUP を送受信した時点で、使える拡張が確定します。

SETUP を待たずにリクエストを並行して送ることもできます。つまりクライアントは「セッション開始・購読・配信開始」を **すべて同時に** 始められます。

{{< mermaid >}}
sequenceDiagram
  participant C as クライアント
  participant S as サーバー
  Note over C,S: QUIC / WebTransport 確立
  C->>S: 制御ストリーム: SETUP (PATH, MOQT_IMPLEMENTATION, …)
  S->>C: 制御ストリーム: SETUP (MAX_REQUEST_UPDATES, …)
  C->>S: 新しい双方向ストリーム: SUBSCRIBE (Request ID = 0)
  S-->>C: 同じストリーム: SUBSCRIBE_OK
  S->>C: 単方向ストリーム: SUBGROUP_HEADER + Objects…
{{< /mermaid >}}

## リクエストストリーム

双方向ストリームの先頭に置けるのは次の 7 種類のリクエストだけです（ネゴシエーションした拡張を除く）。

`TRACK_STATUS` / `SUBSCRIBE` / `PUBLISH` / `FETCH` / `PUBLISH_NAMESPACE` / `SUBSCRIBE_NAMESPACE` / `SUBSCRIBE_TRACKS`

応答は多くの場合、共通の **REQUEST_OK** か **REQUEST_ERROR** で返します。仕様では文脈に応じて `PUBLISH_OK`（PUBLISH への REQUEST_OK）や `SUBSCRIBE_ERROR`（SUBSCRIBE への REQUEST_ERROR）のような略称で呼びます。SUBSCRIBE と FETCH だけは専用の `SUBSCRIBE_OK` / `FETCH_OK` で応答します。

### Request ID

リクエストメッセージには **Request ID** が入ります。

- クライアントは **0 から偶数**、サーバーは **1 から奇数** を使い、2 ずつ増やす
- 応答メッセージは同じストリームで返るので Request ID を持たない
- 下位ビットが送信者と合わない、または重複していたら `INVALID_REQUEST_ID` でセッションを閉じる

### 終わらせ方: FIN とキャンセル

- **FIN** は「この方向にはもう送らない」という意味で、キャンセルではありません。応答側が必要なメッセージ（例: 購読なら最後の PUBLISH_DONE）を送り終えてから FIN すると、そのリクエストは完了です
- **キャンセル** は、送信方向を RESET_STREAM、受信方向を STOP_SENDING で打ち切ること
- 何も処理せずに断るときは REQUEST_ERROR を送って FIN します

REQUEST_ERROR には **Retry Interval**（再試行までの最小ミリ秒 + 1。0 なら再試行しない）や、エラーコード `REDIRECT` のときの転送先（別の URI やトラック名）を含められます。

## 📜 ワイヤーフォーマットの基本

### 制御メッセージの形

制御ストリームとリクエストストリーム上のメッセージはすべて同じ形です。

```text
MOQT Control Message {
  Message Type (vi64),
  Message Length (16),   ← 16 ビット固定。メッセージは最大 65,535 バイト
  Message Body (..),
}
```

未知のメッセージタイプを受け取ったらセッションを閉じます。長さはあっても「読み飛ばしてよい」わけではありません。

### 可変長整数 vi64

MOQT 独自の可変長整数で、**先頭バイトの「先頭から続く 1 の数」** で長さを表します。QUIC の varint（先頭 2 ビットで 1/2/4/8 バイト）とは違うので注意しましょう。

| 先頭ビット | バイト数 | 範囲 |
| --- | --- | --- |
| `0` | 1 | 0〜127 |
| `10` | 2 | 0〜16,383 |
| `110` | 3 | 0〜2,097,151 |
| … | … | … |
| `11111110` | 8 | 0〜2^56−1 |
| `11111111` | 9 | 0〜2^64−1 |

例: `0x25` = 37、`0x8025` も 37（最短でなくてもよい）、`0xbbbd` = 15,293。

### Key-Value-Pair

Setup Option やプロパティは Key-Value-Pair で表します。**Type が偶数なら値は vi64 1 個、奇数なら Length + バイト列**。Type は直前の Type からの差分（Delta Type）で書くので、昇順に並べると小さく済みます。

> [!NOTE] メッセージパラメータは別物
> SUBSCRIBE などに付く **Message Parameter** も差分符号化した Type を使いますが、値の形式はパラメータごとに定義され、**未知のパラメータを受け取ったらセッションを閉じます**（PROTOCOL_VIOLATION）。読み飛ばせない代わりに、個数で範囲を区切ります。Setup Option（未知は無視）との違いに注意。

## 0-RTT

ネイティブ QUIC では 0-RTT で最初のパケットから SUBSCRIBE などを送れます。MOQT のメッセージは基本的にリプレイされても安全（SUBSCRIBE はトラックの中身を変えない、重複 Object は ID で捨てられる）ですが、リレーに無駄な上流購読をさせる恐れがあるため、リレーはハンドシェイク完了まで上流購読を遅らせたり 0-RTT を拒否したりしてもかまいません。なお WebTransport は CONNECT が安全なメソッドでないため、0-RTT は使わない想定です。

## セッションの終了と移行

- 終了: ネイティブ QUIC なら CONNECTION_CLOSE、WebTransport なら CLOSE_WEBTRANSPORT_SESSION。エラーコードは `NO_ERROR`、`PROTOCOL_VIOLATION`、`GOAWAY_TIMEOUT` など
- **GOAWAY**: 長時間のライブでは「全セッションが自然に終わるまで待つ」と何日もかかります。サーバーは GOAWAY で **新しい URI（省略時は同じ URI）とタイムアウト** を伝え、クライアントは裏で新セッションを張って購読や名前空間の公開を移します

{{< mermaid >}}
sequenceDiagram
  participant C as クライアント
  participant R1 as リレー A（停止予定）
  participant R2 as リレー B
  R1->>C: GOAWAY (New Session URI = moqt://b.example, Timeout = 30000)
  C->>R2: 新しいセッション + SUBSCRIBE（同じトラック）
  R2-->>C: SUBSCRIBE_OK
  C->>R1: 旧購読をキャンセル
  C->>R1: セッションを NO_ERROR で閉じる
{{< /mermaid >}}

GOAWAY は **リクエストストリーム上** で送ることもでき、その場合はそのリクエストだけを移します（例: 同じトラックのパブリッシャとサブスクライバを同じリレーに寄せる）。

## 🧪 考えてみよう

なぜ draft-22 は「制御メッセージを 1 本の双方向ストリームに全部流す」のをやめて、リクエストごとにストリームを分けたのでしょう？ 1 本のストリームだと、ある応答のパケットロスが無関係なリクエストまで止めてしまいます（HoL ブロッキングの再来）。ストリームを分ければ、リクエストの終了も FIN / RESET_STREAM という QUIC の仕組みで自然に表現できます。

## 📝 まとめ

- **制御ストリーム（単方向×2、SETUP から）**、**リクエストストリーム（双方向、1 リクエスト 1 本）**、**データストリーム（単方向）**
- Request ID はクライアント偶数・サーバー奇数。応答は REQUEST_OK / REQUEST_ERROR が基本
- 可変長整数 vi64 は先頭の 1 の数で長さを決める MOQT 独自形式
- GOAWAY でセッション（またはリクエスト単位）を別サーバーへ穏やかに移せる

## 参考

- [draft-ietf-moq-transport-22 §6.3 Session initialization / §6.4 Stream Usage](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-6.3)
- [§8 Notational Conventions / §9.1 SETUP / §9.2 GOAWAY](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-9.1)

## ✅ 理解度クイズ

{{< quiz >}}
