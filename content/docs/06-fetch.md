---
title: "06. 過去データの取得: FETCH と Fill"
weight: 60
quiz:
  - q: "SUBSCRIBE と FETCH の違いとして正しいものは？"
    choices:
      - "SUBSCRIBE は過去の Object、FETCH は未来の Object を取得する"
      - "SUBSCRIBE は新しく出る Object を届け続ける契約、FETCH は既存の Object の範囲を 1 本のストリームで取得して自動的に終わる"
      - "どちらも同じで、名前が違うだけ"
      - "FETCH はデータグラムでしか届かない"
    answer: 1
    explain: "購読は継続的な関係、FETCH は有限の過去データの取得です。FETCH の応答は 1 本の単方向ストリームで届き、全部送り終われば FIN で終わります。"
  - q: "FETCH で Start Location が Largest Object より大きかったら？"
    choices:
      - "未来の Object が出るまで待つ"
      - "FETCH_ERROR（INVALID_RANGE）で断られる"
      - "空のストリームが返る"
      - "購読に切り替わる"
    answer: 1
    explain: "FETCH は「すでに存在する」Object だけを対象にします。まだ何も公開されていない、または開始位置が Largest Object より後ろなら INVALID_RANGE のエラーになります。"
  - q: "FETCH ストリーム内で Object ID が飛んでいた（例: 3 の次が 7）。Range Filter を指定していない場合、4〜6 は？"
    choices:
      - "存在しない Object とみなせる"
      - "状態は不明"
      - "ロスしたので再送を待つ"
      - "プロトコル違反"
    answer: 0
    explain: "Range Filter がなければ、FETCH ストリーム中の印のない隙間は存在しない Object を意味します。不明やタイムアウトのときは End of Range の印で明示されます。"
  - q: "fill fetch ストリームとは？"
    choices:
      - "FETCH の応答が遅いときに使う予備のストリーム"
      - "SUBSCRIBE や REQUEST_UPDATE に FILL_PARAMETERS を付けたとき、過去分を FETCH 応答の形式で届ける単方向ストリーム"
      - "パディング用のストリーム"
      - "データグラムの別名"
    answer: 1
    explain: "購読に FILL_PARAMETERS を付けると、パブリッシャは FETCH_HEADER で始まるストリームを開き、fill range（最大で Largest Object まで）を届けます。購読本体は通常どおり Subgroup ストリームで届きます。"
---

# 06. 過去データの取得: FETCH と Fill

## 🎯 この章のゴール

- FETCH で既存の Object の範囲を取得する方法を理解する
- FETCH ストリームの「隙間」の意味を読み取れる
- 購読と過去データ取得を 1 つのリクエストで行う Fill の仕組みを説明できる

## 💡 ひとことで言うと

> SUBSCRIBE は「これから出る号を毎月届けて」、FETCH は「バックナンバーをまとめて送って」。Fill は「定期購読の申し込みと同時に、今月号の前半もまとめて送って」というセット注文です。

## FETCH: 既存の Object をまとめて取得

FETCH は、1 つのトラックのすでに存在する Object を Start Location から End Location まで（両端を含む）取得するリクエストです。

```text
FETCH {
  Type = 0x16, Length,
  Request ID,
  Track Namespace, Track Name,
  Number of Parameters, Parameters   ← LOCATION_FILTER, GROUP_ORDER, SUBSCRIBER_PRIORITY,
}                                       FILL_TIMEOUT, Range Filters …
```

- 範囲は `LOCATION_FILTER` で指定。省略すると `{0, 0}` から Largest Object まで
- 処理時点の Largest Object より後ろは取得されない（未来は FETCH できない）
- 何も公開されていない、または開始位置が Largest Object より後ろなら INVALID_RANGE で失敗

成功すると FETCH_OK が返ります。FETCH_OK には実際に応答がカバーする終端 End Location と、それがトラックの最後かどうか（End Of Track）が入ります。パブリッシャは FETCH_OK より前に Object を送り始めてもかまいません（キャッシュから即座に返したいリレー向け）。

{{< mermaid >}}
sequenceDiagram
  participant S as サブスクライバ
  participant P as パブリッシャ
  S->>P: [双方向ストリーム] FETCH (LOCATION_FILTER: Group 38〜40)
  P->>S: [単方向ストリーム] FETCH_HEADER (Request ID)
  P->>S: Object {38,0}, {38,1}, …, {40,n}
  P-->>S: [双方向ストリーム] FETCH_OK (End Location = {40, n})
  Note over P,S: すべて送ったらデータストリームを FIN
{{< /mermaid >}}

### 届き方

- 応答は 1 本の単方向ストリーム（先頭は `FETCH_HEADER`）
- Group は指定した Group Order（省略時は昇順）で並び、Group 内は Object ID 順。Subgroup ID は並び順に使わない
- 範囲に Object が 1 つもなければ、FETCH_HEADER だけ送って FIN

### ストリームの「隙間」の読み方

FETCH ストリームでは、次の Location の Object がないことがあります。理由は 3 つ: 存在しない、フィルタで除外された、状態が分からない（例: リレーがキャッシュを持たず上流とも連絡が取れない）。

