---
title: "03. データモデル: Track・Group・Object"
weight: 30
quiz:
  - q: "MOQT で Object を一意に特定する組み合わせはどれ？"
    choices:
      - "Track Alias と Object ID"
      - "Track Namespace・Track Name・Group ID・Object ID"
      - "Group ID と Subgroup ID"
      - "セッション ID と Request ID"
    answer: 1
    explain: "Object は Full Track Name（Namespace + Name）と Group ID・Object ID で一意に決まり、どこからどう取得しても同じバイト列でなければなりません。Track Alias はセッション内の省略表現にすぎません。"
  - q: "Group の役割として正しいものは？"
    choices:
      - "暗号鍵の単位"
      - "新しいサブスクライバが途中参加できる「参加ポイント」"
      - "1 つの QUIC パケット"
      - "必ず 1 秒分のデータ"
    answer: 1
    explain: "Group は他の Group に依存しない（SHOULD）独立した単位で、join point になります。映像なら GOP（キーフレームから始まるフレーム列）を 1 Group にするのが典型です。"
  - q: "Location {5, 3} と {4, 100} の大小関係は？"
    choices:
      - "{5, 3} < {4, 100}"
      - "{5, 3} > {4, 100}"
      - "等しい"
      - "比較できない"
    answer: 1
    explain: "Location はまず Group で比較し、Group が同じときだけ Object で比較します。5 > 4 なので {5, 3} の方が大きくなります。"
  - q: "名前空間プレフィックス `(live, sports)` にマッチする Track Namespace は？"
    choices:
      - "`(live)`"
      - "`(live, sportsnews)`"
      - "`(live, sports, soccer)`"
      - "`(sports, live)`"
    answer: 2
    explain: "プレフィックス一致はフィールド単位の完全一致で先頭から比較します。`sportsnews` は `sports` とフィールドとして一致しないのでマッチしません。"
  - q: "Object のメタデータとペイロードについて正しい説明は？"
    choices:
      - "どちらもリレーが暗号化を解除して読む"
      - "メタデータは常にリレーから見え、ペイロードはエンドツーエンドで暗号化してもよい"
      - "メタデータは暗号化必須、ペイロードは平文必須"
      - "リレーはペイロードを結合・分割して最適化してよい"
    answer: 1
    explain: "メタデータ（Group ID、優先度など）は暗号化されず、リレーの配信判断に使われます。ペイロードは不透明で、リレーは結合・分割・改変してはいけません（MUST NOT）。"
---

# 03. データモデル: Track・Group・Object

## 🎯 この章のゴール

- Track → Group → Subgroup → Object の階層を説明できる
- Location による順序付けと Group ID の性質を理解する
- Track Namespace（タプル）とプレフィックス一致、スコープを知る

## 💡 ひとことで言うと

> Track は「テレビのチャンネル」、Group は「途中から見始められる区切り（GOP）」、Object は「1 コマ」。サブスクライバはチャンネルを選び、区切りから見始めます。

## 4 階層のデータモデル

