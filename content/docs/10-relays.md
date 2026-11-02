---
title: "10. リレー: MoQ の CDN"
weight: 100
quiz:
  - q: "リレーが Object を転送するときに許されていないことは？"
    choices:
      - "Object をキャッシュする"
      - "複数のサブスクライバに同じ Object を配る"
      - "Object のペイロードを結合・分割・改変する"
      - "優先度に従って送信順を決める"
    answer: 2
    explain: "リレーはペイロードを不透明に扱わねばならず、結合・分割・改変は禁止（MUST NOT）です。変更してよいのは、仕様が許す範囲の Object Properties だけです。"
  - q: "100 人が同じトラックを同じリレーに SUBSCRIBE した。リレーは上流に何本 SUBSCRIBE を送ればよい？"
    choices:
      - "必ず 100 本"
      - "購読を集約（aggregate）して 1 本にまとめられる"
      - "0 本（リレーは上流に購読しない）"
      - "サブスクライバ数の半分"
    answer: 1
    explain: "リレーは同じトラックへの認可された購読を集約し、上流には 1 本だけ購読してキャッシュを共有できます。これがファンアウトによるスケールの源です。"
  - q: "リレーが下流の SUBSCRIBE に SUBSCRIBE_OK を返してよいのはいつ？"
    choices:
      - "SUBSCRIBE を受け取った直後ならいつでも"
      - "そのトラックの上流購読が Established になっているとき"
      - "最初の Object をキャッシュしたとき"
      - "PUBLISH_NAMESPACE を受け取ったとき"
    answer: 1
    explain: "リレーは上流の購読が Established になるまで SUBSCRIBE_OK を送ってはいけません（MUST）。すでに上流購読があればすぐに返せます。"
  - q: "エンドツーエンド暗号化されたメディアでも、リレーが優先度制御やキャッシュをできるのはなぜ？"
    choices:
      - "リレーが鍵を持っているから"
      - "配信に必要な情報は暗号化されないメタデータ（Object ヘッダーやプロパティ）にあり、ペイロードを読む必要がないから"
      - "暗号化は TLS だけだから"
      - "できない"
    answer: 1
    explain: "Group ID・Object ID・優先度・プロパティなどのメタデータはリレーから見えます。リレーはそれだけでキャッシュ・転送・優先度制御を行い、ペイロードは中身を知らずに運びます。"
---

# 10. リレー: MoQ の CDN

## 🎯 この章のゴール

- リレーの役割（ファンアウト、キャッシュ、ポリシー適用）を説明できる
- 購読の集約、複数パブリッシャ、キャッシュの規則を理解する
- リレーの乗り換え（GOAWAY による切り替え）の流れを知る

## 💡 ひとことで言うと

> リレーは「中身を開けずに仕分けて配る宅配センター」。宛名（メタデータ）だけ見て、同じ荷物を欲しい人全員にコピーして届けます。

## リレーとは

リレーは、パブリッシャとサブスクライバの両方の役割を持つエンドポイントです。オリジナルのパブリッシャやエンドサブスクライバとは区別されます。

- スケール: 1 本の上流購読を多数の下流へファンアウトし、CDN のような配信網を作る
- ポリシーの適用点: ネットワークの入口で SUBSCRIBE / PUBLISH の認可を確認する
- トランスポートを終端する: Object のメタデータを見るため、QUIC / WebTransport のセッションはリレーで終端される

協調動作するリレーの集合（CDN 全体など）は仕様上 1 つのリレーとして扱われ、内部のリレー同士のつなぎ方は範囲外です。

