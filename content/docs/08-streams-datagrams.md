---
title: "08. データの運び方: ストリームとデータグラム"
weight: 80
quiz:
  - q: "購読で Object を送るとき、Subgroup と QUIC ストリームの関係として正しいものは？"
    choices:
      - "全 Subgroup を 1 本のストリームに多重化する"
      - "Object ごとに必ず新しいストリームを開く"
      - "異なる Subgroup の Object を同じストリームに混ぜてはいけず、同じ Subgroup は原則 1 本のストリームで送る"
      - "Subgroup はデータグラム専用"
    answer: 2
    explain: "購読では、2 つの Subgroup を同じストリームに乗せてはならず、同じ Subgroup を別々のストリームに分けてもいけません（途中リセットなどの例外を除く）。典型的には 1 Subgroup = 1 ストリームです。"
  - q: "SUBGROUP_HEADER の END_OF_GROUP ビットが 1 のストリームが FIN で終わった。何が分かる？"
    choices:
      - "トラックが終わった"
      - "このストリームの最後の Object より大きい Object ID はその Group に存在しない"
      - "次の Group がすぐ始まる"
      - "ストリームがリセットされた"
    answer: 1
    explain: "END_OF_GROUP は「この Subgroup が Group の最大の Object を含む」という印です。FIN で正常に終われば、最後に受け取った Object がその Group の最後だと分かります（リセットされた場合は分かりません）。"
  - q: "Delivery Mode が Datagram の Object の特徴は？"
    choices:
      - "必ず再送される"
      - "1 データグラムに 1 Object。最大サイズを超えると通知なく捨てられる"
      - "複数の Object をまとめて 1 データグラムに入れる"
      - "Subgroup ID を必ず持つ"
    answer: 1
    explain: "OBJECT_DATAGRAM は 1 つの Object を 1 データグラムで運びます。再送されず、セッションの最大データグラムサイズを超えると黙って捨てられます。経路上でプロパティが追加されてサイズが増えることにも注意が必要です。"
  - q: "Subgroup ストリームの途中で、遅延タイムアウトにより残りの Object を送らないことにした。パブリッシャはどうする？"
    choices:
      - "FIN でストリームを閉じる"
      - "ストリームをリセットする（RESET_STREAM / RESET_STREAM_AT）"
      - "空の Object を送り続ける"
      - "何もしない"
    answer: 1
    explain: "Subgroup の Object をすべて送り終えたら FIN、送り切らずに閉じるなら必ずリセットです。FIN は「これで全部」という意味になるので、途中で打ち切るときに使ってはいけません。"
---

# 08. データの運び方: ストリームとデータグラム

## 🎯 この章のゴール

- Object がどのように QUIC のストリームやデータグラムに載るかを理解する
- SUBGROUP_HEADER・OBJECT_DATAGRAM・FETCH_HEADER の構造を読める
- ストリームの FIN とリセットの使い分け、Object Status を知る

## 💡 ひとことで言うと

> ストリームは書留の連続便、データグラムはハガキです。連続便は順番どおり確実に届き、途中で打ち切ることもできます。ハガキは速くて軽い代わりに、届かなくても再送されません。

## 3 種類のデータの入れ物

| 入れ物 | 先頭 | 用途 |
| --- | --- | --- |
| Subgroup ストリーム（単方向） | `SUBGROUP_HEADER` | 購読の Object（Delivery Mode = Subgroup） |
| OBJECT_DATAGRAM | Type Flags | 購読の Object（Delivery Mode = Datagram） |
| Fetch ストリーム（単方向） | `FETCH_HEADER` | FETCH と fill の応答 |

オリジナルのパブリッシャが最初にどちらで送ったかで、その Object の Delivery Mode が決まり、以後の購読では同じモードで送らなければなりません。1 つの Group の中で両方を混ぜてもかまいません。

単方向ストリームの先頭の vi64 がストリームの種類を表します。

| ID | 種類 |
| --- | --- |
| `0x05` | FETCH_HEADER |
| `0b0XX1XXXX`（ビット 4 が 1） | SUBGROUP_HEADER |
| `0x2F00` | SETUP（制御ストリーム） |
| `0x132B3E28` | PADDING |

## Subgroup ストリーム

### ヘッダー

```text
SUBGROUP_HEADER {
  Type Flags (vi64),           ← 1 バイトに収まるフラグの集まり
  Track Alias (vi64),
  Group ID (vi64),
  [Subgroup ID (vi64),]        ← フラグによっては省略
  [Publisher Priority (8),]    ← フラグによっては省略
}
```

<div class="wire">

| Type Flags のビット | 名前 | 意味 |
| --- | --- | --- |
| `0x01` | PROPERTIES | 各 Object に Properties フィールドがある |
| `0x06`（2 ビット） | SUBGROUP_ID_MODE | `00`: Subgroup ID は 0 / `01`: 最初の Object ID と同じ / `10`: ヘッダーに書く / `11`: 予約 |
| `0x08` | END_OF_GROUP | この Subgroup に Group の最後の Object が含まれる |
| `0x10` | （常に 1） | SUBGROUP_HEADER であることを示す |
| `0x20` | DEFAULT_PRIORITY | 優先度を省略し、購読の既定値を使う |
| `0x40` | FIRST_OBJECT | 最初の Object が、この Subgroup で最初に公開された Object である |

</div>

よくある Subgroup ID の付け方（0 固定、先頭の Object ID と同じ）なら ID を書かずに済み、優先度も既定値なら省略できます。ヘッダーを数バイトに抑える工夫です。

### Object の並び

ヘッダーの後ろに Object が続きます。

