---
title: "02. 土台: QUIC と WebTransport"
weight: 20
quiz:
  - q: "TCP 上で複数の映像フレームを送るとき、1 つのパケットが失われると何が起きる？"
    choices:
      - "失われたフレームだけが遅れる"
      - "再送が届くまで、後続のすべてのデータの受け渡しが止まる（HoL ブロッキング）"
      - "接続が切断される"
      - "何も起きない"
    answer: 1
    explain: "TCP は 1 本の順序付きバイト列なので、穴が埋まるまで後ろのデータをアプリに渡せません。QUIC はストリームごとに順序を保証するので、ロスの影響はそのストリームだけに閉じます。"
  - q: "MOQT を QUIC 直接、または WebTransport over HTTP/3 で動かす場合に必須とされている QUIC の拡張は？"
    choices:
      - "0-RTT"
      - "コネクションマイグレーション"
      - "DATAGRAM 拡張（RFC 9221）"
      - "マルチパス QUIC"
    answer: 2
    explain: "draft-22 は QUIC の DATAGRAM 拡張のサポートとネゴシエーションを MUST としています（WebTransport over HTTP/3 ではもともと必須）。Object をデータグラムで送る配信モードがあるためです。"
  - q: "`moqt://relay.example.com/live` に WebTransport で接続するとき、クライアントは何をする？"
    choices:
      - "`wss://relay.example.com/live` に WebSocket で接続する"
      - "スキームを https に置き換えた `https://relay.example.com/live` に extended CONNECT を送る"
      - "SETUP メッセージの PATH オプションに `/live` を入れて QUIC で接続する"
      - "DNS の TXT レコードで接続先を調べる"
    answer: 1
    explain: "WebTransport では moqt URI のスキームを https に置き換え、その URI へ extended CONNECT を送ります。PATH / AUTHORITY の Setup Option を使うのはネイティブ QUIC のときだけです。"
  - q: "draft-22 を実装したエンドポイント同士が QUIC で使う ALPN 値は？"
    choices:
      - "`h3`"
      - "`moq-00`"
      - "`moqt-22`"
      - "`moqt`"
    answer: 2
    explain: "ドラフト版の ALPN は `moqt-` にドラフト番号を付けたものです（draft-22 → `moqt-22`）。最終版（RFC）では `moqt` になる予定です。-15 より前はすべて `moq-00` を使い、SETUP の中でバージョン交渉していました。"
---

# 02. 土台: QUIC と WebTransport

## 🎯 この章のゴール

- MoQ が TCP ではなく QUIC を選んだ理由（HoL ブロッキング・ストリーム・データグラム）を説明できる
- ネイティブ QUIC と WebTransport の 2 つの接続方法を区別できる
- `moqt://` URI と ALPN によるバージョン交渉を知る

## 💡 ひとことで言うと

> QUIC は、1 本の接続の中に独立したレーンを何本でも引ける道路です。TCP では 1 台の事故（パケットロス）で全レーンが渋滞しますが、QUIC では渋滞がそのレーンだけで済みます。

## TCP の悩み: Head-of-Line ブロッキング

TCP は「順序どおりに届く 1 本のバイト列」です。途中のパケットが 1 つ失われると、再送が届くまで、後ろのデータは届いていてもアプリに渡せません。これを HoL（Head-of-Line）ブロッキングと呼びます。

ライブ映像では、古いフレームの再送を待つ間に新しいフレームまで止まってしまいます。

{{< diagram caption="TCP ではロスが全体を止め、QUIC ではそのストリームだけが待つ" >}}
<svg viewBox="0 0 640 210" role="img" aria-label="Head-of-line blocking">
  <text x="10" y="20" font-weight="bold">TCP（1 本のバイト列）</text>
  <rect class="ok" x="10" y="32" width="70" height="30" rx="4"/><text x="45" y="52" text-anchor="middle">G1</text>
  <rect class="ng" x="85" y="32" width="70" height="30" rx="4"/><text x="120" y="52" text-anchor="middle">G2 ロス</text>
  <rect class="warn" x="160" y="32" width="70" height="30" rx="4"/><text x="195" y="52" text-anchor="middle">G3 待ち</text>
  <rect class="warn" x="235" y="32" width="70" height="30" rx="4"/><text x="270" y="52" text-anchor="middle">G4 待ち</text>
  <text x="320" y="52" class="muted">← G2 の再送まで全部止まる</text>
  <text x="10" y="100" font-weight="bold">QUIC（ストリームごとに独立）</text>
  <rect class="ok" x="10" y="112" width="70" height="26" rx="4"/><text x="45" y="130" text-anchor="middle">G1</text><text x="90" y="130" class="muted">stream 2</text>
  <rect class="ng" x="10" y="142" width="70" height="26" rx="4"/><text x="45" y="160" text-anchor="middle">G2 ロス</text><text x="90" y="160" class="muted">stream 6（ここだけ待つ）</text>
  <rect class="ok" x="10" y="172" width="70" height="26" rx="4"/><text x="45" y="190" text-anchor="middle">G3</text><text x="90" y="190" class="muted">stream 10</text>
  <rect class="ok" x="330" y="172" width="70" height="26" rx="4"/><text x="365" y="190" text-anchor="middle">G4</text><text x="410" y="190" class="muted">stream 14（届き続ける）</text>
