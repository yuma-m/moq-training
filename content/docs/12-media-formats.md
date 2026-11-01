---
title: "12. メディアの載せ方: LOC・MSF・CMSF"
weight: 120
quiz:
  - q: "LOC（Low Overhead Media Container）のペイロードの中身は？"
    choices:
      - "fMP4 の moof + mdat"
      - "MPEG-TS パケット"
      - "WebCodecs の EncodedAudioChunk / EncodedVideoChunk の「内部データ」（コーデックの素のビットストリーム）"
      - "RTP パケット"
    answer: 2
    explain: "LOC は WebCodecs と揃えることを重視し、ペイロードは EncodedAudio/VideoChunk の内部データそのものです。余計なカプセル化がなく、ブラウザの WebCodecs に直接渡せます。"
  - q: "LOC の Public Properties と Private Properties の違いは？"
    choices:
      - "Public は MOQT の Object Properties に入りリレーから見える。Private はペイロード内に入り、エンドツーエンド暗号化できる"
      - "Public は暗号化され、Private は平文"
      - "Public は音声用、Private は映像用"
      - "違いはない"
    answer: 0
    explain: "Public Properties は MOQT Object Properties として運ばれ、リレーやメディアスイッチが参照できます。Private Properties はペイロードの先頭に置かれ、メディアと一緒に暗号化できます。"
  - q: "MSF のカタログトラックについて正しいものは？"
    choices:
      - "トラック名は `catalog` で、各 Group の Object 0 は完全なカタログ、それ以降の Object は差分更新"
      - "HTTP で別途ダウンロードする"
      - "XML で書かれている"
      - "リレーがカタログを解析して書き換える"
    answer: 0
    explain: "MSF のカタログは `catalog` という名前の MOQT トラックで、JSON です。各 Group の最初の Object が独立した完全なカタログ、以降は deltaUpdate です。ペイロードはリレーにとって不透明で、暗号化もできます。"
  - q: "MSF で、同じ alternate group に属する映像トラック（1080p / 720p / 360p）が時間的に揃っている（time-aligned）利点は？"
    choices:
      - "暗号化が不要になる"
      - "同じ番号の Group 境界で、品質の違うトラックへきれいに切り替えられる（ABR）"
      - "音声が不要になる"
      - "リレーのキャッシュが不要になる"
    answer: 1
    explain: "time-aligned なトラックでは同じ Group ID の先頭が同じ時刻に相当するので、帯域に応じて Group 境界で別の品質のトラックへ切り替えられます。"
  - q: "CMSF の位置づけは？"
    choices:
      - "MSF とは無関係な独自フォーマット"
      - "MSF を拡張し、LOC に加えて CMAF（fMP4）でパッケージしたメディアも運べるようにしたもの"
      - "MOQT の新しいバージョン"
      - "HLS のプレイリスト形式"
    answer: 1
    explain: "CMSF（CMAF compliant MSF）は MSF のカタログやタイムラインなどをすべて引き継ぎつつ、既存の CMAF / DASH / HLS のエコシステムと相互運用できるよう CMAF パッケージングを追加します。"
---

# 12. メディアの載せ方: LOC・MSF・CMSF

## 🎯 この章のゴール

- MOQT の上に乗る「メディア層」の役割分担（コンテナとカタログ）を理解する
- LOC がフレームをどう Object に詰めるかを説明できる
- MSF のカタログトラックと、CMSF との関係を知る

## 💡 ひとことで言うと

> **MOQT は「宅配便のシステム」、LOC は「1 コマずつ詰める箱」、MSF のカタログは「番組表」**。番組表を見て欲しいトラックを選び、箱を開けて WebCodecs に渡せば再生できます。

## なぜメディア層が必要か

MOQT は中身を問わないので、MOQT だけではプレイヤーは再生できません。少なくとも次の 2 つを決める必要があります。

1. **コンテナ**: 1 フレームを Object にどう詰めるか（タイムスタンプ、コーデック設定など）
2. **カタログ**: どんなトラックがあり、それぞれ何のコーデック・解像度・ビットレートか

HLS / DASH でいえば、1 がセグメント（fMP4 / TS）、2 がプレイリスト（m3u8 / MPD）です。WebRTC なら RTP ペイロード形式と SDP にあたります。

| 層 | HLS / DASH | WebRTC | IETF MoQ |
| --- | --- | --- | --- |
| カタログ | m3u8 / MPD | SDP | **MSF カタログ** |
| コンテナ | fMP4 / TS | RTP | **LOC**（または CMAF = CMSF） |
| 転送 | HTTP | RTP / SRTP over UDP | **MOQT** |

## LOC: 低オーバーヘッドなコンテナ

**LOC（Low Overhead Media Container）** は、名前のとおり余計なカプセル化を極力しないコンテナです。

