#!/usr/bin/env python3
"""
Seed culture_topics and culture_glossary tables.

Run from the backend directory:
    python -m scripts.seed_culture

Idempotent — skips rows that already exist (matched on slug / term_ja).
All topics are published immediately (published_at = NOW()).
"""

from __future__ import annotations

import asyncio
import pathlib

# Ensure app modules resolve correctly when run as a script
import sys
from datetime import UTC, datetime

from sqlalchemy import select

sys.path.insert(0, str(pathlib.Path(__file__).parent.parent))

from app.database import AsyncSessionFactory
from app.models.culture import CultureGlossary, CultureTopic

# ---------------------------------------------------------------------------
# Culture topics — 12 articles covering core workplace topics
# ---------------------------------------------------------------------------

TOPICS = [
    {
        "slug": "horenso-basics",
        "title": "報連相（ホウレンソウ）の基本",
        "tags": ["報連相", "コミュニケーション", "ビジネスマナー"],
        "body": """## 報連相とは？

**報連相（ホウレンソウ）**は日本のビジネス文化における最も重要なコミュニケーション原則の一つです。

- **報**（ほう）= 報告（Hōkoku）— 上司への進捗・結果報告
- **連**（れん）= 連絡（Renraku）— チームメンバーへの情報共有
- **相**（そう）= 相談（Sōdan）— 判断に迷う際の上司への相談

## なぜ重要か

日本の職場では自律的に動くことが評価される一方、**情報の非共有は信頼を損ないます**。報連相は上司に「任せても安心」と感じてもらうための行動です。

## 実践のポイント

1. **報告は結論から先に** — 「〇〇の件、完了しました」→詳細の順
2. **悪いニュースほど早く** — 問題が小さいうちに上司に相談する
3. **相談は選択肢を持って** — 「どうすればいいですか？」ではなく「A案とB案を考えました。どちらがよいでしょうか？」

## インドネシア人として気をつけること

直接的なNoを避けるインドネシア文化と異なり、日本では**問題を報告しないことのほうがリスク**です。「まだ大丈夫」と思っても、早めの相談を心がけましょう。
""",
    },
    {
        "slug": "keigo-basics",
        "title": "敬語（けいご）の基本 — ビジネス日本語入門",
        "tags": ["keigo", "敬語", "日本語", "ビジネスマナー"],
        "body": """## 敬語とは？

敬語は話し相手や第三者への敬意を言語で表す表現システムです。大きく3種類に分かれます。

| 種類 | 説明 | 例 |
|------|------|----|
| 尊敬語 | 相手の行為を高める | 「いらっしゃる」「おっしゃる」 |
| 謙譲語 | 自分の行為を低める | 「参る」「申す」「いただく」 |
| 丁寧語 | 丁寧な言い回し | 「です」「ます」「ございます」 |

## よく使うフレーズ

```
お疲れ様です。        — お疲れ様 (greeting colleagues)
よろしくお願いします。 — Please / I'm counting on you
承知しました。         — Understood (formal)
かしこまりました。     — Certainly (very formal)
失礼いたします。       — Excuse me (entering/leaving a room)
```

## 外国人が避けるべきミス

- 上司に「ありがとう」（友達言葉）→ 「ありがとうございます」
- メールで「わかった」→ 「承知いたしました」
- 「すみません」を乱用しすぎる（「申し訳ございません」を使い分ける）
""",
    },
    {
        "slug": "nemawashi-ringi",
        "title": "根回し（ねまわし）と稟議（りんぎ）— 日本の意思決定プロセス",
        "tags": ["意思決定", "ビジネス文化", "職場"],
        "body": """## 根回しとは？

**根回し（ねまわし）**は、会議や正式な決定の前に関係者と個別に調整を行うプロセスです。

植木の根を傷めないよう周りの土を掘り回す作業が語源で、**根を張ってから木を動かす**という考え方を表しています。

## 稟議（りんぎ）とは？

稟議は提案書（稟議書）を回覧し、関係者全員のハンコをもらう承認プロセスです。

```
提案 → 起案者が稟議書作成 → 係長 → 課長 → 部長 → 役員（→ 社長）
```

## 外国人が直面する課題

会議で初めて提案しても「持ち帰って検討します」と言われることが多い理由がこれです。**事前の根回しが成功の鍵**です。

## 実践アドバイス

1. 重要な提案の前に影響を受ける関係者に個別に話す
2. 反対意見は会議前に把握・対処する
3. 会議は「決める場」ではなく「確認する場」と理解する
""",
    },
    {
        "slug": "overtime-culture",
        "title": "残業文化と働き方改革 — 現状と変化",
        "tags": ["残業", "働き方", "ワークライフバランス"],
        "body": """## 日本の残業文化

日本では長時間労働が美徳とされてきた歴史があります。「最後まで残る = 真剣に仕事している」という考え方です。

しかし**2019年の働き方改革**により状況は変わりつつあります。

## 働き方改革の主な変更点

- 残業時間の上限規制（原則月45時間・年360時間）
- 年次有給休暇の年5日取得義務化
- 同一労働同一賃金の推進

## 外国人として気をつけること

| 状況 | 推奨行動 |
|------|---------|
| 定時で帰りたい | 事前に「本日は定時で失礼します」と一言 |
| 残業が続く | 上司に「業務量について相談したい」と申し出る |
| 有給を取りたい | 早めに申請し、繁忙期を避ける |

会社・部署によって文化は大きく異なります。入社前に残業文化を調査することを強くお勧めします。
""",
    },
    {
        "slug": "meeting-etiquette",
        "title": "日本の会議マナー — 準備から議事録まで",
        "tags": ["会議", "マナー", "ビジネス"],
        "body": """## 会議前の準備

- **アジェンダは事前共有** — 少なくとも1日前に送る
- **資料は印刷して配布** — デジタルのみは避ける（特に年配の参加者がいる場合）
- **5分前には着席** — 遅刻は失礼

## 会議中のマナー

- 発言は順番を守る。割り込まない
- 反対意見は「なるほど。一方で〜という観点もあるかと思いますが…」と柔らかく
- スマートフォンを見ない
- 沈黙を怖がらない — 日本では考えている時間を大切にする

## 会議後

- **議事録（ぎじろく）を24時間以内に送る** のが理想
- 決定事項・担当者・期限を明記する
- 「ご確認ください」と一言添えて参加者に共有

## よく使うフレーズ

```
以上でよろしいでしょうか？  — Does this work for everyone?
確認させてください。         — Let me confirm.
持ち帰って検討します。       — I'll take this back and consider it.
```
""",
    },
    {
        "slug": "business-card-meishi",
        "title": "名刺（めいし）交換のマナー",
        "tags": ["名刺", "マナー", "ビジネス", "初対面"],
        "body": """## 名刺交換は儀式

日本で名刺（めいし）は単なる連絡先情報ではなく、**その人自身の分身**と見なされます。

## 渡し方

1. 名刺入れから取り出す（ポケットから直接は失礼）
2. **両手で持ち、相手が読める向きに**
3. 軽くお辞儀をしながら「〇〇と申します。よろしくお願いいたします」
4. 同時交換の場合は右手で渡し左手で受け取る

## 受け取り方

1. **両手で受け取る**
2. 内容を確認しながら「頂戴いたします」
3. テーブルに置く場合は丁寧に（上に物を置かない）
4. 会議が終わるまで名刺入れにしまわない

## やってはいけないこと

- 名刺に書き込む
- 名刺を折る・曲げる
- テーブルの上をすべらせて渡す
- ポケットに雑に入れる
""",
    },
    {
        "slug": "senpai-kohai",
        "title": "先輩・後輩（せんぱい・こうはい）関係の理解",
        "tags": ["職場文化", "人間関係", "先輩後輩"],
        "body": """## 先輩・後輩とは？

日本の職場には**年功序列（ねんこうじょれつ）**を基盤とした先輩・後輩関係があります。

- **先輩（せんぱい）**：同じ組織に先に入った人（必ずしも年上ではない）
- **後輩（こうはい）**：自分より後に入った人

## 外国人として期待されること

後輩として入社した場合：
- 先輩に敬語を使う
- 指示を率先して引き受ける
- 「分からないことは聞く」姿勢を持つ

先輩として振る舞う場合：
- 後輩の仕事をサポートし育てる責任がある
- 飲み会など社内交流の場をリードすることがある

## バランスの取り方

先輩を立てながらも自分の意見を持つことは大切です。`「ご意見をいただけますでしょうか」`と前置きして提案するのが効果的です。
""",
    },
    {
        "slug": "nomunication",
        "title": "飲みニケーション（のみにケーション）— 職場の飲み会文化",
        "tags": ["飲み会", "職場文化", "コミュニケーション"],
        "body": """## 飲みニケーションとは？

**飲みニケーション（Nomunication）** = 飲む（nomu）+ Communication

職場の飲み会を通じて同僚・上司との関係を築く日本独特の文化です。

## 参加の重要性

特に入社直後は参加することを強くお勧めします：
- 職場の人間関係を素早く構築できる
- 上司の本音を聞ける唯一の場になることがある
- 「チームの一員」として認識される

## 飲み会のルール

1. **乾杯は全員揃ってから** — 先に飲み始めない
2. **注ぎ役をかって出る** — 自分のグラスより他の人を気にかける
3. **上司に背を向けて座らない**
4. **最初の注文はビールが無難**（飲めない場合は最初から「飲めません」と伝えてOK）

## 飲めない・帰りたい場合

「車で来ているので」「明日早いので失礼します」は十分な理由です。完全に参加しないよりも**少しでも顔を出す**ことが大切にされます。
""",
    },
    {
        "slug": "japanese-resume-rirekisho",
        "title": "履歴書（りれきしょ）の書き方 — 外国人向けガイド",
        "tags": ["履歴書", "就活", "書類"],
        "body": """## 履歴書とは？

履歴書は日本の就職活動で必須の書類です。JIS規格に基づいた**決まった形式**があります。

## 主な記載項目

| 項目 | ポイント |
|------|---------|
| 氏名 | フルネームをカタカナ（ふりがな付き）で |
| 写真 | 3×4cmの証明写真（スーツ・無地背景） |
| 学歴 | 最終学歴から記載。西暦・和暦どちらでも可（統一すること） |
| 職歴 | 入社・退社年月日と会社名・役職 |
| 資格・免許 | 取得年月日とともに記載 |
| 志望動機 | 会社・職種への熱意を具体的に |
| 自己PR | 自分の強みと入社後の貢献 |

## 外国人が気をつけること

- **手書きの場合は丁寧に** — 修正液の使用はNG（書き直す）
- **写真は必須** — 日本では顔写真添付が一般的
- **空欄を作らない** — 「特になし」より「現在勉強中」のほうが好まれる
- **日本語の履歴書でも外国籍であることを記載可** — 正直に書く

## PCで作成する場合

当サービスのAIが自動生成します。アップロードした英語の履歴書をもとに日本語の履歴書を生成できます。
""",
    },
    {
        "slug": "feedback-culture",
        "title": "フィードバックの受け方・伝え方 — 日本式コミュニケーション",
        "tags": ["フィードバック", "コミュニケーション", "職場"],
        "body": """## 日本のフィードバックの特徴

日本では直接的な批判を避け、**遠回しな表現**でフィードバックをすることが多いです。

## よくある遠回しな表現

| 実際に言われること | 本当の意味 |
|-------------------|-----------|
| 「少し検討の余地がありますね」 | これは問題です |
| 「もう少し具体的にいただけますか？」 | 理解できない、やり直してください |
| 「なかなか難しいですね」 | できません / No |
| 「ご参考までに…」 | これが正解です |

## フィードバックを上手に受けるコツ

1. 防衛的にならず、メモを取る
2. 「承知しました。具体的にはどのような点を改善すればよいでしょうか？」と聞き返す
3. 修正後は「修正しました。ご確認ください」と必ず報告する

## フィードバックを伝える際の注意

- 他の人がいる前で批判しない（一対一で行う）
- 「〇〇さんのおかげで気づけました」と感謝を入れる
- 問題点より改善案を中心に話す
""",
    },
    {
        "slug": "hanko-culture",
        "title": "ハンコ文化 — 日本の印鑑の役割",
        "tags": ["ハンコ", "印鑑", "行政手続き", "職場"],
        "body": """## 印鑑（いんかん）とハンコとは？

日本では署名の代わりに**印鑑（はんこ）**を使う文化があります。

## 種類

| 種類 | 用途 |
|------|------|
| 認印（みとめいん） | 日常的な書類（宅配受取など） |
| 実印（じついん） | 重要な契約（市区町村に登録）|
| 銀行印（ぎんこういん） | 銀行口座用 |
| 社印・角印 | 会社の公式書類用 |

## 外国人はどうすればいい？

- 日常業務では**認印**があれば十分
- カタカナで名前を彫った認印は文房具店で1,000円程度で作れる
- 重要書類では**サイン（署名）で代用可**な場合も増えている（要確認）

## デジタル化の流れ

2021年の行政手続きデジタル化以降、ハンコ廃止が進んでいます。ただし民間企業では依然として使われているため、入社後に確認しましょう。
""",
    },
    {
        "slug": "japanese-work-visa-overview",
        "title": "日本の就労ビザ概要 — インドネシア人向けガイド",
        "tags": ["ビザ", "就労", "在留資格", "法律"],
        "body": """## 主な就労ビザの種類

### 技術・人文知識・国際業務
IT、エンジニア、マーケティング、人事など**専門職**に最も多いビザです。

**要件:**
- 関連する大学の学位または10年以上の実務経験
- 日本の企業からの内定

### 特定技能1号
介護・建設・外食など**14の指定分野**向け。日本語と技能の試験合格が必要。

### 高度専門職
ポイント制（70点以上）で優遇される高度人材向けビザ。永住権への道が短い。

## 申請の流れ

1. 日本企業から内定をもらう
2. 企業が「在留資格認定証明書（COE）」を申請
3. COEが交付されたら在インドネシア日本大使館でビザを申請
4. ビザ取得後に入国

## 注意点

- 転職する場合は**在留資格変更許可申請**が必要な場合がある
- ビザの種類によって「就労できる業種」が制限される
- 詳細は当サービスの**Visa Guidance**機能をご利用ください
""",
    },
]