</svg>
{{< /diagram >}}

## QUIC が MoQ にくれるもの

| QUIC の機能 | MoQ での使い方 |
| --- | --- |
| ストリーム（多数・独立・安価） | Group / Subgroup ごとに 1 本のストリームを使い、ロスの影響を局所化する |
| ストリームのリセット | 古くなったデータの送信・再送を途中で打ち切る（部分的な信頼性） |
| ストリームの優先度制御 | 輻輳時に「新しい」「重要な」データを先に送る（09 章） |
| DATAGRAM 拡張（RFC 9221） | 再送しない小さな Object を送る |
| TLS 1.3 内蔵・0-RTT | 暗号化必須。再接続なら最初のパケットからリクエストを送れる |
| コネクションマイグレーション | Wi-Fi ↔ モバイル回線の切り替えでも接続を維持 |

> [!NOTE] 📜 仕様メモ: DATAGRAM は必須
> MOQT を QUIC 直接、または WebTransport over HTTP/3 で動かす場合、QUIC の DATAGRAM 拡張のサポートとネゴシエーションが MUST です。

## 2 つの接続方法

MOQT は「ストリームとデータグラムを持つトランスポート」の上なら同じように動きます。draft-22 では次の 2 つが定義されています。

### 1. ネイティブ QUIC

サーバーやネイティブアプリ向け。QUIC 接続を直接張り、TLS の ALPN で MOQT を選びます。URI の authority や path は、MOQT の最初のメッセージ SETUP の中の Setup Option（`AUTHORITY` / `PATH`）で伝えます。

### 2. WebTransport

ブラウザ向け。WebTransport は「HTTP/3 の上で QUIC のストリームとデータグラムを Web ページに開放する」仕組みです。クライアントは moqt URI のスキームを `https` に置き換え、その URL に extended CONNECT を送ってセッションを開きます。MOQT のバージョンは `WT-Available-Protocols` ヘッダーで交渉します。

WebTransport は HTTP/2（TCP）の上でも動きますが、その場合は TCP の HoL ブロッキングが戻ってくるので、MOQT は動くものの遅延特性は大きく異なります。

```text
moqt://relay.example.com/live?token=abc
  │       │                │     └─ query（スコープには含まれない）
  │       │                └─ path-abempty
  │       └─ authority（省略時はポート 443）
  └─ scheme
WebTransport の場合 → https://relay.example.com/live?token=abc へ CONNECT
```

## MOQT URI とスコープ

MOQT サーバーは `moqt` スキームの URI で識別されます。

```text
moqt-URI = "moqt" "://" authority path-abempty [ "?" query ]
```

- authority と path が同じなら同じスコープ（トラック名が一意な範囲、03 章）とみなします。query は含みません
- フラグメント（`#type:value`）はサーバーに送られず、セッション確立後にクライアント側で解釈されます

## ALPN によるバージョン交渉

ドラフトの版ごとに互換性がないため、ALPN でバージョンを決めます。

| 版 | ALPN |
| --- | --- |
| 最終版（RFC） | `moqt` |
| draft-N（-15 以降） | `moqt-N`（例: draft-22 → `moqt-22`） |
| -14 以前 | すべて `moq-00`。SETUP メッセージの中で版を交渉 |

クライアントは対応する MOQT の ALPN と `h3` を TLS ClientHello に並べて提示できます。サーバーが MOQT の ALPN を選べばネイティブ QUIC、`h3` を選べば WebTransport で続行します。

{{< mermaid >}}
sequenceDiagram
  participant C as クライアント
  participant S as サーバー
  C->>S: ClientHello (ALPN: moqt-22, moqt-21, h3)
  alt MOQT の ALPN を選択
    S-->>C: ServerHello (ALPN: moqt-22)
    Note over C,S: ネイティブ QUIC で MOQT セッション
  else h3 を選択
    S-->>C: ServerHello (ALPN: h3)
    C->>S: extended CONNECT https://… (WT-Available-Protocols)
    Note over C,S: WebTransport 上で MOQT セッション
  end
{{< /mermaid >}}

## 🧪 考えてみよう

ブラウザの JavaScript からはネイティブ QUIC のソケットを直接開けないので、ブラウザは WebTransport を使います。では、WebTransport がまだ安定して使えないブラウザではどうするのでしょう？ [moq.dev](https://doc.moq.dev/concept/transport.html) の実装は WebSocket へのフォールバックを用意しています。その場合、TCP の HoL ブロッキングは避けられません。

## 📝 まとめ

- TCP は 1 本のバイト列なので、ロスが全データを止める（HoL ブロッキング）
- QUIC のストリーム・リセット・優先度・データグラムが MoQ の低遅延を支える
- 接続方法はネイティブ QUIC（ALPN `moqt-N`）と WebTransport（https URL に CONNECT）の 2 つ

## 参考

- [draft-ietf-moq-transport-22 §6 Sessions](https://datatracker.ietf.org/doc/html/draft-ietf-moq-transport-22#section-6)
- [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000) / [RFC 9221: QUIC DATAGRAM](https://www.rfc-editor.org/rfc/rfc9221)
- [WebTransport (W3C)](https://www.w3.org/TR/webtransport/)

## ✅ 理解度クイズ

{{< quiz >}}
