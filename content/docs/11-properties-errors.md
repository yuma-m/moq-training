---
title: "11. プロパティ・エラー・拡張性"
weight: 110
quiz:
  - q: "Message Parameter と Track / Object Property の違いとして正しいものは？"
    choices:
      - "どちらもリレーがそのまま下流へ転送する"
      - "Message Parameter はそのメッセージの相手だけに向けたもので転送されない。Property はトラックや Object に付随し、リレーが転送・キャッシュする"
      - "Property は暗号化必須"
      - "Message Parameter は Object ごとに付く"
    answer: 1
    explain: "パラメータは「この購読をどう届けてほしいか」のような 1 区間の取り決めで、リレーは転送しません。プロパティはトラック / Object のデータの一部で、未知のものも含めて転送・キャッシュされます。"
  - q: "リレーが知らない（未対応の）Object Property を受け取った。どうする？"
    choices:
      - "削除して転送する"
      - "セッションを閉じる"
      - "変更せずに転送し、Object と一緒にキャッシュする"
      - "値を 0 にして転送する"
    answer: 2
    explain: "未知のプロパティは改変せず、転送し、キャッシュしなければなりません（MUST）。これにより、リレーを更新しなくても新しいプロパティを導入できます。例外は Mandatory Track Property です。"
  - q: "Immutable Properties の目的は？"
    choices:
      - "プロパティを暗号化してリレーから隠す"
      - "オリジナルのパブリッシャが付け、リレーが追加・変更・削除できないプロパティの入れ物にし、エンドツーエンドの認証を可能にする"
      - "プロパティのサイズを圧縮する"
      - "トラックを削除できないようにする"
    answer: 1
    explain: "Immutable Properties の中身はリレーから読めますが、変更・削除はできず、シリアライズも変えてはいけません。そのため暗号化の AAD（認証付きデータ）に含めて改ざんを検知できます。"
  - q: "GREASE の目的は？"
    choices:
      - "通信を高速化する"
      - "予約された「意味のない値」を実際に送ることで、未知の値を正しく無視しない実装をあぶり出し、プロトコルの硬直化を防ぐ"
      - "エラーを隠す"
      - "暗号化の鍵を交換する"
    answer: 1
    explain: "未知の値で落ちる実装が広まると、将来の拡張ができなくなります（ossification）。GREASE 値（0x7f × N + 0x9D）を混ぜて送ることで、未知の値を正しく扱える実装であることを日常的に確かめます。"
---

# 11. プロパティ・エラー・拡張性

## 🎯 この章のゴール

- Message Parameter と Track / Object Property の違いを説明できる
- 代表的なプロパティ（優先度の既定値、キャッシュ期間、Gap、Immutable Properties）を知る
- エラーの 4 つの層と、GREASE による拡張性の確保を理解する

## 💡 ひとことで言うと

> **パラメータは「配達員へのメモ」、プロパティは「荷物に貼られたラベル」**。メモはその区間の配達員だけが読んで捨てる。ラベルは荷物と一緒に最後まで旅をします。

## パラメータ vs プロパティ

| | Message Parameter | Track Property | Object Property |
| --- | --- | --- | --- |
| 付く場所 | 制御メッセージ（SUBSCRIBE など） | PUBLISH・SUBSCRIBE_OK・FETCH_OK などの末尾 | Object ヘッダー |
| 誰向け | そのメッセージの相手だけ | トラックの全受信者 | Object の全受信者 |
| リレーは転送？ | ❌ しない（参考にはする） | ✅ する | ✅ する |
| 未知の値 | セッションを閉じる（PROTOCOL_VIOLATION） | 転送・キャッシュする | 転送・キャッシュする |
| 例 | `SUBSCRIBER_PRIORITY`、`LOCATION_FILTER` | `DEFAULT_PUBLISHER_PRIORITY`、`MAX_CACHE_DURATION` | `Prior Group ID Gap`、LOC の Timestamp |