# ---------------------------------------------------------------------------
# Glossary — 35 essential workplace terms
# ---------------------------------------------------------------------------

GLOSSARY = [
    ("報連相", "horenso", "Laporan, kontak, konsultasi — tiga pilar komunikasi bisnis Jepang"),
    ("敬語", "keigo", "Bahasa hormat Jepang yang digunakan kepada atasan dan tamu"),
    ("根回し", "nemawashi", "Lobi atau konsultasi informal sebelum keputusan resmi diambil"),
    ("稟議", "ringi", "Proses persetujuan dokumen dengan cap (hanko) dari semua pihak terkait"),
    ("名刺", "meishi", "Kartu nama; pertukaran meishi adalah ritual penting saat perkenalan"),
    ("先輩", "senpai", "Orang yang lebih dulu bergabung di organisasi; mentor atau senior"),
    ("後輩", "kohai", "Orang yang bergabung belakangan; junior dalam hubungan senpai-kohai"),
    ("飲み会", "nomikai", "Acara minum bersama rekan kerja; penting untuk membangun hubungan"),
    (
        "お疲れ様",
        "otsukare-sama",
        "Salam kepada rekan kerja yang berarti 'terima kasih atas kerja kerasmu'",
    ),
    (
        "承知しました",
        "shochi shimashita",
        "'Saya mengerti / siap' — ungkapan formal untuk menyatakan persetujuan",
    ),
    (
        "よろしくお願いします",
        "yoroshiku onegai shimasu",
        "Ungkapan serbaguna: 'tolong' / 'terima kasih sebelumnya' / 'senang berkenalan'",
    ),
    (
        "お世話になっております",
        "osewa ni natte orimasu",
        "Salam formal di email/telepon bisnis: 'Terima kasih atas dukungan Anda'",
    ),
    (
        "失礼します",
        "shitsurei shimasu",
        "Permisi — diucapkan saat masuk/keluar ruangan atau mengakhiri telepon",
    ),
    (
        "いただきます",
        "itadakimasu",
        "Ucapan sebelum makan; juga digunakan saat menerima sesuatu dengan hormat",
    ),
    (
        "ごちそうさま",
        "gochisosama",
        "Ucapan setelah makan; sering diucapkan kepada yang mentraktir",
    ),
    ("朝礼", "chorei", "Briefing pagi harian; umum di banyak perusahaan Jepang"),
    ("有給休暇", "yukyu kyuka", "Cuti tahunan berbayar; wajib diambil minimal 5 hari per tahun"),
    ("残業", "zangyo", "Lembur; budaya lembur masih ada di banyak perusahaan"),
    (
        "年功序列",
        "nenko joretsu",
        "Sistem senioritas berdasarkan masa kerja; mempengaruhi promosi dan gaji",
    ),
    ("職場", "shokuba", "Tempat kerja; lingkungan kantor"),
    ("上司", "joshi", "Atasan langsung"),
    ("部下", "buka", "Bawahan langsung"),
    ("同僚", "doryo", "Rekan kerja setingkat"),
    ("出張", "shuccho", "Perjalanan dinas"),
    ("転勤", "tenkin", "Mutasi atau perpindahan kantor; umum di perusahaan besar Jepang"),
    ("履歴書", "rirekisho", "CV standar Jepang dengan format baku; berbeda dari CV internasional"),
    (
        "職務経歴書",
        "shokumukeirekisho",
        "Dokumen riwayat karier detail; melengkapi履歴書 untuk posisi berpengalaman",
    ),
    ("面接", "mensetsu", "Wawancara kerja"),
    ("内定", "naitei", "Tawaran pekerjaan resmi sebelum bergabung; sangat mengikat secara moral"),
    ("試用期間", "shiyo kikan", "Masa percobaan (biasanya 3 bulan)"),
    ("正社員", "seishain", "Karyawan tetap penuh waktu; memiliki keamanan kerja tertinggi"),
    ("派遣社員", "haken shain", "Karyawan kontrak melalui agen; berbeda hak dibanding正社員"),
    ("在宅勤務", "zaitaku kinmu", "Bekerja dari rumah / remote work"),
    (
        "フレックスタイム",
        "flekkusu taimu",
        "Jam kerja fleksibel; jam masuk/pulang bisa disesuaikan",
    ),
    (
        "ワークライフバランス",
        "waku raifu baransu",
        "Keseimbangan kerja dan kehidupan pribadi; semakin diperhatikan pasca働き方改革",
    ),
]