{{< diagram caption="リレーによるファンアウト。上流には 1 本だけ購読し、キャッシュを下流で共有する" >}}
<svg viewBox="0 0 640 230" role="img" aria-label="Relay fan-out">
  <defs><marker id="ah10" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path class="arrowhead" d="M0,0 L8,4 L0,8z"/></marker></defs>
  <rect class="box" x="10" y="95" width="110" height="40" rx="6"/><text x="65" y="120" text-anchor="middle">パブリッシャ</text>
  <rect class="accent" x="190" y="95" width="110" height="40" rx="6"/><text x="245" y="114" text-anchor="middle">オリジン側</text><text x="245" y="128" text-anchor="middle">リレー</text>
  <rect class="accent" x="370" y="30" width="110" height="40" rx="6"/><text x="425" y="55" text-anchor="middle">エッジ リレー</text>
  <rect class="accent" x="370" y="160" width="110" height="40" rx="6"/><text x="425" y="185" text-anchor="middle">エッジ リレー</text>
  <line class="arrow" x1="120" y1="115" x2="186" y2="115" marker-end="url(#ah10)"/>
  <line class="arrow" x1="300" y1="108" x2="366" y2="55" marker-end="url(#ah10)"/>
  <line class="arrow" x1="300" y1="122" x2="366" y2="180" marker-end="url(#ah10)"/>
  <g>
    <rect class="box" x="550" y="5" width="80" height="24" rx="4"/><text x="590" y="22" text-anchor="middle">視聴者</text>
    <rect class="box" x="550" y="38" width="80" height="24" rx="4"/><text x="590" y="55" text-anchor="middle">視聴者</text>
    <rect class="box" x="550" y="71" width="80" height="24" rx="4"/><text x="590" y="88" text-anchor="middle">視聴者</text>
    <rect class="box" x="550" y="135" width="80" height="24" rx="4"/><text x="590" y="152" text-anchor="middle">視聴者</text>
    <rect class="box" x="550" y="168" width="80" height="24" rx="4"/><text x="590" y="185" text-anchor="middle">視聴者</text>
    <rect class="box" x="550" y="201" width="80" height="24" rx="4"/><text x="590" y="218" text-anchor="middle">視聴者</text>
  </g>
  <line class="arrow" x1="480" y1="45" x2="546" y2="17" marker-end="url(#ah10)"/>
  <line class="arrow" x1="480" y1="50" x2="546" y2="50" marker-end="url(#ah10)"/>
  <line class="arrow" x1="480" y1="55" x2="546" y2="83" marker-end="url(#ah10)"/>
  <line class="arrow" x1="480" y1="175" x2="546" y2="147" marker-end="url(#ah10)"/>
  <line class="arrow" x1="480" y1="180" x2="546" y2="180" marker-end="url(#ah10)"/>
  <line class="arrow" x1="480" y1="185" x2="546" y2="213" marker-end="url(#ah10)"/>
</svg>
{{< /diagram >}}

## リレーがしてよいこと・いけないこと

| ✅ してよい / すべき | ❌ してはいけない |
| --- | --- |
| Object をキャッシュする（任意） | ペイロードを結合・分割・改変する |
| 同じトラックの購読を集約して上流 1 本にする | Object のフィールド（プロパティ以外）を書き換える |
| 優先度に従って送信順を決める | 複数 Object が流れるストリームで、Object を並べ替える・捨てる |
| 期限切れの Object を「存在しない」に更新する | 不正なメッセージ・Object を他のセッションへ伝播させる |
| 未知のプロパティをそのまま転送・キャッシュする | 未知のプロパティを改変・削除する（必須プロパティを除く） |

最後の「不正なメッセージを伝播させない」は、1 つのセッションのエラーで無関係なセッションまで巻き添えにしないためのルールです。

## 購読を受けたときの動き

サブスクライバ側（下流）からの SUBSCRIBE:

1. 認可を確認する
2. そのトラックの上流購読がすでに Established なら、すぐ SUBSCRIBE_OK（上流が一時停止中で、下流が停止を望んでいなければ、上流を REQUEST_UPDATE で再開）
3. なければ、トラックの名前空間（またはそのプレフィックス）を PUBLISH_NAMESPACE したすべてのパブリッシャに上流 SUBSCRIBE を送る
4. 上流が Established になってから SUBSCRIBE_OK を返す

`LARGEST_OBJECT` は、上流から受け取った値と、上流購読で受け取った Object の最大 Location のうち大きい方を返します。

パブリッシャ側（上流）からの PUBLISH:

- そのトラックの名前空間に SUBSCRIBE_TRACKS している下流サブスクライバへ PUBLISH を送る
- 認可済みで、下流に購読者がいれば PUBLISH_OK を返す。いなければ REQUEST_UPDATE で一時停止させておける

