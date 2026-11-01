---
title: "09. 優先度と遅延タイムアウト"
weight: 90
quiz:
  - q: "MOQT の優先度の数値について正しいものは？"
    choices:
      - "0〜255 で、大きいほど優先"
      - "0〜255 で、小さいほど優先（0 が最高）"
      - "0〜1 の小数"
      - "1〜10 の整数"
    answer: 1
    explain: "優先度は 0〜255 の符号なし整数で、**数値が小さいほど優先度が高く、0 が最高** です。既定値は中央付近の 128 にすることが推奨されています。"
  - q: "送信候補が複数あるとき、スケジューリングで最初に比べるのは？"
    choices:
      - "Publisher Priority"
      - "Subscriber Priority"
      - "Group ID"
      - "Object のサイズ"
    answer: 1
    explain: "順番は ① Subscriber Priority → ② Publisher Priority → ③（同じ購読で別 Group なら）Group Order → ④ Subgroup ID / Object ID です。サブスクライバの意思が最初に効くので、名前空間ごとにバラバラな優先度方針を受信側で調整できます。"
  - q: "ライブ視聴で輻輳が起きたとき、新しい Group を古い Group より先に送ってほしい。どの設定？"
    choices:
      - "GROUP_ORDER = Ascending"
      - "GROUP_ORDER = Descending"
      - "SUBSCRIBER_PRIORITY = 255"
      - "FORWARD = 0"
    answer: 1
    explain: "Descending（降順）にすると、同じ購読内では Group ID の大きい（新しい）Group が先に送られます。ライブの「最新に追いつきたい」用途に向きます。Group Order は既存の購読では変更できません。"
  - q: "OBJECT_DELIVERY_TIMEOUT を超えた Subgroup の Object はどう扱われる？"
    choices:
      - "そのまま送る"
      - "ストリームを DELIVERY_TIMEOUT でリセットし、その Subgroup の残りは送らない"
      - "データグラムに切り替えて送る"
      - "購読を終了する"
    answer: 1
    explain: "送信しようとした時点で経過時間がタイムアウトを超えていたら、ストリームを DELIVERY_TIMEOUT でリセットし、同じ Subgroup のために新しいストリームを開くべきではありません。データグラムなら単に捨てます。"
  - q: "パブリッシャとサブスクライバがどちらも OBJECT_DELIVERY_TIMEOUT を 0 以外で指定した。使われるのは？"
    choices:
      - "パブリッシャの値"
      - "サブスクライバの値"
      - "小さい方"
      - "大きい方"
    answer: 2
    explain: "両方とも 0 以外なら **小さい方** が使われます。0 はタイムアウトなしを意味します。"
---

# 09. 優先度と遅延タイムアウト

## 🎯 この章のゴール

- Subscriber Priority / Publisher Priority / Group Order によるスケジューリング規則を説明できる
- 2 種類の遅延タイムアウト（SUBGROUP / OBJECT）の違いを理解する
- 輻輳時に MoQ が「古いものを捨てて最新を届ける」仕組みをイメージできる

## 💡 ひとことで言うと

> **ライブ配信で一番大事なのは「全部届けること」ではなく「大事なものを、間に合ううちに届けること」**。MoQ は帯域が足りないとき、何を先に送り、何を諦めるかをプロトコルで決められます。

## なぜ優先度が必要か

帯域が十分あれば、全 Object を順に送れば済みます。問題は **輻輳したとき** です。TCP ベースの配信では、古いデータの送信・再送が詰まって新しいデータも遅れ、遅延がどんどん積み上がります。

MoQ では Group ごとに別ストリームなので、送信側は「どのストリームのデータを次に送るか」を選べます。さらに古すぎるデータはストリームごとリセットして捨てられます。