# ---------------------------------------------------------------------------
# Seed runner
# ---------------------------------------------------------------------------


async def seed() -> None:
    now = datetime.now(tz=UTC)

    async with AsyncSessionFactory() as session:
        # --- Culture topics ---
        existing_slugs = set(await session.scalars(select(CultureTopic.slug)))
        topics_added = 0
        for t in TOPICS:
            if t["slug"] in existing_slugs:
                continue
            session.add(
                CultureTopic(
                    slug=t["slug"],
                    title=t["title"],
                    body=t["body"],
                    tags=t["tags"],
                    published_at=now,
                )
            )
            topics_added += 1

        # --- Glossary ---
        existing_terms = set(await session.scalars(select(CultureGlossary.term_ja)))
        glossary_added = 0
        for term_ja, reading, definition in GLOSSARY:
            if term_ja in existing_terms:
                continue
            session.add(
                CultureGlossary(
                    term_ja=term_ja,
                    reading_romaji=reading,
                    definition_id=definition,
                )
            )
            glossary_added += 1

        await session.commit()

    print(f"✓ Culture topics: {topics_added} added ({len(TOPICS) - topics_added} skipped)")
    print(f"✓ Glossary entries: {glossary_added} added ({len(GLOSSARY) - glossary_added} skipped)")


if __name__ == "__main__":
    asyncio.run(seed())
