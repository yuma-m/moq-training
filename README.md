# 楽しく学ぶ Media over QUIC

IETF で策定中の [Media over QUIC Transport（draft-ietf-moq-transport-22）](https://datatracker.ietf.org/doc/draft-ietf-moq-transport/) と関連ドラフト（MSF / CMSF / LOC）、そして [moq.dev](https://moq.dev/) の実装を参考に、MoQ の主要な概念と仕様を短く・楽しく学べるようにまとめたコースです。
各章の最後にある選択式クイズで、理解度を確かめながら進められます。

[Hugo](https://gohugo.io/) と [Hugo Book](https://github.com/alex-shpak/hugo-book) テーマで作っています。

**👉 サイトはこちら: https://yuma.cloud/moq-training/**

`main` ブランチに push すると、GitHub Actions（`.github/workflows/pages.yml`）がクイズを検証してからビルドし、GitHub Pages に自動で公開します。プルリクエストでは検証とビルドだけを行い、公開はしません。

## ローカルでの起動方法

執筆中に手元でプレビューする場合の手順です。[Hugo](https://gohugo.io/installation/)（extended 版）が必要です。

```sh
git submodule update --init --recursive
hugo server
```

http://localhost:1313/ を開きます。静的サイトをビルドするには `hugo --gc --minify` を実行します（出力先は `public/`）。

## 構成

- `content/docs/NN-*.md` — 1 章 1 ファイル。並び順は front matter の `weight` で決まる
- `layouts/_shortcodes/quiz.html` — ページの front matter に書いたクイズを表示する
- `layouts/_shortcodes/progress.html` — トップページの章ごとの進捗表
- `layouts/_shortcodes/diagram.html` — インライン SVG の図をキャプション付きで表示する
- `assets/quiz.js` — 正誤判定・スコア表示。結果はブラウザの `localStorage` に保存する
- `assets/styles/custom.css` — クイズ・図・ワイヤーフォーマット表のスタイル
- `scripts/check_quiz.py` — クイズの検証スクリプト

## 章の書き方

クイズは各章の front matter に書き（`answer` は 0 始まりの番号）、表示したい場所に `{{< quiz >}}` を置きます。`code` を書くとコードブロックとして表示され、`lang` でハイライトの言語を指定できます（既定は `text`）。

```yaml
quiz:
  - q: "Location {5, 3} と {4, 100} の大小関係は？"
    choices: ["{5, 3} < {4, 100}", "{5, 3} > {4, 100}"]
    answer: 1
    explain: "Location はまず Group で比較します。"
```

### 図

メッセージの流れや状態遷移は、テーマ同梱の Mermaid で書きます（ライト / ダークのテーマに自動で追従します）。

```text
{{< mermaid >}}
sequenceDiagram
  S->>P: SUBSCRIBE
  P-->>S: SUBSCRIBE_OK
{{< /mermaid >}}
```

構造図は `diagram` ショートコードの中にインライン SVG で書きます。色は直接指定せず、`custom.css` のクラス（`box`・`accent`・`ok`・`ng`・`warn`・`line`・`arrow`・`muted`）を使うとダークモードでも読めます。矢印の `marker` の `id` はページ内で重複しないようにします。

```text
{{< diagram caption="キャプション" >}}
<svg viewBox="0 0 640 200" role="img" aria-label="...">
  <rect class="box" x="10" y="10" width="100" height="40" rx="6"/>
  <text x="60" y="35" text-anchor="middle">ラベル</text>
</svg>
{{< /diagram >}}
```

ワイヤーフォーマットの表は `<div class="wire">` で囲むと、1 列目が等幅フォントになります。

## クイズの検証

[uv](https://docs.astral.sh/uv/) で実行します（依存の PyYAML は自動で入ります）。

```sh
uv run scripts/check_quiz.py content/docs/[0-9]*.md
```

各問に `q` / `choices` / `answer` / `explain` があること、選択肢が 2 つ以上で重複がないこと、`answer` が選択肢の範囲内であることを確認します。CI でも push とプルリクエストのたびに同じチェックが走り、失敗するとサイトは公開されません。

## 仕様の版について

MoQ の仕様は策定中で、版ごとにメッセージ名や構造が大きく変わります。本文は 2026 年 10 月時点の次の版に基づいています。新しい版が出たら、トップページ（`content/_index.md`）と 14 章の版表記もあわせて更新してください。

- draft-ietf-moq-transport-22
- draft-ietf-moq-msf-01
- draft-ietf-moq-cmsf-01
- draft-ietf-moq-loc-02
