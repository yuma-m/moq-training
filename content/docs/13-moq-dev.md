---
title: "13. 実践: moq.dev の実装"
weight: 130
quiz:
  - q: "moq.dev の moq-lite と IETF の moq-transport の関係は？"
    choices:
      - "まったく無関係な別プロトコル"
      - "moq-transport の意図的に小さなサブセットで、moq-transport を話すリレーとも相互運用できる"
      - "moq-transport の上位互換で、機能が多い"
      - "HTTP/3 の拡張"
    answer: 1
    explain: "moq-lite は「CDN が衝突なく実装できる部分」に絞った moq-transport のサブセットです。残りの機能は「未対応」か無害な同等物に対応づけられます。"
  - q: "moq-lite にない機能はどれ？"
    choices:
      - "Track と Group"
      - "優先度"
      - "Subgroup（SVC のレイヤーは別トラックにする）"
      - "名前空間（パス）のアナウンス"
    answer: 2
    explain: "moq-lite は Subgroup、push（PUBLISH）、複数 Group にまたがる FETCH、Object 番号の飛び、Object ごとのメタデータ、一時停止などを省いています。SVC のレイヤーはトラックを分けて表現します。"
  - q: "moq-lite の購読で「Max age」を 0 にすると？"
    choices:
      - "すべての過去データを受け取る"
      - "最新（ライブエッジ）以外の Group は待たずにスキップする"
      - "購読がすぐ切れる"
      - "優先度が最高になる"
    answer: 1
    explain: "Max age は最新でない Group がどれだけ古くなったらスキップするかの上限です（メディアの時間軸で測る）。0 ならライブエッジだけを追いかけます。"
  - q: "hang のカタログについて正しいものは？"
    choices:
      - "HTTP の JSON ファイルとして配る"
      - "`catalog.json` という名前のトラックで、WebCodecs の DecoderConfig を拡張したレンディション情報を持つ"
      - "SDP 形式で書かれている"
      - "MSF とまったく同じ仕様"
    answer: 1
    explain: "hang のカタログは `catalog.json` トラック（圧縮版 `catalog.json.z` もある）で、各レンディションは WebCodecs の VideoDecoderConfig / AudioDecoderConfig を拡張しています。MSF と役割が重なっており、将来は収束する見込みとされています。"
---

# 13. 実践: moq.dev の実装

## 🎯 この章のゴール