> [!NOTE] 📜 仕様メモ: パラメータで中身は変わらない
> SUBSCRIBE や FETCH のパラメータは、届け方（範囲・優先度・タイムアウトなど）を変えるだけで、Object のペイロードを変えさせてはいけません。トラック名がキャッシュキーとして機能する前提（スコープ内の一意性）を守るためです。

## draft-22 で定義されているプロパティ

| プロパティ | Type | 対象 | 意味 |
| --- | --- | --- | --- |
| `OBJECT_DELIVERY_TIMEOUT` | 0x02 | Track / Object | Object の遅延タイムアウト（09 章） |
| `MAX_CACHE_DURATION` | 0x04 | Track | キャッシュから配ってよい最大ミリ秒 |
| `SUBGROUP_DELIVERY_TIMEOUT` | 0x06 | Track / Object | Subgroup の遅延タイムアウト |
| Immutable Properties | 0x0B | Track / Object | 変更不可のプロパティを入れる箱 |
| `DEFAULT_PUBLISHER_PRIORITY` | 0x0E | Track | Publisher Priority の既定値（省略時 128） |
| `DEFAULT_PUBLISHER_GROUP_ORDER` | 0x22 | Track | パブリッシャ希望の Group Order（省略時 Ascending） |
| `DYNAMIC_GROUPS` | 0x30 | Track | NEW_GROUP_REQUEST に対応するか |
| Prior Group ID Gap | 0x3C | Object | この Group の前の N 個の Group は存在しない |
| Prior Object ID Gap | 0x3E | Object | この Object の前の N 個の Object は存在しない |

Key-Value-Pair なので、Type が偶数なら値は vi64、奇数ならバイト列です（04 章）。

### アプリ用の予約範囲

`0x78〜0x7F`（1 バイト）と `0x3800〜0x3FFF`（2 バイト）は **アプリ専用** で、IANA が将来割り当てることはありません。登録なしにフォーマット固有のメタデータに使えます。リレーは意味を解釈せずそのまま転送します。

### Gap プロパティ: 「ない」ことを伝える

Object ID や Group ID の飛びは、それだけでは「存在しない」のか「まだ届かない」のか分かりません（03 章）。オリジナルのパブリッシャは Gap プロパティで明示できます。

- Group 7 の次に Group 10 を出すなら、Group 10 の Object に **Prior Group ID Gap = 2**（8 と 9 は存在しない）
- Object 7 の次に Object 10 を出すなら、Object 10 に **Prior Object ID Gap = 2**

付けられるのはオリジナルのパブリッシャだけで、リレーは追加してはいけません。

### Immutable Properties: 改ざんできないラベル

通常のプロパティはリレーが（規則の範囲で）追加・変更できます。オリジナルのパブリッシャが「リレーに見せたいが変えられたくない」メタデータは **Immutable Properties** に入れます。

```text
Object Header                                    Object Payload
+--------+-------+------------+-------+   +--------------------+
| Object | Ext 1 | Immutable  | Ext N |   | Private Properties |
| Fields |       | Properties |       |   | App Payload        |
+--------+-------+------------+-------+   +--------------------+
                  ^^^^^^^^^^^^              ^^^^^^^^^^^^^^^^^^^^
                  e2e で認証（AAD）           e2e で暗号化 + 認証
Ext 1, Ext N はリレーが変更・削除してよい
```

- リレーは中身を読めるが、追加・変更・削除・再シリアライズは禁止
- そのため暗号化の **AAD（認証付き追加データ）** に含めて、改ざんを検知できる
- リレーに見せる必要すらないメタデータは、プロパティではなく **ペイロードの中** に入れる（LOC の Private Properties など、12 章）

### Mandatory Track Properties

Type `0x4000〜0x7FFF` のトラックプロパティは **「理解できないなら扱ってはいけない」** 必須プロパティです。未知の必須プロパティ付きのトラックを受け取ったエンドポイントは、そのトラックを処理も転送もせず、`UNSUPPORTED_EXTENSION` で断ります。後方互換性のないトラック形式を安全に導入するための仕組みです。