{{< diagram caption="MOQT のデータモデル。映像なら 1 Group = 1 GOP、1 Object = 1 フレームが典型" >}}
<svg viewBox="0 0 640 260" role="img" aria-label="Track Group Subgroup Object hierarchy">
  <rect class="box" x="10" y="10" width="620" height="240" rx="8"/>
  <text x="22" y="32" font-weight="bold">Track: (example.com, live, alice) / video-1080p</text>
  <rect class="accent" x="22" y="45" width="290" height="190" rx="6"/>
  <text x="34" y="66" font-weight="bold">Group 41（GOP）</text>
  <rect class="box" x="34" y="78" width="266" height="70" rx="4"/>
  <text x="44" y="96">Subgroup 0（ベースレイヤー）</text>
  <rect class="ok" x="44" y="106" width="56" height="30" rx="3"/><text x="72" y="126" text-anchor="middle">Obj 0</text>
  <rect class="ok" x="106" y="106" width="56" height="30" rx="3"/><text x="134" y="126" text-anchor="middle">Obj 2</text>
  <rect class="ok" x="168" y="106" width="56" height="30" rx="3"/><text x="196" y="126" text-anchor="middle">Obj 4</text>
  <rect class="box" x="34" y="156" width="266" height="70" rx="4"/>
  <text x="44" y="174">Subgroup 1（拡張レイヤー）</text>
  <rect class="ok" x="44" y="184" width="56" height="30" rx="3"/><text x="72" y="204" text-anchor="middle">Obj 1</text>
  <rect class="ok" x="106" y="184" width="56" height="30" rx="3"/><text x="134" y="204" text-anchor="middle">Obj 3</text>
  <rect class="ok" x="168" y="184" width="56" height="30" rx="3"/><text x="196" y="204" text-anchor="middle">Obj 5</text>
  <rect class="accent" x="326" y="45" width="290" height="190" rx="6"/>
  <text x="338" y="66" font-weight="bold">Group 42（次の GOP）</text>
  <rect class="box" x="338" y="78" width="266" height="70" rx="4"/>
  <text x="348" y="96">Subgroup 0</text>
  <rect class="ok" x="348" y="106" width="56" height="30" rx="3"/><text x="376" y="126" text-anchor="middle">Obj 0</text>
  <rect class="ok" x="410" y="106" width="56" height="30" rx="3"/><text x="438" y="126" text-anchor="middle">Obj 2</text>
  <text x="480" y="126" class="muted">…</text>
  <text x="348" y="180" class="muted">1 Subgroup ≒ 1 QUIC ストリーム</text>
  <text x="348" y="200" class="muted">Group は独立して復号できる</text>
</svg>
{{< /diagram >}}

### Object: 最小単位

Object は番地の付いたバイト列です。MOQT のデータモデルの基本要素で、次のフィールドを持ちます。

| フィールド | 意味 |
| --- | --- |
| Track Namespace / Track Name | 所属するトラック |
| Group ID | 所属する Group |
| Object ID | Group 内での順番 |
| Publisher Priority | パブリッシャが付けた優先度（09 章） |
| Delivery Mode | Subgroup（ストリーム）で送るか Datagram で送るか |
| Subgroup ID | 所属する Subgroup（Datagram の場合はなし） |
| Object Properties | リレーから見えるキーと値のペア（11 章） |
| Object Payload | 中身（空でもよい） |

Object には 2 つのルールがあります。まず、Object はどの経路で取得しても同じバイト列で、内容は時間が経っても変わってはいけません（MUST NOT）。取得できなくなることはあります。

次に、メタデータは暗号化されず、リレーから常に見えます。ペイロードはエンドツーエンドで暗号化してよく、その場合はオリジナルのパブリッシャとエンドサブスクライバだけが読めます。

### Subgroup: 同じストリームに乗せる単位

Subgroup は同じ Group 内の Object を Object ID 昇順に並べた列で、できる限り 1 本のストリームで送られます。B が A に依存するなら、A の後ろに B を同じストリームで流すと都合がよい、という考え方です。

上の図のように、時間方向スケーラビリティ（temporal scalability）のある映像なら、レイヤーごとに Subgroup を分けておくと、帯域が足りないときに優先度で拡張レイヤーだけを諦められます。

### Group: 参加ポイント

Group は Object の集まりで、他の Group の Object に依存しないように作ります（SHOULD NOT）。そのため Group の先頭が途中参加の入口（join point）になります。映像なら GOP（キーフレーム + 後続フレーム）を 1 Group にするのが定番です。

> [!NOTE] 📜 仕様メモ: Group ID
> Group ID は、メディアの時間軸に沿って時間とともに増えるように付けるべき（SHOULD）とされます。ただしネットワークの並べ替えや部分的信頼性のため、受信側には Group が順不同で届きえます。受信側は Object を 1 つ受け取るまで、その Group が存在するかどうか推測できません。

### Track: 購読の単位

Track は Group の列で、サブスクライバが購読を申し込む対象です。解像度違いの映像は別々の Track にしておけば、視聴者が環境に合わせて選べます。

## Location: Object の座標

Group ID と Object ID の組を Location と呼び、`{Group, Object}` と書きます。

```text
Location A < Location B  ⇔  A.Group < B.Group || (A.Group == B.Group && A.Object < B.Object)
```