- [moq.dev](https://moq.dev/) のオープンソース実装の全体像（moq-lite / hang / moq-relay / ライブラリ）を知る
- IETF の moq-transport と moq-lite の違いを説明できる
- ブラウザで MoQ の配信を視聴するコードのイメージを掴む

## 💡 ひとことで言うと

> moq.dev は、標準が固まるのを待たずに今使える MoQ を作っています。標準のサブセットに機能を絞り、シンプルさと CDN での実装しやすさを優先しています。

## moq.dev とは

[moq.dev](https://moq.dev/) は、MoQ のオープンソース実装（MIT / Apache 2.0）と、そのマネージド CDN [moq.pro](https://moq.pro/) を提供するプロジェクトです。ドキュメントは [doc.moq.dev](https://doc.moq.dev/) にあります。

| 層 | moq.dev | IETF |
| --- | --- | --- |
| メディアフォーマット | hang（カタログ + コンテナ） | MSF / CMSF + LOC |
| pub/sub | moq-lite | moq-transport |
| 転送 | QUIC / WebTransport（+ WebSocket フォールバック） | QUIC / WebTransport |

moq.dev の実装は moq-transport も話せます（ドキュメント執筆時点で draft-14〜22 を ALPN で交渉）。hang の代わりに MSF のカタログを読み書きしたり、LOC コンテナを選んだりもできます。

## moq-lite: 小さなサブセット

moq-lite は「moq-transport の意図的に小さなサブセット」です。データモデルは次のとおり。

| moq-lite | 意味 | moq-transport での近いもの |
| --- | --- | --- |
| Session | 1 本の接続。配信と視聴を同時にできる | Session |
| Origin | セッションから見える Broadcast の集合（URL パスでスコープ） | スコープ |
| Broadcast | 1 つのパブリッシャのトラックの集まり（名前付き） | Track Namespace |
| Track | Group の列 | Track |
| Group | 1 本の QUIC ストリームで順序どおり確実に届く Frame の列。先頭は新規参加者が復号を始められる点（キーフレームなど） | Group（≒ 1 Subgroup） |
| Frame | サイズ付きのバイト列 | Object |
| Datagram | 再送しない小さな Frame（moq-lite 05 以降） | Datagram |

### 省いたもの

| moq-transport の機能 | moq-lite での扱い |
| --- | --- |
| Request ID | リクエストごとにストリームを使うので不要 |
| Push（PUBLISH） | なし。サブスクライバが常に頼む |
| 複数 Group にまたがる FETCH | FETCH は 1 Group 内だけ |
| Subgroup | なし。SVC のレイヤーはトラックを分ける |
| Object 番号の飛び（Gap） | なし |
| Object ごとのメタデータ（プロパティ） | なし。必要ならペイロードに入れる |
| 一時停止 | なし。購読をやめる |
| バイト列の名前 | UTF-8 の名前 |

> [!TIP] なぜ削るのか
> CDN（リレー）は多数のパブリッシャ・サブスクライバの要求をまとめて上流に流します。機能が多いほど「下流 A は一時停止、下流 B は別フィルタ、下流 C は別の Group Order……」の組み合わせが爆発し、集約が難しくなります。moq-lite は CDN が衝突なく実装できる部分に絞っています。

### 購読のつまみ

moq-lite の購読は、輻輳時のふるまいを 3 つのつまみで決めます。

- Priority（0〜255）: 優先度の高いトラックが先に帯域を得る
- Order: ライブなら新しい順、追いかけ再生なら古い順
- Max age: 最新でない Group がどれだけ古くなったらスキップするか（メディアの時間軸で測る）。0 ならライブエッジだけ

ドキュメントの例では、音声（priority 100、max age 500ms）と映像（priority 50、max age 2s）を購読すると、激しい輻輳時には映像が止まり、音声は最大 500ms の遅れで聞こえ続けます。

> [!WARNING] 数値の向きに注意
> この例では音声（100）が映像（50）より優先されています。moq-transport の優先度は「小さいほど優先（0 が最高）」なので、実装をまたいで設定するときは向きを確認しましょう。

### アナウンス = 経路

moq-lite では、パスのプレフィックスに対するアナウンスを要求すると、相手は今提供できるものを返し、その後は変化を流し続けます。アナウンスは「このプレフィックスの Broadcast を提供できる」という経路（route）で、ループ検出用のリレーのホップ列と、経路選択用のコストを持ちます。`.` で始まるパスセグメントは発見の対象から隠れますが、名前を知っていれば購読できます。

moq-transport の PUBLISH_NAMESPACE はルーティングプロトコルではありません（07 章）。moq-lite のアナウンスは、リレー網での経路選択にも使われます。

## hang: メディアフォーマット

hang は moq-lite の上のメディアフォーマットで、カタログトラックと、各フレームにタイムスタンプを付けるコンテナの 2 つからなります。WebCodecs をモデルにしているので、ブラウザがそのままデコードできます。平文の Broadcast 名は `.hang` で終わります。

### カタログ

- トラック名 `catalog.json`（圧縮版 `catalog.json.z` もある）。トラックの増減に合わせてライブで更新
- 映像・音声は「レンディション」の集合（トラック名がキー）。各レンディションは WebCodecs の `VideoDecoderConfig` / `AudioDecoderConfig` を拡張したもの（`codec`、`description`、`codedWidth`、`sampleRate` など）
- 字幕・データ用の `text` / `json` / `binary` セクション、ラベル、別 Broadcast のレンディション参照、jitter / delay のヒントなども表現できる

### コンテナ（`container.kind`）

| kind | 中身 | 特徴 |
| --- | --- | --- |
| `legacy` | vi64 のマイクロ秒タイムスタンプ + コーデックのペイロード | 既定。最も軽い（LOC に近い） |
| `cmaf` | `moof` + `mdat` | fMP4 のまま HLS / DASH と相互運用。1 フレームあたり約 100 バイト増 |
| `loc` | 小さなプロパティブロック + ペイロード | IETF の LOC |

### Group の使い方

- 映像: Group = GoP。キーフレームで始まり、リレーは Group 単位で捨てられ、視聴者は Group 境界から参加できる
- 音声: Group は独立していて、典型的には約 1 秒分
- データ: `snapshot`（新しい Group が前の Group を置き換え、最新だけ読めばよい）と `stream`（1 つの Group にずっと追記するログ）

## moq-relay とクラスタ

moq-relay はセルフホストできるリレーサーバーです。

- リレー同士はピアになってアナウンスと購読を転送する。視聴者は最寄りのリレーにつなぎ、リレーは必要ならピアから Broadcast を引いてキャッシュする
- ピアの発見は静的リスト、HTTP の動的リスト、LAN の mDNS
- 経路はホップ列（ループ検出・最短経路）とリンクコストで選び、中央のコントローラーなしにフェイルオーバーする
- 認証は JWT（URL の `?jwt=` で渡す）。ピア間は mTLS か JWT

ほかにも、任意の Broadcast をリレーのキャッシュから HLS で配る HLS ゲートウェイや、OBS からの配信取り込みなどのツールがあります。

## ブラウザで視聴してみる

TypeScript のライブラリ `@moq/watch` は Web Component を提供していて、要素を登録すれば HTML に 1 行書くだけでプレイヤーを置けます（[doc.moq.dev](https://doc.moq.dev/lib/js/watch.html) の例より。npm パッケージなので Vite などのバンドラー経由で読み込む想定です）。

```js
import "@moq/watch/element";
```

```html
<moq-watch url="https://relay.example.com/anon" name="room/alice.hang"></moq-watch>
```

- `url`: リレーの URL、`name`: Broadcast 名
- `delay`（ライブエッジからどれだけ遅らせるか、既定 `auto`）や `buffer` で、遅延とバッファの量を調整できる

### ライブラリ一覧

| 言語 | 主なパッケージ |
| --- | --- |
| Rust | `moq-net`、`hang`、`moq-mux` など（リレー本体は `moq-relay`） |
| TypeScript | `@moq/net`、`@moq/hang`、`@moq/watch`、`@moq/publish` など |
| その他 | Swift、Kotlin、Python、Go、Dart、C のバインディング |

パッケージ構成は活発に変わっているので、最新は [doc.moq.dev/lib](https://doc.moq.dev/lib/) を確認してください。

### ブラウザの対応状況

ブラウザでは WebTransport を使います。moq.dev のクライアントは WebSocket 接続も並行して試し、WebTransport が使えない・安定しない環境ではそちらを使います（その場合は TCP の HoL ブロッキングを避けられません）。対応状況はブラウザのバージョンで変わるので、[doc.moq.dev の Transport のページ](https://doc.moq.dev/concept/transport.html) で確認しましょう。

## 🧪 考えてみよう

SVC（スケーラブル映像符号化）のベースレイヤーと拡張レイヤーを、moq-transport では 1 トラックの別 Subgroup で、moq-lite では別トラックで表します。後者の利点と欠点は？ 利点はモデルが単純で、レイヤーごとに購読・優先度を独立に扱えること。欠点はトラックが増え、カタログや購読の管理が少し複雑になることです。

## 📝 まとめ

- moq.dev は moq-lite（pub/sub）+ hang（メディア）+ moq-relay（リレー）+ 多言語ライブラリを提供し、moq-transport とも相互運用する
- moq-lite は Subgroup・push・Gap・プロパティ・一時停止などを省き、CDN で集約しやすくしたサブセット
- 購読は Priority / Order / Max age で輻輳時のふるまいを決める。優先度の数値の向きは moq-transport と逆の例があるので注意
- `<moq-watch>` を置くだけでブラウザ視聴できる

## 参考

- [doc.moq.dev: moq-lite](https://doc.moq.dev/concept/layer/moq-lite) / [hang](https://doc.moq.dev/concept/hang.html) / [Standards](https://doc.moq.dev/concept/standard.html)
- [doc.moq.dev: Relay clusters](https://doc.moq.dev/bin/relay/cluster.html)
- [moq.dev Blog](https://moq.dev/blog/)

## ✅ 理解度クイズ

{{< quiz >}}