- ペイロードは **WebCodecs の EncodedAudioChunk / EncodedVideoChunk の「内部データ」**、つまりコーデックの素のビットストリーム
- WebCodecs Codec Registry に載っているすべての音声・映像コーデックが対象
- CMAF や RTP に比べてカプセル化のオーバーヘッドが小さく、低ビットレート音声のような用途でも負担にならない

### Object へのマッピング

{{< diagram caption="LOC の Object マッピング（draft-ietf-moq-loc-02 の図をもとに作成）" >}}
<svg viewBox="0 0 640 170" role="img" aria-label="LOC object mapping">
  <rect class="box" x="60" y="15" width="150" height="40" rx="4"/><text x="135" y="40" text-anchor="middle">MOQ Object Header</text>
  <rect class="accent" x="215" y="15" width="170" height="40" rx="4"/><text x="300" y="40" text-anchor="middle">MOQ Object Properties</text>
  <rect class="ok" x="390" y="15" width="190" height="40" rx="4"/><text x="485" y="40" text-anchor="middle">MOQ Object Payload</text>
  <line class="line" x1="215" y1="58" x2="140" y2="100"/><line class="line" x1="385" y1="58" x2="300" y2="100"/>
  <line class="line" x1="390" y1="58" x2="305" y2="100"/><line class="line" x1="580" y1="58" x2="600" y2="100"/>
  <rect class="accent" x="140" y="100" width="160" height="40" rx="4"/><text x="220" y="118" text-anchor="middle">LOC Public</text><text x="220" y="133" text-anchor="middle">Properties</text>
  <rect class="ok" x="305" y="100" width="150" height="40" rx="4"/><text x="380" y="118" text-anchor="middle">LOC Private</text><text x="380" y="133" text-anchor="middle">Properties</text>
  <rect class="ok" x="460" y="100" width="140" height="40" rx="4"/><text x="530" y="118" text-anchor="middle">LOC Payload</text><text x="530" y="133" text-anchor="middle">(EncodedChunk)</text>
  <text x="220" y="160" text-anchor="middle" class="muted">リレーから見える</text>
  <text x="452" y="160" text-anchor="middle" class="muted">e2e 暗号化できる</text>
</svg>
{{< /diagram >}}

- **LOC Public Properties** → MOQT の Object Properties に入る。リレーやメディアスイッチが、ペイロード（暗号化されているかも）を見ずに判断に使える
- **LOC Private Properties + LOC Payload** → MOQT の Object Payload に入る。リレー向けではなく、エンドツーエンド暗号化できる

### 主な LOC プロパティ

| プロパティ | ID | 内容 |
| --- | --- | --- |
| Timestamp | 0x06 | フレームのタイムスタンプ。単位は Timescale。Timescale がなければ Unix エポックからのマイクロ秒（壁時計） |
| Timescale | 0x08 | 1 秒あたりの Timestamp の単位数（例: 48000、90000）。あればメディア時間 |
| Video Config | 13（仮） | コーデックの extradata（WebCodecs の `VideoDecoderConfig.description`） |
| Video Frame Marking | 4（仮） | 独立フレーム・破棄可能・レイヤー情報など（RFC 9626） |
| Audio Level | 6（仮） | 音量とボイスアクティビティ（RFC 6464） |

（仮）は IANA への割り当て依頼中の値です。H.264 / H.265 では、パラメータセットをペイロード内（Annex B 形式）に置くか、Video Config ヘッダーに置くか（avc1 / hvc1 形式）を選べます。

> [!NOTE] 暗号化との組み合わせ
> LOC を MoQ Secure Objects と組み合わせると、鍵 ID は Immutable Property として（認証されるが暗号化はされない）運び、タイミングや音量など秘匿したいメタデータは Private Properties としてペイロードと一緒に暗号化できます。

## MSF: ストリーミングフォーマットとカタログ

**MSF（MOQT Streaming Format）** は、LOC でパッケージしたメディアを MOQT で配るための相互運用フォーマットです。カタログ、時刻合わせ、優先度の付け方、配信の開始・終了、ABR の方法などを定めます。

対象とする遅延の目安も書かれています（パブリッシャが送出してから視聴者が描画するまで）。

| 区分 | 遅延 |
| --- | --- |
| Real-time | 500ms 未満 |
| Interactive | 500ms〜2,500ms |
| Standard | 2,500ms 超 |
| VOD | 過去に作られ、無期限に視聴可能なコンテンツ |

### パッケージングのルール

- 1 つの EncodedAudioChunk / EncodedVideoChunk = **1 つの MOQT Object**
- 同じ GOP のサンプルは **同じ Group** に入れる
- Group ID は単調増加し、継続中は 1 ずつ増やす（SHOULD）。再起動時は以前より大きい値から始める（例: 現在時刻のミリ秒）
- Object ID は各 Group で 0 から始めて 1 ずつ増やす

### カタログトラック

カタログは、パブリッシャが出しているトラックを説明する **MOQT トラック** です（HTTP で別に取りに行くのではない）。