{{< diagram caption="輻輳時のふるまい。音声を優先し、映像は新しい Group を優先、古い Group はタイムアウトで捨てる" >}}
<svg viewBox="0 0 640 220" role="img" aria-label="Prioritization under congestion">
  <text x="10" y="20" font-weight="bold">送信キュー（輻輳中）</text>
  <text x="10" y="55">音声（優先度 高）</text>
  <rect class="ok" x="150" y="38" width="60" height="26" rx="3"/><text x="180" y="56" text-anchor="middle">A40</text>
  <rect class="ok" x="215" y="38" width="60" height="26" rx="3"/><text x="245" y="56" text-anchor="middle">A41</text>
  <rect class="ok" x="280" y="38" width="60" height="26" rx="3"/><text x="310" y="56" text-anchor="middle">A42</text>
  <text x="360" y="56" class="muted">← 最優先で全部送る</text>
  <text x="10" y="100">映像（優先度 低）</text>
  <rect class="ng" x="150" y="83" width="60" height="26" rx="3"/><text x="180" y="101" text-anchor="middle">V40</text>
  <rect class="warn" x="215" y="83" width="60" height="26" rx="3"/><text x="245" y="101" text-anchor="middle">V41</text>
  <rect class="ok" x="280" y="83" width="60" height="26" rx="3"/><text x="310" y="101" text-anchor="middle">V42</text>
  <text x="360" y="101" class="muted">← 新しい V42 を先に（Descending）</text>
  <text x="150" y="135" class="muted">V40: タイムアウト → リセットして破棄</text>
  <text x="150" y="155" class="muted">V41: 帯域が空けば送る</text>
  <rect class="box" x="10" y="175" width="620" height="34" rx="4"/>
  <text x="320" y="197" text-anchor="middle">送信順: A40 → A41 → A42 → V42 → V41 …（V40 は送らない）</text>
</svg>
{{< /diagram >}}

## 3 つの優先度のつまみ

| つまみ | 誰が決める | どこで指定 | 単位 |
| --- | --- | --- | --- |
| **Subscriber Priority** | サブスクライバ | `SUBSCRIBER_PRIORITY` パラメータ（後から REQUEST_UPDATE で変更可） | リクエスト（購読・FETCH）ごと |
| **Publisher Priority** | オリジナルのパブリッシャ | 既定値はトラックプロパティ `DEFAULT_PUBLISHER_PRIORITY`、Subgroup ヘッダーやデータグラムで上書き | Subgroup / データグラムごと |
| **Group Order** | サブスクライバ（省略時はパブリッシャの希望） | `GROUP_ORDER` パラメータ / `DEFAULT_PUBLISHER_GROUP_ORDER` プロパティ | 購読ごと（後から変更不可） |

優先度は **0〜255、数値が小さいほど優先（0 が最高）**。既定値は 128 です。

## スケジューリング規則

送れるもの（スケジュール可能なもの）が複数あるとき、パブリッシャは次の順で選ぶべき（SHOULD）とされています。

1. **Subscriber Priority** が高い方
2. 同じなら **Publisher Priority** が高い方
3. 同じ購読の別 Group なら **Group Order**（Ascending なら古い Group、Descending なら新しい Group）
4. 同じ Group なら、fill で届く方を先に。それ以外は Subgroup ID（データグラムなら Object ID）が小さい方。モードが違えばデータグラムが先

「スケジュール可能なもの」は、Subgroup の次の Object、データグラム、FETCH 応答の次の Object です。異なる購読で優先度が同じ場合の順序は実装次第ですが、どの購読も少しずつは送れることが期待されています。

制御ストリームは最優先、次にリクエストストリーム、その後に Object を送るのが推奨です。

> [!TIP] サブスクライバ優先が先に来る理由
> 1 つのセッションに複数の名前空間（別々のアプリやパブリッシャ）が混在すると、パブリッシャ同士の優先度方針は調整されていないかもしれません。Subscriber Priority を最初に比べることで、**受信側が最終的な優先順位を決められる** ようになっています。

### 設計例