## エラーの 4 つの層

| 層 | 伝え方 | 主なコード |
| --- | --- | --- |
| セッション | CONNECTION_CLOSE / CLOSE_WEBTRANSPORT_SESSION | `NO_ERROR`、`PROTOCOL_VIOLATION`、`INVALID_REQUEST_ID`、`DUPLICATE_TRACK_ALIAS`、`GOAWAY_TIMEOUT`、`TOO_MANY_REQUEST_UPDATES` |
| リクエスト | REQUEST_ERROR | `UNAUTHORIZED`、`DOES_NOT_EXIST`、`INVALID_RANGE`、`TIMEOUT`、`REDIRECT`、`PREFIX_OVERLAP`、`UNINTERESTED`、`UNSUPPORTED_EXTENSION` |
| 購読の終了 | PUBLISH_DONE の Status Code | `TRACK_ENDED`、`EXPIRED`、`TOO_FAR_BEHIND`、`UPDATE_FAILED`、`GOING_AWAY`、`MALFORMED_TRACK` |
| データストリーム | RESET_STREAM のエラーコード | `DELIVERY_TIMEOUT`、`CANCELLED`、`SESSION_CLOSED`、`UNKNOWN_OBJECT_STATUS`、`TOO_FAR_BEHIND` |

### Malformed Track（不正なトラック）

パブリッシャが MOQT の制約を破ったトラックは **Malformed** とみなされます。例:

- 同じ Subgroup の Object なのに Publisher Priority が前と違う
- Subgroup の最後（FIN の直前）より大きい Object ID が届いた
- Group の最後（End of Group）より大きい Object ID が届いた
- 同じ Object なのに中身や Subgroup ID が違う

検出したリレーは `MALFORMED_TRACK` で購読や FETCH を終わらせます。

## GREASE: 未知の値に強い実装を育てる

拡張性のあるプロトコルでも、「未知の値を受け取ると落ちる実装」が広まると、事実上新しい値を使えなくなります（**ossification（硬直化）**）。MOQT は RFC 9170 の考え方に従い、意味のない予約値 **GREASE** を定義しています。

```text
GREASE 値 = 0x7f × N + 0x9D   （0x9D, 0x11C, …）
```

Setup Option、プロパティ、各種エラーコード、認可トークンの種類などのレジストリに GREASE 値が予約されています。実装は日常的にこれらを混ぜて送り、受信側は次のルールで扱います。

- 未知の Setup Option → 無視
- 未知のプロパティ → 本章の規則どおり転送・キャッシュ
- 未知のエラーコード → その文脈の `INTERNAL_ERROR` と同じ扱い（REQUEST_ERROR や PUBLISH_DONE の未知コードでセッションを閉じてはいけない）

## 🧪 考えてみよう

あなたの会社独自の「シーン切り替えフラグ」を Object に付けて、リレー経由で視聴アプリに伝えたい。どこに入れるのがよいでしょう？ リレーが見る必要がなく、秘匿したいなら **ペイロード内**。リレーにも見せたい（例: リレーが切り替え点で何かする）なら **アプリ用予約範囲の Object Property**。改ざんされたくなければ **Immutable Properties の中** に入れます。

## 📝 まとめ

- **パラメータ** は 1 区間の取り決め（転送されない、未知はエラー）、**プロパティ** はデータの一部（転送・キャッシュ、未知も保持）
- Gap プロパティで「存在しない」を明示、Immutable Properties で改ざん検知、Mandatory Track Properties で非互換な拡張を安全に導入
- エラーはセッション / リクエスト / 購読 / ストリームの 4 層。GREASE で未知の値への耐性を保つ

## 参考

- [draft-ietf-moq-transport-22 §8.4 Track and Object Properties / §10 MOQT Properties](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-10)
- [§12 Error Handling / §13 Grease](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-12)
- [RFC 9170: Long-Term Viability of Protocol Extension Mechanisms](https://www.rfc-editor.org/rfc/rfc9170)

## ✅ 理解度クイズ

{{< quiz >}}