### 購読の集約とフィルタ

購読を集約するとき、下流のフィルタを合成して上流に付けてもよい（相手の `MAX_FILTER_RANGES` の範囲で）です。広めのフィルタで上流購読しておくと、下流の購読者が出入りするたびに上流を作り直さずに済みます（その分、受け取る Object は増える）。

大きな名前空間では、リレーは `NAMESPACE_TOO_LARGE`、`CONFLICTING_FILTERS`、`PREFIX_OVERLAP` などで購読を断って資源を守れます。

## キャッシュの規則

キャッシュのキーは Full Track Name + Group ID + Object ID です。Object は不変なので、同じキーで別の Object が来たら基本的に無視してかまいません。更新してよいのは次の 2 つだけです。

1. Object が「存在する」から「存在しない（取得不能）」に変わる
2. Object Properties の追加・削除・更新（各プロパティの規則の範囲で）

同じ Object なのに Delivery Mode・Subgroup ID・優先度・ペイロードが違ったら、そのトラックは Malformed（不正）として扱います。キャッシュの有効期間は、トラックプロパティ `MAX_CACHE_DURATION`（ミリ秒）で上限を指定できます。

## 複数パブリッシャ

同じ名前空間・同じトラックを複数のパブリッシャが出すこともあります（冗長化、エンコーダの二重化など）。リレーはすべてのパブリッシャからの Object を受け付けて該当する購読に転送し、できる限り重複を取り除くべき（SHOULD）とされています。

## リレーの乗り換え

QUIC のコネクションマイグレーションが使えないとき（GOAWAY を受けた、Wi-Fi → モバイル回線に切り替わった）の乗り換え手順も示されています。

サブスクライバ: 新しいリレーに接続して同じ購読を SUBSCRIBE し、成功したら古いリレーの購読をキャンセル。

パブリッシャ: 新しいセッションで PUBLISH_NAMESPACE / PUBLISH を始めるが、古いセッションでもしばらく公開を続ける。購読が移り終わったら古い方をやめる。リレーは両方から届く Object を重複排除するので、下流のサブスクライバは切り替えに気づかない。

{{< mermaid >}}
sequenceDiagram
  participant P as パブリッシャ
  participant A as リレー A
  participant B as リレー B
  A->>P: GOAWAY (New Session URI = B)
  P->>B: 新セッション: PUBLISH_NAMESPACE / PUBLISH
  par 移行期間
    P->>A: Objects（継続）
  and
    P->>B: Objects
  end
  Note over A,B: 下流の購読が B へ移る
  P->>A: 公開を停止してセッションを閉じる
{{< /mermaid >}}

## メタデータは見せて、中身は隠す

MOQT は最初からエンドツーエンド暗号化を想定しています。Object は「メタデータ（常に平文）」と「ペイロード（暗号化可）」に分かれており、リレーが必要なのはメタデータだけです。さらに Immutable Properties（11 章）を使えば、リレーに見せたいメタデータを改ざん検知付きで運べます。IETF では MoQ 向けの暗号化仕様（Secure Objects など）の検討も進んでいます。

## 🧪 考えてみよう

ある人気配信に 100 万人が集まりました。オリジン側リレーに 1,000 台のエッジリレーがつながり、各エッジに 1,000 人ずつ。パブリッシャから見た購読は何本でしょう？ オリジン側リレーが集約すれば 1 本です。オリジン側リレーから見ても 1,000 本（エッジの数）で済みます。HTTP CDN と同じ木構造のファンアウトを、セグメントの完成を待たずに行えます。

## 📝 まとめ

- リレーはパブリッシャ兼サブスクライバ。トランスポートを終端してメタデータを見るが、ペイロードは不透明に扱う
- 購読を集約して上流 1 本にし、キャッシュを共有してファンアウトする
- 上流購読が Established になるまで SUBSCRIBE_OK を返さない。複数パブリッシャの Object は重複排除する
- GOAWAY を使えば、パブリッシャもサブスクライバも途切れずにリレーを乗り換えられる

## 参考

- [draft-ietf-moq-transport-22 §7 Relays](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-7)
- [§15 Security Considerations](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-15)

## ✅ 理解度クイズ

{{< quiz >}}