| トラック | Subscriber Priority | Publisher Priority | Group Order |
| --- | --- | --- | --- |
| 音声 | 64 | 128 | Descending |
| 映像（ベースレイヤー Subgroup） | 128 | 100 | Descending |
| 映像（拡張レイヤー Subgroup） | 128 | 200 | Descending |
| チャット | 32 | 128 | Ascending（全部順に欲しい） |

> [!NOTE] リレーと優先度
> リレーは下流への送信ではサブスクライバとパブリッシャの優先度を尊重すべきですが、下流の Subscriber Priority や Group Order を **そのまま上流の購読に使うべきではありません**（多数の下流で値がバラバラなため）。上流ではコンテンツの人気度やポリシーなど、リレー独自の基準で決めます。

## 遅延タイムアウト: 諦める仕組み

どんなに優先度を工夫しても、帯域が足りなければいずれ古いデータが溜まります。そこで、各購読には 2 つのタイムアウト（ミリ秒、0 ならなし）があります。

| | SUBGROUP_DELIVERY_TIMEOUT | OBJECT_DELIVERY_TIMEOUT |
| --- | --- | --- |
| 計測開始 | Subgroup の FIN を受け取った（全 Object が公開された）とき | Object ヘッダーの最後のバイトを受け取ったとき |
| チェック | 全データが確認応答されるまでタイマーで監視 | Object をトランスポートに渡す時点 |
| タイムアウト時 | Subgroup はストリームをリセット、データグラムは破棄 | 同左 |

- パブリッシャはトラックプロパティ（または Subgroup の最初の Object のプロパティ）で、サブスクライバはメッセージパラメータで指定
- **両方とも 0 以外なら小さい方** が使われる
- OBJECT_DELIVERY_TIMEOUT を超えた Subgroup はストリームを `DELIVERY_TIMEOUT` でリセットし、その Subgroup のための新しいストリームは開かない
- トランスポート層に溜め込んだデータはもうタイムアウトできないので、実装はバッファを小さく保つべき

どちらのタイムアウトも設定されていなければ、フィルタに一致する Object はすべて（Group Order と優先度に従って）届けられます。サブスクライバの受信が遅すぎてパブリッシャの資源を圧迫したら、`TOO_FAR_BEHIND` の PUBLISH_DONE で購読を終わらせてもかまいません。

## 輻輳制御について

MOQT は特定の輻輳制御アルゴリズムを指定しませんが、選ぶときの注意点を挙げています。

- **Bufferbloat**: CUBIC や Reno のような AIMD 方式は経路上にキューを溜めやすく、ロスがなくても遅延が増える
- **Application-Limited**: ライブ配信は帯域いっぱいまで送らない（送るデータがない）ことが多く、輻輳制御が帯域を過小評価しがち。低優先度（255）の追加トラックやパディングで帯域をプローブする手がある
- **スループットの安定性**: BBR の PROBE_RTT や Reno の窓半減のような急な送信レート低下は、遅延に敏感なアプリでは問題になりうる

## 🧪 考えてみよう

同じ MoQ のプロトコルで、「遅延 200ms のビデオ通話」と「遅延 10 秒だが途切れない大規模配信」を両立できるのはなぜでしょう？ 違いは主に **タイムアウトと Group Order の設定** です。通話なら短いタイムアウト + Descending で古いものをどんどん捨て、配信なら長いタイムアウト + Ascending で取りこぼさない。どちらも同じリレーで扱えます。

## 📝 まとめ

- 優先度は 0〜255 で **小さいほど優先**。Subscriber Priority → Publisher Priority → Group Order → Subgroup ID の順に比べる
- Group Order が Descending なら新しい Group が先。ライブで最新に追いつくのに向く
- SUBGROUP / OBJECT の遅延タイムアウトで、間に合わないデータはリセット・破棄して遅延の積み上がりを防ぐ

## 参考

- [draft-ietf-moq-transport-22 §5 Object Transmission](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-5)
- [§14 Transport Considerations](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-14)

## ✅ 理解度クイズ

{{< quiz >}}