```text
{
  Object ID Delta (vi64),        ← 直前の Object ID + 1 からの差（連番なら常に 0）
  [Properties (..),]             ← PROPERTIES ビットが 1 のとき
  Object Payload Length (vi64),
  [Object Status (vi64),]        ← ペイロード長が 0 のときだけ
  [Object Payload (..),]
}
```

Object ID が 0, 1, 2, … と連番なら Delta はすべて 0 です。Delta が 0 でなくても、間の Object が存在しないとは推測できません（Prior Object ID Gap プロパティがあれば別、11 章）。

### Object Status

ペイロード長 0 の Object は、状態を伝える特別な Object にできます。

| 値 | 意味 |
| --- | --- |
| `0x0` Normal | 通常の Object（長さ 0 の空 Object） |
| `0x3` End of Group | この Object ID 以降はこの Group に存在しない |
| `0x4` End of Track | この Location 以降は存在しない（トラック終了） |

Subgroup の終わりを示す Status はありません。Subgroup の終わりはストリームの FIN で表します。

### FIN とリセットの使い分け

| 状況 | 閉じ方 |
| --- | --- |
| Subgroup の Object をすべて送った | FIN |
| 送り切る前にやめる（遅延タイムアウト、購読キャンセル、範囲の縮小、一時停止など） | リセット（RESET_STREAM / RESET_STREAM_AT） |

FIN は「これで全部」という意味なので、途中で打ち切るのにも使うと、受信側やキャッシュが「Subgroup はここで終わり」と誤解してしまいます。RESET_STREAM_AT を使う場合は、reliable_size にストリームヘッダーを含めておくと、受信側がどの購読のストリームか把握でき、PUBLISH_DONE の Stream Count の勘定も合います。

> [!NOTE] 📜 仕様メモ: リレーは並べ替えない
> リレーは、複数の Object が流れるストリームを転送するとき、Object を並べ替えたり捨てたりしてはいけません（MUST NOT）。既存の Subgroup ストリームには「次の Object」しか続けて送れません。

## データグラム

```text
OBJECT_DATAGRAM {
  Type Flags (vi64),
  Track Alias (vi64),
  Group ID (vi64),
  [Object ID (vi64),]           ← ZERO_OBJECT_ID なら省略（Object ID = 0）
  [Publisher Priority (8),]     ← DEFAULT_PRIORITY なら省略
  [Properties (..),]            ← PROPERTIES なら存在
  [Object Status (vi64),]       ← STATUS なら存在（ペイロードなし）
  [Object Payload (..),]        ← 長さフィールドなし。データグラムの残り全部
}
```

<div class="wire">

| ビット | 名前 | 意味 |
| --- | --- | --- |
| `0x01` | PROPERTIES | Properties あり |
| `0x02` | END_OF_GROUP | この Object がこの Group の最後 |
| `0x04` | ZERO_OBJECT_ID | Object ID を省略（= 0） |
| `0x08` | DEFAULT_PRIORITY | 優先度を省略 |
| `0x10` | （予約、必ず 0） | — |
| `0x20` | STATUS | ペイロードの代わりに Object Status |

</div>

データグラムは 1 Object = 1 データグラムで、再送されません。セッションの最大データグラムサイズを超える Object は通知なしに捨てられます。経路上の各セッションで最大サイズが違ううえ、リレーがプロパティを追加すると大きくなるので、余裕を持ったサイズにしましょう。

向いているのは、小さくて、失われても次のデータですぐ置き換わるもの（低ビットレート音声の 1 フレーム、センサー値、カーソル位置など）です。

## Fetch ストリーム

FETCH と fill の応答は 1 本のストリームにまとめて流れます。Object ごとに Group ID や Subgroup ID が変わりうるので、各 Object の前に Serialization Flags が付き、「Subgroup ID は前と同じ / +1 / 0 / 明示」「Group ID は前と同じか」などを表して、繰り返しを省略します。

Flags の特別な値は、06 章の「隙間の印」です。

| 値 | 意味 |
| --- | --- |
| `0x8C` | End of Non-Existent Range |
| `0x10C` | End of Unknown Range |
| `0x20C` | End of Timed-Out Range |

## パディング

draft-22 にはパディング用のストリーム（PADDING）とデータグラムがあります。中身に意味はなく、受信側は捨てるだけです。帯域推定のプローブ（輻輳制御が「アプリ側のデータ不足」で帯域を過小評価しないよう、ダミーデータを流す）などに使えます（09 章）。

## 🧪 考えてみよう

30fps の映像で、1 GOP（2 秒 = 60 フレーム）を 1 Group にするとします。すべてのフレームを 1 つの Subgroup（1 ストリーム）にするのと、フレームごとにデータグラムで送るのとでは何が違うでしょう？ ストリームなら確実・順序どおりに届き、遅れたら Group ごとリセットで打ち切れます。データグラムは大きな映像フレームだとサイズ上限を超えやすく、1 フレーム欠けると以降の差分フレームも復号できません。そのため映像には Subgroup ストリームを使うのが一般的です。

## 📝 まとめ

- 購読の Object は Subgroup ストリーム（1 Subgroup ≒ 1 ストリーム）かデータグラム、FETCH / fill は Fetch ストリーム
- ヘッダーは Type Flags で ID や優先度を省略し、Object ID は差分で書いて小さく保つ
- 全部送ったら FIN、途中でやめたらリセット。Group / Track の終わりは Object Status や END_OF_GROUP で示す

## 参考

- [draft-ietf-moq-transport-22 §11 Data Streams and Datagrams](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-11)
- [§6.4.1 Unidirectional Streams](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-6.4.1)

## ✅ 理解度クイズ

{{< quiz >}}