例: `{4, 100} < {5, 0} < {5, 3}`。次章以降で出てくる「Largest Object」「Next Group」などもすべて Location で表します。

## Object の 3 つの状態

サブスクライバやキャッシュから見ると、Object は次のどれかの状態です。

1. 存在しないと分かっている。この状態は恒久的で、元には戻らない
2. 存在すると分かっている。後で「存在しない（取得不能）」に変わることはある
3. 不明。まだ届いていないか、まだ作られていない

Object ID が飛んでいても、それだけでは何も分かりません。飛んだ番号は、受信するか「存在しない」と明示されるまで不明のままです。

## Track の名前: Namespace + Name

Track は Full Track Name（Track Namespace + Track Name）で識別されます。

- Track Namespace: 0〜32 個のフィールドからなるタプル。例: `(example.com, live, alice)`
- Track Name: Namespace 内で Track を区別するバイト列。例: `video-1080p`

どちらも単なるバイト列で、比較はバイト単位の完全一致です（UTF-8 などに制限するのは上位の仕様の役目）。Full Track Name の合計長は 4,096 バイトまでです。

### プレフィックス一致

タプルなので「先頭のいくつかのフィールド」で範囲を指定できます。比較はフィールド単位の完全一致です。

| プレフィックス | `(live, sports, soccer)` | `(live, sportsnews)` |
| --- | --- | --- |
| `(live)` | ✅ | ✅ |
| `(live, sports)` | ✅ | ❌（`sports` ≠ `sportsnews`） |

この性質を使って、リレーは「`(example.com, live)` 以下はこのパブリッシャへ」のようにルーティングします（07 章）。

### 文字列で書くときの表記

ログやファイル名用に、次の表記が推奨されています。

- フィールドを `-` でつなぎ、最後のフィールドと Track Name の間は `--`
- `a-z A-Z 0-9 _` はそのまま、それ以外のバイトは `.` + 小文字 16 進 2 桁

```text
example.2enet-team2-project_x--report
  Namespace: (example.net, team2, project_x)
  Track name: report
```

### 予約された名前空間

最初のフィールドが `.`（ピリオド）で始まる名前空間は予約されています。たとえば `.session` はセッション単位の機能拡張用で、アプリが使ってはいけません。

## スコープ: 名前が一意な範囲

スコープは、Full Track Name が特定のトラックを一意に指すことが保証されるサーバーの集合です。どこまでをスコープとするかはアプリが決めます（LAN 内の 1 接続だけ、複数 CDN 全体、など）。特に情報がなければ、接続 URI の authority と path が同じなら同じスコープです。

スコープ内で Full Track Name は一意なので、そのままキャッシュのキーになります。HTTP と違って、リクエストのパラメータでトラックの中身が変わることはありません。

> [!TIP] パブリッシャが再起動したら？
> 再起動で状態を失ったパブリッシャが同じ Track に以前と違う Object を出すと、不変性の約束を破ります。対策として、名前に時刻を含める、Group ID を現在時刻から始めて必ず以前より大きくする、TRACK_STATUS で以前の最大 Group ID を問い合わせる、などが挙げられています。

## 🧪 考えてみよう

1080p と 480p の映像、それに日本語音声と英語音声を配信したいとき、Track はいくつ作るのが自然でしょう？ 視聴者が独立に選びたいものは別 Track にするのが基本なので、映像 2 + 音声 2 の 4 Track が自然です。MSF ではさらに、それらを説明するカタログ用の Track を置きます（12 章）。

## 📝 まとめ

- 階層は Track（購読単位）→ Group（参加ポイント）→ Subgroup（ストリーム単位）→ Object（不変のバイト列）
- Object は Full Track Name + Location `{Group, Object}` で一意。メタデータは見え、ペイロードは秘匿できる
- Track Namespace はタプルで、フィールド単位のプレフィックス一致でルーティングに使う

## 参考

- [draft-ietf-moq-transport-22 §2 Object Data Model](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-2)
- [§8.2 Location / §8.8 Representing Namespace and Track Names](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-8.2)

## ✅ 理解度クイズ

{{< quiz >}}