| 状況 | 意味 |
| --- | --- |
| Range Filter なしで、印のない隙間 | その Object は存在しない |
| Range Filter ありで、印のない隙間 | 状態は不明 |
| End of Non-Existent Range の印 | ここまで存在しない |
| End of Unknown Range の印 | ここまで状態不明 |
| End of Timed-Out Range の印 | 上流からの取得が時間切れ |

不明な Object を含む FETCH を受けたパブリッシャは、ストリームを `UNKNOWN_OBJECT_STATUS` でリセットするか、不明な範囲に印を付けて残りを送り続けるかを選べます。

### リレーでの FETCH

キャッシュに範囲の先頭があるリレーは、すぐに送り始めてよく、手元にない部分は上流に FETCH します。`FILL_TIMEOUT` パラメータは、1 つのリクエストから生まれる上流 FETCH 全体の時間予算です。使い切ったら、残りを Timed-Out の隙間として報告し、手元にある分は送り続けます。

## Fill: 購読 + 過去データを 1 回で

「今の Group の先頭から見たい」とき、SUBSCRIBE と FETCH を別々に送ると、往復が増えるうえに境目の重複・抜けを自分で管理しなければなりません。draft-22 の Fill はこれを 1 つの SUBSCRIBE で解決します。

SUBSCRIBE（または REQUEST_UPDATE）に FILL_PARAMETERS パラメータを付けると、パブリッシャは購読とは別に fill fetch ストリーム（FETCH_HEADER で始まる単方向ストリーム）を開き、過去分を FETCH 応答の形式で届けます。

{{< mermaid >}}
sequenceDiagram
  participant S as サブスクライバ
  participant P as パブリッシャ
  S->>P: SUBSCRIBE (LOCATION_FILTER=Next Object, FILL_PARAMETERS{LOCATION_FILTER=Relative Start, StartGroup=1})
  P-->>S: SUBSCRIBE_OK (Track Alias=7, LARGEST_OBJECT={41,12})
  par fill fetch ストリーム
    P->>S: FETCH_HEADER + {41,0} … {41,12}
  and 購読（Subgroup ストリーム）
    P->>S: SUBGROUP_HEADER + {41,13}, {41,14} …
  end
  Note over P,S: fill が終わったら fill fetch ストリームを FIN。購読は続く
{{< /mermaid >}}

### fill range

- fill range = FILL_PARAMETERS 内の `LOCATION_FILTER` で選んだ範囲（なければ購読自身のフィルタ）
- FETCH と同じルールで評価されるので、Largest Object を超えない
- 購読のフィルタとは独立なので、「購読は Next Group から、fill は 3 つ前の Group から」のような指定もできる
- FILL_PARAMETERS に入れなかったパラメータ（優先度、Range Filter、認可など）は購読の値を引き継ぐ

### 重複を避けるコツ

fill range と購読の範囲が重なると、同じ Object が両方から届きます（fill-delivered かつ subscription-delivered）。各 Object をちょうど 1 回ずつ受け取りたいなら、購読は Next Object から始め、fill range は開始だけ指定した open-ended にします。パブリッシャがそれを Largest Object で止めるので、境目がぴったり合います。

### fill の始まりと終わり

- 購読が一時停止中（FORWARD=0）に FILL_PARAMETERS を送っても fill は開かない
- fill が終わったら FIN。失敗したらストリームをリセット（fill には REQUEST_ERROR がない）
- fill をリセット・キャンセルしても購読本体には影響しない
- REQUEST_UPDATE で新しい fill を頼むと、前の fill と並行して複数開いていてもよい（Request ID で区別）

> [!NOTE] 📜 仕様メモ: Joining FETCH はどこへ？
> 以前のドラフトには、購読と組み合わせる「Joining FETCH」という FETCH の種類がありました。draft-22 ではこの役割が SUBSCRIBE + FILL_PARAMETERS に置き換わっています。古いドラフトを参照している仕様（たとえば MSF-01 のカタログ取得手順）を読むときは読み替えましょう。

## 🧪 考えてみよう

視聴者が 30 秒巻き戻しボタンを押しました。サブスクライバはどうすればよいでしょう？ 1 つの方法は、30 秒前に相当する Group から現在までを FETCH して再生し、同時に購読でライブの続きを受け取ることです。購読中なら REQUEST_UPDATE + FILL_PARAMETERS で fill を追加するのも手です。

## 📝 まとめ

- FETCH は既存 Object の有限範囲を 1 本の単方向ストリームで取得し、送り終われば終わる
- FETCH ストリームの隙間は、Range Filter がなければ「存在しない」、状態不明・時間切れは印で明示
- Fill（SUBSCRIBE + FILL_PARAMETERS）で、購読と過去分の取得を 1 リクエストで行える

## 参考

- [draft-ietf-moq-transport-22 §3.2 Fetch / §3.4 Fill Semantics](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-3.2)
- [§9.11 FETCH / §9.12 FETCH_OK / §9.20.15 FILL PARAMETERS](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-9.11)

## ✅ 理解度クイズ

{{< quiz >}}