- トラック名は **`catalog`**（大文字小文字を区別）
- 中身は **JSON**。ペイロードはリレーにとって不透明で、暗号化もできる
- 各 Group の **Object 0 は独立した完全なカタログ**、それ以降の Object は **差分（deltaUpdate）**。差分は Subgroup 0 に入れる
- 差分でできるのは「トラックの追加」「既存トラックを複製して追加」「トラックの削除」だけ。トラックの属性を変えたいときは、別名で追加して古いものを削除する
- 視聴者は購読と同時に最新 Group の先頭から取得する（MSF-01 の表現では Joining FETCH。transport-22 では SUBSCRIBE + FILL_PARAMETERS に相当、06 章）

MSF-01 の例をもとにした最小のカタログ:

```json
{
  "version": "1",
  "generatedAt": 1746104606044,
  "tracks": [
    {
      "name": "1080p-video",
      "namespace": "conference.example.com/conference123/alice",
      "packaging": "loc",
      "isLive": true,
      "targetLatency": 2000,
      "role": "video",
      "renderGroup": 1,
      "codec": "av01.0.08M.10.0.110.09",
      "width": 1920,
      "height": 1080,
      "framerate": 30,
      "bitrate": 1500000
    },
    {
      "name": "audio",
      "namespace": "conference.example.com/conference123/alice",
      "packaging": "loc",
      "isLive": true,
      "targetLatency": 2000,
      "role": "audio",
      "renderGroup": 1,
      "codec": "opus",
      "samplerate": 48000,
      "channelConfig": "2",
      "bitrate": 32000
    }
  ]
}
```

よく使うフィールド:

| フィールド | 意味 |
| --- | --- |
| `name` / `namespace` | トラックの名前と名前空間 |
| `packaging` | `loc` など |
| `role` | `video`、`audio` などの役割 |
| `renderGroup` | 一緒に描画するトラックの組（映像 + 音声） |
| `altGroup` | 互いに代替となるトラックの組（品質違いの映像など、ABR の候補） |
| `codec` / `width` / `height` / `framerate` / `bitrate` / `samplerate` | 選択に使うメディア特性 |
| `isLive` / `targetLatency` | ライブか、目標遅延 |

### time-aligned と ABR

同じ alternate group のトラックは **time-aligned（時刻が揃っている）** でなければなりません。同じ番号の Group の先頭フレームが同じ表示時刻になるので、視聴者は **Group 境界で品質の違うトラックへきれいに切り替えられます**。MoQ の ABR は「Group 境界で別トラックに購読を切り替える」ことで実現します。

### その他のトラック

MSF は、メディア時間と Group / Object の対応を示す **Media Timeline トラック**、SCTE-35 などのイベントを運ぶ **Event Timeline トラック**、クライアントの QoE やリレーの動作を報告する **ログ / メトリクス用の publish トラック** なども定義しています。字幕（WebVTT / IMSC1）、コンテンツ暗号化、トークン認可、広告挿入も範囲に入っています。

## CMSF: CMAF でも運べる MSF

既存の配信システムの多くは **CMAF（fMP4）** でメディアを作っています。**CMSF（CMAF compliant MSF）** は MSF を拡張し、MSF のカタログ・タイムライン・ABR・LOC サポートをすべて引き継いだうえで、**CMAF でパッケージしたメディア** も運べるようにします。HLS / DASH 用に作ったコンテンツを再パッケージせずに MoQ で配れるので、「Convergence（01 章）」の目標に近づきます。

## 🧪 考えてみよう

LOC と CMAF、どちらを選ぶべきでしょう？ ブラウザの WebCodecs で直接デコードし、1 フレームのオーバーヘッドを極限まで減らしたい（会議、低ビットレート音声）なら LOC。既存の HLS / DASH / DRM のエコシステムと同じメディアを共有したい（大規模配信）なら CMAF（CMSF）が向いています。

## 📝 まとめ

- MOQT の上で、**コンテナ（LOC / CMAF）** と **カタログ（MSF）** がメディアの意味を与える
- LOC はペイロード = WebCodecs のチャンク。Public Properties はリレーから見え、Private Properties は暗号化できる
- MSF のカタログは `catalog` トラックの JSON。Group の Object 0 が完全版、以降は差分
- CMSF は MSF に CMAF パッケージングを加え、既存エコシステムと相互運用する

## 参考

- [draft-ietf-moq-loc-02](https://datatracker.ietf.org/doc/draft-ietf-moq-loc/)
- [draft-ietf-moq-msf-01](https://datatracker.ietf.org/doc/draft-ietf-moq-msf/)
- [draft-ietf-moq-cmsf-01](https://datatracker.ietf.org/doc/draft-ietf-moq-cmsf/)
- [WebCodecs Codec Registry](https://www.w3.org/TR/webcodecs-codec-registry/)

## ✅ 理解度クイズ

{{< quiz >}}
