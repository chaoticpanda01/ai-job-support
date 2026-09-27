/** Each code must be a valid BCP 47 tag: it is the locale for Date#toLocale{Date,Time,}String and the <html lang> value. */
export type Language = "en" | "id" | "ja";

export const DEFAULT_LANGUAGE: Language = "en";

/** Cookie that saves the chosen language so the server can render it. */
export const LANGUAGE_COOKIE = "preferred_language";

/** label is the visible short code; name is the language's own name, read by screen readers. */
export const LANGUAGES: { code: Language; label: string; name: string }[] = [
  { code: "en", label: "EN", name: "English" },
  { code: "id", label: "ID", name: "Bahasa Indonesia" },
  { code: "ja", label: "JP", name: "日本語" },
];

/** Narrows an untrusted value, such as a cookie, to a supported language. */
export function isLanguage(value: unknown): value is Language {
  return LANGUAGES.some(({ code }) => code === value);
}

/** The saved language from a document.cookie string, if it holds a supported one. */
export function languageFromCookies(cookieString: string): Language | undefined {
  for (const part of cookieString.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === LANGUAGE_COOKIE) {
      const saved = value.join("=");
      return isLanguage(saved) ? saved : undefined;
    }
  }
  return undefined;
}

const JAPANESE_SCRIPT = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/;

/**
 * "ja" when text contains kana or kanji, for free-form data whose language isn't
 * recorded, such as culture tags. Romanised Japanese like "keigo" stays untagged,
 * since a Japanese voice reads Latin letters poorly.
 */
export function japaneseLangOf(text: string): "ja" | undefined {
  return JAPANESE_SCRIPT.test(text) ? "ja" : undefined;
}

export const translations = {
  // ---------------------------------------------------------------------------
  // Navbar
  // ---------------------------------------------------------------------------
  nav: {
    resumes: { en: "Resumes", id: "Resume", ja: "レジュメ" },
    documents: { en: "Documents", id: "Dokumen", ja: "書類" },
    jobs: { en: "Jobs", id: "Lowongan", ja: "求人" },
    interview: { en: "Interview", id: "Wawancara", ja: "面接" },
    visa: { en: "Visa", id: "Visa", ja: "ビザ" },
    culture: { en: "Culture", id: "Budaya", ja: "文化" },
    settings: { en: "Settings", id: "Pengaturan", ja: "設定" },
    signIn: { en: "Sign in", id: "Masuk", ja: "ログイン" },
    openMenu: { en: "Open menu", id: "Buka menu", ja: "メニューを開く" },
    closeMenu: { en: "Close menu", id: "Tutup menu", ja: "メニューを閉じる" },
    admin: { en: "Admin", id: "Admin", ja: "管理" },
    home: { en: "Home", id: "Beranda", ja: "ホーム" },
    // Landmark name for the sidebar <nav>; menu is the phone drawer's dialog title.
    main: { en: "Main", id: "Utama", ja: "メイン" },
    menu: { en: "Menu", id: "Menu", ja: "メニュー" },
    groupPrepare: { en: "Prepare", id: "Persiapan", ja: "準備" },
    groupApply: { en: "Apply", id: "Melamar", ja: "応募" },
    groupSettleIn: { en: "Settle in", id: "Menetap", ja: "生活準備" },
    // Joins a stage name and its count for screen readers: "Prepare, 5 of 5 steps done".
    countSep: { en: ", ", id: ", ", ja: "、" },
    stepsDone: {
      en: "{done} of {total} steps done",
      id: "{done} dari {total} langkah selesai",
      ja: "{total}ステップ中{done}完了",
    },
    language: { en: "Language", id: "Bahasa", ja: "言語" },
  },

  // ---------------------------------------------------------------------------
  // Chat widget
  // ---------------------------------------------------------------------------
  chat: {
    title: {
      en: "Japan Job Assistant",
      id: "Asisten Kerja Jepang",
      ja: "日本就職アシスタント",
    },
    poweredBy: { en: "Powered by Gemini AI", id: "Didukung Gemini AI", ja: "Gemini AI 搭載" },
    greeting: {
      en: "Hi! I'm your Japan Job Support assistant. Ask me anything about working in Japan, visas, Japanese workplace culture, or resume tips! 🇯🇵",
      id: "Hai! Saya asisten Japan Job Support kamu. Tanya apa saja soal bekerja di Jepang, visa, budaya kerja Jepang, atau tips resume! 🇯🇵",
      ja: "こんにちは！日本就職サポートのアシスタントです。日本での就労、ビザ、職場文化、履歴書のコツなど、何でも聞いてください！🇯🇵",
    },
    signedOutPrompt: {
      en: "Sign in first before chatting with the Japan Job Assistant.",
      id: "Masuk dulu sebelum mengobrol dengan Asisten Kerja Jepang.",
      ja: "日本就職アシスタントとチャットするには、先にログインしてください。",
    },
    conversation: { en: "Conversation", id: "Percakapan", ja: "会話" },
    thinking: { en: "Thinking…", id: "Berpikir…", ja: "考え中…" },
    // An accessible name for the field, not an instruction: a screen reader
    // reads this as the label of the text box.
    inputLabel: {
      en: "Message to the assistant",
      id: "Pesan untuk asisten",
      ja: "アシスタントへのメッセージ",
    },
    placeholder: { en: "Ask me anything…", id: "Tanya apa saja…", ja: "何でも聞いてください…" },
    placeholderLimited: {
      en: "Chat limit reached…",
      id: "Batas chat tercapai…",
      ja: "チャットの上限に達しました…",
    },
    send: { en: "Send", id: "Kirim", ja: "送信" },
    openChat: { en: "Open chat", id: "Buka chat", ja: "チャットを開く" },
    closeChat: { en: "Close chat", id: "Tutup chat", ja: "チャットを閉じる" },
    // No duration and no pointer to the countdown: this bubble stays in the log
    // after the timer has run out, so anything it says about timing goes stale.
    limitReached: {
      en: "You've reached the chat limit. Please wait before sending another message.",
      id: "Kamu sudah mencapai batas chat. Tunggu sebentar sebelum mengirim pesan lagi.",
      ja: "チャットの上限に達しました。しばらく待ってから次のメッセージを送信してください。",
    },
    // {n} is replaced by the live countdown, so each language decides where in
    // the sentence it goes.
    limitCountdown: {
      en: "Chat limit reached — you can send another message in {n}",
      id: "Batas chat tercapai — kamu bisa mengirim pesan lagi dalam {n}",
      ja: "チャットの上限に達しました。次のメッセージは {n} 後に送信できます",
    },
  },

  // ---------------------------------------------------------------------------
  // Landing page
  // ---------------------------------------------------------------------------
  landing: {
    eyebrow: {
      en: "For Indonesian professionals",
      id: "Untuk profesional Indonesia",
      ja: "インドネシアのプロフェッショナルへ",
    },
    heroTitle: {
      en: "Your move to Japan, one step at a time.",
      id: "Pindah kerja ke Jepang, selangkah demi selangkah.",
      ja: "日本で働くまでを、一歩ずつ。",
    },
    heroLead: {
      en: "Build your 履歴書, practise interviews in Japanese, and find the right visa, in an app you can use in English, Bahasa Indonesia or 日本語.",
      id: "Buat 履歴書-mu, latihan wawancara dalam bahasa Jepang, dan temukan visa yang tepat, dalam aplikasi yang bisa kamu pakai dalam bahasa Inggris, Bahasa Indonesia, atau 日本語.",
      ja: "履歴書の作成、日本語での面接練習、最適なビザ探しまで。英語・インドネシア語・日本語で使えるアプリです。",
    },
    startFree: { en: "Start free", id: "Mulai gratis", ja: "無料で始める" },
    goToDashboard: { en: "Go to your dashboard", id: "Ke dasbor kamu", ja: "ダッシュボードへ" },
    seeHow: { en: "See how it works", id: "Lihat cara kerjanya", ja: "使い方を見る" },
    journeyTitle: {
      en: "From your resume to your visa",
      id: "Dari resume sampai visa",
      ja: "レジュメからビザまで",
    },
    journeyLead: {
      en: "Three stages, the same ones you'll follow in the app.",
      id: "Tiga tahap, sama seperti yang akan kamu ikuti di aplikasi.",
      ja: "アプリで進むのと同じ、3つのステージ。",
    },
    prepareTitle: {
      en: "Documents Japanese employers expect",
      id: "Dokumen yang diharapkan perusahaan Jepang",
      ja: "日本企業が求める応募書類",
    },
    prepareLead: {
      en: "See your resume the way a Japanese recruiter reads it, then turn it into the forms they ask for.",
      id: "Lihat resumemu seperti perekrut Jepang membacanya, lalu ubah menjadi formulir yang mereka minta.",
      ja: "日本の採用担当者の目線でレジュメを見直し、求められる書類の形に仕上げます。",
    },
    prepareTool1: {
      en: "Resume analysis with a Japan-market score",
      id: "Analisis resume dengan skor pasar Jepang",
      ja: "日本市場スコア付きのレジュメ分析",
    },
    prepareTool2: {
      en: "履歴書 in JIS format, as a portrait or landscape PDF",
      id: "履歴書 format JIS, sebagai PDF potret atau lanskap",
      ja: "JIS規格の履歴書（縦・横どちらのPDFにも対応）",
    },
    prepareTool3: {
      en: "職務経歴書 written from your work history",
      id: "職務経歴書 yang disusun dari riwayat kerjamu",
      ja: "職歴から作成する職務経歴書",
    },
    applyTitle: {
      en: "Postings you can actually read",
      id: "Lowongan yang benar-benar bisa kamu pahami",
      ja: "ちゃんと読める求人情報",
    },
    applyLead: {
      en: "Paste a Japanese job ad and read it in Bahasa Indonesia, scored for how open it is to foreign hires.",
      id: "Tempel iklan lowongan berbahasa Jepang dan baca dalam Bahasa Indonesia, lengkap dengan skor keterbukaan bagi pekerja asing.",
      ja: "日本語の求人を貼り付けると、インドネシア語で読めて、外国人採用への前向きさもスコアで分かります。",
    },
    applyTool1: {
      en: "Translation with a foreigner-friendliness score",
      id: "Terjemahan dengan skor keramahan bagi pekerja asing",
      ja: "外国人フレンドリー度付きの翻訳",
    },
    applyTool2: {
      en: "A match score against your resume",
      id: "Skor kecocokan dengan resumemu",
      ja: "レジュメとのマッチ度",
    },
    applyTool3: {
      en: "Mock interviews with written feedback, in Japanese too",
      id: "Simulasi wawancara dengan masukan tertulis, juga dalam bahasa Jepang",
      ja: "フィードバック付きの模擬面接（日本語にも対応）",
    },
    settleTitle: {
      en: "The visa, and the workplace",
      id: "Visa dan dunia kerja",
      ja: "ビザと職場",
    },
    settleLead: {
      en: "Find the visa that fits your background, and learn how a Japanese workplace runs.",
      id: "Temukan visa yang cocok dengan latar belakangmu, dan pelajari cara kerja di perusahaan Jepang.",
      ja: "経歴に合うビザを見つけ、日本の職場の仕組みを学べます。",
    },
    settleTool1: {
      en: "Visa options with a step-by-step roadmap and checklist, explained in Bahasa Indonesia",
      id: "Pilihan visa dengan peta jalan dan daftar periksa langkah demi langkah, dijelaskan dalam Bahasa Indonesia",
      ja: "ステップごとのロードマップとチェックリスト付きのビザ診断（解説はインドネシア語）",
    },
    settleTool2: {
      en: "Culture guides and a workplace glossary",
      id: "Panduan budaya dan glosarium dunia kerja",
      ja: "文化ガイドと職場用語集",
    },
    // Visually hidden heading for the facts strip, so the outline has no gap.
    factsTitle: { en: "Why it's different", id: "Apa bedanya", ja: "ここが違う" },
    fact1Title: { en: "Three languages", id: "Tiga bahasa", ja: "3つの言語" },
    fact1Text: {
      en: "Use the app in English, Bahasa Indonesia or 日本語, and get your resume feedback in the same language.",
      id: "Gunakan aplikasi dalam bahasa Inggris, Bahasa Indonesia, atau 日本語, dan dapatkan masukan resume dalam bahasa yang sama.",
      ja: "英語・インドネシア語・日本語で使え、レジュメへのフィードバックも同じ言語で届きます。",
    },
    fact2Title: { en: "JIS-format 履歴書", id: "履歴書 format JIS", ja: "JIS規格の履歴書" },
    fact2Text: {
      en: "Real PDFs, portrait or landscape, ready to send.",
      id: "PDF asli, potret atau lanskap, siap dikirim.",
      ja: "縦・横どちらでも、そのまま送れるPDF。",
    },
    fact3Title: {
      en: "Interviews in Japanese",
      id: "Wawancara dalam bahasa Jepang",
      ja: "日本語での面接",
    },
    fact3Text: {
      en: "Practise the real thing, with feedback on each answer.",
      id: "Latihan seperti aslinya, dengan masukan untuk setiap jawaban.",
      ja: "本番さながらの練習と、回答ごとのフィードバック。",
    },
    fact4Title: { en: "Free to try", id: "Gratis dicoba", ja: "無料で試せる" },
    fact4Text: {
      en: "Sign up and start with your resume. No payment details needed.",
      id: "Daftar dan mulai dari resumemu. Tanpa data pembayaran.",
      ja: "登録してレジュメから始めるだけ。支払い情報は不要です。",
    },
    aboutTitle: {
      en: "About this project",
      id: "Tentang proyek ini",
      ja: "このプロジェクトについて",
    },
    // {name} is the author's handle, set in bold by the page.
    aboutBuiltBy: {
      en: "Built by {name} as a portfolio project.",
      id: "Dibuat oleh {name} sebagai proyek portofolio.",
      ja: "{name}がポートフォリオとして制作したプロジェクトです。",
    },
    aboutCode: {
      en: "View the code on GitHub",
      id: "Lihat kodenya di GitHub",
      ja: "GitHubでコードを見る",
    },
    opensNewTab: {
      en: "(opens in a new tab)",
      id: "(terbuka di tab baru)",
      ja: "（新しいタブで開きます）",
    },
    finalTitle: {
      en: "Start with your resume",
      id: "Mulai dari resumemu",
      ja: "まずはレジュメから",
    },
    finalLead: {
      en: "Upload it and see how a Japanese recruiter would read it.",
      id: "Unggah dan lihat bagaimana perekrut Jepang akan membacanya.",
      ja: "アップロードして、日本の採用担当者の視点で確認しましょう。",
    },
    footer: {
      en: "© {year} · Built for Indonesian professionals",
      id: "© {year} · Dibuat untuk profesional Indonesia",
      ja: "© {year} · インドネシアのプロフェッショナルのために",
    },
    // Product previews (components/landing/previews.tsx). Each preview is one
    // image to screen readers; the label is all they hear of it.
    previewHomeLabel: {
      en: "Preview of the Home page: the next step is to create your 職務経歴書",
      id: "Pratinjau halaman Beranda: langkah berikutnya adalah membuat 職務経歴書",
      ja: "ホーム画面のプレビュー：次のステップは職務経歴書の作成",
    },
    previewScoreLabel: {
      en: "Preview of a resume analysis: Japan-market score 72",
      id: "Pratinjau analisis resume: skor pasar Jepang 72",
      ja: "レジュメ分析のプレビュー：日本市場スコア72",
    },
    previewJobLabel: {
      en: "Preview of a translated job posting: Backend Engineer in Tokyo, foreigner-friendliness 85",
      id: "Pratinjau lowongan yang diterjemahkan: Backend Engineer di Tokyo, keramahan bagi pekerja asing 85",
      ja: "翻訳された求人のプレビュー：東京のバックエンドエンジニア、外国人フレンドリー度85",
    },
    previewVisaLabel: {
      en: "Preview of a visa roadmap: step 2 of 5",
      id: "Pratinjau peta jalan visa: langkah 2 dari 5",
      ja: "ビザロードマップのプレビュー：ステップ2/5",
    },
    scoreTitle: { en: "Japan-market score", id: "Skor pasar Jepang", ja: "日本市場スコア" },
    scoreStrengths: { en: "Strengths", id: "Kekuatan", ja: "強み" },
    scoreImprove: { en: "To improve", id: "Perlu ditingkatkan", ja: "改善点" },
    jobTitle: {
      en: "Backend Engineer · Tokyo",
      id: "Backend Engineer · Tokyo",
      ja: "バックエンドエンジニア・東京",
    },
    jobTranslated: {
      en: "Translated from Japanese",
      id: "Diterjemahkan dari bahasa Jepang",
      ja: "日本語から翻訳",
    },
    jobVisa: { en: "Visa sponsorship", id: "Sponsor visa", ja: "ビザサポートあり" },
    jobFriendliness: {
      en: "Foreigner-friendliness",
      id: "Keramahan bagi pekerja asing",
      ja: "外国人フレンドリー度",
    },
    visaName: {
      en: "Engineer / Specialist in Humanities",
      id: "Engineer / Specialist in Humanities",
      ja: "技術・人文知識・国際業務",
    },
    visaStep: {
      en: "Roadmap · step 2 of 5",
      id: "Peta jalan · langkah 2 dari 5",
      ja: "ロードマップ・ステップ2/5",
    },
    visaItem1: { en: "Degree certificate", id: "Ijazah", ja: "卒業証明書" },
    visaItem2: {
      en: "Certificate of Eligibility",
      id: "Certificate of Eligibility (COE)",
      ja: "在留資格認定証明書",
    },
    visaItem3: { en: "Employment contract", id: "Kontrak kerja", ja: "雇用契約書" },
  },

  // ---------------------------------------------------------------------------
  // Shared / common
  // ---------------------------------------------------------------------------
  common: {
    skipToContent: {
      en: "Skip to main content",
      id: "Langsung ke konten utama",
      ja: "メインコンテンツへスキップ",
    },
    back: { en: "Back", id: "Kembali", ja: "戻る" },
    continue: { en: "Continue", id: "Lanjut", ja: "次へ" },
    saving: { en: "Saving…", id: "Menyimpan…", ja: "保存中…" },
    saveChanges: { en: "Save changes", id: "Simpan perubahan", ja: "変更を保存" },
    saved: { en: "Saved!", id: "Tersimpan!", ja: "保存しました！" },
    cancel: { en: "Cancel", id: "Batal", ja: "キャンセル" },
    delete: { en: "Delete", id: "Hapus", ja: "削除" },
    view: { en: "View", id: "Lihat", ja: "表示" },
    search: { en: "Search", id: "Cari", ja: "検索" },
    clear: { en: "Clear", id: "Hapus filter", ja: "クリア" },
    download: { en: "Download", id: "Unduh", ja: "ダウンロード" },
    primary: { en: "Primary", id: "Utama", ja: "メイン" },
    optional: { en: "optional", id: "opsional", ja: "任意" },
    source: { en: "Source:", id: "Sumber:", ja: "ソース：" },
    or: { en: "or", id: "atau", ja: "または" },
    yes: { en: "Yes", id: "Ya", ja: "あり" },
    no: { en: "No", id: "Tidak", ja: "なし" },
    notMentioned: { en: "Not mentioned", id: "Tidak disebutkan", ja: "記載なし" },
    error: {
      en: "Something went wrong. Please try again.",
      id: "Terjadi kesalahan. Coba lagi.",
      ja: "エラーが発生しました。再試行してください。",
    },
    deleted: { en: "Deleted", id: "Terhapus", ja: "削除しました" },
    deleteFailed: {
      en: "Failed to delete. Please try again.",
      id: "Gagal menghapus. Coba lagi.",
      ja: "削除に失敗しました。再試行してください。",
    },
    updateFailed: {
      en: "Failed to update. Please try again.",
      id: "Gagal memperbarui. Coba lagi.",
      ja: "更新に失敗しました。再試行してください。",
    },
    errorPageTitle: {
      en: "Something went wrong",
      id: "Terjadi kesalahan",
      ja: "問題が発生しました",
    },
    errorPageBody: {
      en: "This page ran into an unexpected error. Try again, or go back to the home page.",
      id: "Halaman ini mengalami kesalahan tak terduga. Coba lagi, atau kembali ke beranda.",
      ja: "このページで予期しないエラーが発生しました。もう一度お試しいただくか、ホームに戻ってください。",
    },
    close: { en: "Close", id: "Tutup", ja: "閉じる" },
    // One per HTTP status in lib/api-error.ts. The backend's own detail text is
    // English, so these stand in for it wherever a request failure is shown.
    errorConnection: {
      en: "Couldn't reach the server. Check your connection and try again.",
      id: "Tidak dapat menghubungi server. Periksa koneksi kamu, lalu coba lagi.",
      ja: "サーバーに接続できませんでした。接続を確認して再試行してください。",
    },
    // Not always an expired session: a 401 is also what comes back when Clerk
    // briefly fails to issue a token, and a retry works then.
    errorSignedOut: {
      en: "We couldn't verify your session. Try again, or sign in again if this keeps happening.",
      id: "Kami tidak dapat memverifikasi sesi kamu. Coba lagi, atau masuk lagi jika terus terjadi.",
      ja: "セッションを確認できませんでした。再試行するか、繰り返す場合は再度ログインしてください。",
    },
    errorNotAllowed: {
      en: "You don't have permission to do that.",
      id: "Kamu tidak memiliki izin untuk melakukan itu.",
      ja: "この操作を行う権限がありません。",
    },
    errorNotFound: {
      en: "That's no longer available. It may have been deleted.",
      id: "Itu sudah tidak tersedia. Mungkin sudah dihapus.",
      ja: "対象が見つかりません。削除された可能性があります。",
    },
    errorConflict: {
      en: "That can't be done right now. Refresh and try again.",
      id: "Itu tidak bisa dilakukan sekarang. Muat ulang, lalu coba lagi.",
      ja: "現在この操作は実行できません。更新してから再試行してください。",
    },
    errorUnsupportedType: {
      en: "That file type isn't supported. Check the accepted formats and try again.",
      id: "Tipe file itu tidak didukung. Periksa format yang diterima, lalu coba lagi.",
      ja: "このファイル形式は対応していません。対応形式を確認して再試行してください。",
    },
    errorTooLarge: {
      en: "That's too large to send. Try again with less content.",
      id: "Terlalu besar untuk dikirim. Coba lagi dengan konten yang lebih sedikit.",
      ja: "データが大きすぎます。内容を減らして再試行してください。",
    },
    errorInvalidInput: {
      en: "Some of what you entered isn't valid. Check it and try again.",
      id: "Sebagian yang kamu isi tidak valid. Periksa kembali, lalu coba lagi.",
      ja: "入力内容に誤りがあります。確認して再試行してください。",
    },
    // Used only when the response carried no Retry-After; the two below say how
    // long to wait when it did.
    errorRateLimited: {
      en: "You've reached your usage limit for now. Please try again later.",
      id: "Kamu sudah mencapai batas penggunaan untuk saat ini. Coba lagi nanti.",
      ja: "現在の利用上限に達しました。時間をおいて再試行してください。",
    },
    errorRateLimitedMinutes: {
      en: "You've reached your usage limit. Try again in about {n} minutes.",
      id: "Kamu sudah mencapai batas penggunaan. Coba lagi sekitar {n} menit lagi.",
      ja: "利用上限に達しました。約{n}分後に再試行してください。",
    },
    errorRateLimitedHours: {
      en: "You've reached your usage limit. Try again in about {n} hours.",
      id: "Kamu sudah mencapai batas penggunaan. Coba lagi sekitar {n} jam lagi.",
      ja: "利用上限に達しました。約{n}時間後に再試行してください。",
    },
    errorServer: {
      en: "The server couldn't complete that. Please try again.",
      id: "Server tidak dapat menyelesaikannya. Coba lagi.",
      ja: "サーバーで処理を完了できませんでした。再試行してください。",
    },
    // From lib/file-rejection.ts: a file the dropzone refused before any
    // request was made. errorUnsupportedType above is shared with the 415.
    fileTooLarge: {
      en: "That file is too large. The limit is {n} MB.",
      id: "File itu terlalu besar. Batasnya {n} MB.",
      ja: "ファイルが大きすぎます。上限は{n}MBです。",
    },
    fileOneAtATime: {
      en: "Please choose one file at a time.",
      id: "Pilih satu file saja.",
      ja: "ファイルは1つずつ選択してください。",
    },
    tryAgain: { en: "Try again", id: "Coba lagi", ja: "再試行" },
    retrying: { en: "Retrying…", id: "Mencoba lagi…", ja: "再試行中…" },
    goHome: { en: "Go to home page", id: "Ke beranda", ja: "ホームへ" },
    errorId: { en: "Error ID", id: "ID kesalahan", ja: "エラーID" },
    notFoundTitle: {
      en: "Page not found",
      id: "Halaman tidak ditemukan",
      ja: "ページが見つかりません",
    },
    notFoundBody: {
      en: "The page you're looking for doesn't exist or has moved.",
      id: "Halaman yang kamu cari tidak ada atau sudah dipindahkan.",
      ja: "お探しのページは存在しないか、移動した可能性があります。",
    },
  },

  // ---------------------------------------------------------------------------
  // Onboarding
  // ---------------------------------------------------------------------------
  onboarding: {
    stepOf: { en: "Step {n} of {t}", id: "Langkah {n} dari {t}", ja: "ステップ {n} / {t}" },
    // Step 1 — Consent
    s1Title: { en: "Before we begin", id: "Sebelum kita mulai", ja: "始める前に" },
    s1Sub: {
      en: "Japan Job Support uses AI to analyse your resume and generate career documents. Please read and accept the following before continuing.",
      id: "Japan Job Support menggunakan AI untuk menganalisis resume dan membuat dokumen karier. Baca dan setujui hal berikut sebelum melanjutkan.",
      ja: "Japan Job SupportはAIを使用してレジュメを分析し、キャリア書類を生成します。続行前に以下をご確認ください。",
    },
    s1Agree: {
      en: "By continuing, you agree that Japan Job Support may:",
      id: "Dengan melanjutkan, kamu setuju bahwa Japan Job Support dapat:",
      ja: "続行することで、Japan Job Supportが以下を行うことに同意します：",
    },
    s1P1: {
      en: "Process the content of your uploaded resume using the Gemini AI API to generate analysis, career documents, and job-match scores.",
      id: "Memproses konten resume yang diunggah menggunakan Gemini AI API untuk menghasilkan analisis, dokumen karier, dan skor kecocokan pekerjaan.",
      ja: "アップロードされたレジュメをGemini AI APIで処理し、分析・キャリア書類・マッチスコアを生成します。",
    },
    s1P2: {
      en: "Store AI-generated results (scores, translations, documents) in our database to provide the service.",
      id: "Menyimpan hasil AI (skor, terjemahan, dokumen) di database kami untuk menyediakan layanan.",
      ja: "サービス提供のため、AI生成結果をデータベースに保存します。",
    },
    s1P3: {
      en: "Send anonymised usage data as part of normal API operation. Your personal details are never used to train AI models.",
      id: "Mengirim data penggunaan anonim sebagai bagian dari operasi API normal. Data pribadimu tidak pernah digunakan untuk melatih model AI.",
      ja: "通常のAPI運用の一環として匿名データを送信します。個人情報はAIの学習に使用されません。",
    },
    s1Withdraw: {
      en: "You can withdraw consent at any time by deleting your account from",
      id: "Kamu dapat mencabut persetujuan kapan saja dengan menghapus akun dari",
      ja: "アカウントを削除することで、いつでも同意を取り消せます（",
    },
    s1DangerZone: {
      en: "Settings → Danger zone",
      id: "Pengaturan → Zona berbahaya",
      ja: "設定 → 危険ゾーン",
    },
    s1Checkbox: {
      en: "I understand and consent to AI processing of my resume data as described above.",
      id: "Saya memahami dan menyetujui pemrosesan AI atas data resume saya seperti yang dijelaskan di atas.",
      ja: "上記の説明に従ったAIによるレジュメデータの処理に同意します。",
    },
    s1Btn: { en: "I agree — continue", id: "Saya setuju — lanjut", ja: "同意して続行" },
    // Step 2
    s2Title: {
      en: "Welcome! Let's get started",
      id: "Selamat datang! Mari mulai",
      ja: "ようこそ！始めましょう",
    },
    s2Sub: {
      en: "Tell us your name and preferred language.",
      id: "Beritahu kami nama dan bahasa yang kamu gunakan.",
      ja: "お名前と使用言語を教えてください。",
    },
    s2Name: { en: "Full name", id: "Nama lengkap", ja: "氏名" },
    s2Lang: { en: "Preferred language", id: "Bahasa yang digunakan", ja: "使用言語" },
    // Step 3
    s3Title: { en: "Your background", id: "Latar belakangmu", ja: "あなたの背景" },
    s3Sub: {
      en: "Help us tailor your Japan job search.",
      id: "Bantu kami menyesuaikan pencarian kerja Jepang kamu.",
      ja: "日本での就職活動をカスタマイズします。",
    },
    s3Nation: { en: "Nationality", id: "Kewarganegaraan", ja: "国籍" },
    s3CurrLoc: { en: "Current location", id: "Lokasi saat ini", ja: "現在地" },
    s3TargLoc: {
      en: "Target location in Japan",
      id: "Lokasi tujuan di Jepang",
      ja: "日本での希望勤務地",
    },
    s3ExpYears: {
      en: "Years of work experience",
      id: "Tahun pengalaman kerja",
      ja: "職務経験年数",
    },
    // Step 4
    s4Title: {
      en: "Japanese & preferences",
      id: "Bahasa Jepang & preferensi",
      ja: "日本語・希望条件",
    },
    s4Sub: {
      en: "This helps us score your resume for the Japanese market.",
      id: "Ini membantu kami menilai resume kamu untuk pasar Jepang.",
      ja: "日本市場向けにレジュメのスコアを評価します。",
    },
    s4JpLevel: { en: "Japanese level", id: "Tingkat bahasa Jepang", ja: "日本語レベル" },
    s4Visa: { en: "Visa status", id: "Status visa", ja: "ビザ状況" },
    s4Industries: {
      en: "Target industries (comma-separated)",
      id: "Industri target (pisahkan koma)",
      ja: "希望業界（カンマ区切り）",
    },
    s4Roles: {
      en: "Target roles (comma-separated)",
      id: "Posisi target (pisahkan koma)",
      ja: "希望職種（カンマ区切り）",
    },
    completeBtn: { en: "Complete setup", id: "Selesaikan pengaturan", ja: "設定を完了" },
    noJapanese: { en: "No Japanese", id: "Belum bisa Bahasa Jepang", ja: "日本語なし" },
    visaNone: { en: "No visa yet", id: "Belum ada visa", ja: "ビザなし" },
    visaPending: { en: "Application in progress", id: "Sedang diproses", ja: "申請中" },
    visaHeld: { en: "Already holding a visa", id: "Sudah memiliki visa", ja: "取得済み" },
    // Step 5 — Personal info for 履歴書
    s5Title: {
      en: "履歴書 personal info",
      id: "Info pribadi untuk 履歴書",
      ja: "履歴書用の個人情報",
    },
    s5Sub: {
      en: "This is used to fill in your 履歴書 accurately — never guessed or invented.",
      id: "Digunakan untuk mengisi 履歴書 kamu secara akurat — tidak pernah ditebak.",
      ja: "履歴書を正確に作成するために使用されます。推測で埋めることはありません。",
    },
    s5GroupIdentity: { en: "Identity", id: "Identitas", ja: "本人情報" },
    s5GroupContact: { en: "Contact", id: "Kontak", ja: "連絡先" },
    s5GroupVisa: { en: "Visa", id: "Visa", ja: "ビザ情報" },
    s5NameKana: {
      en: "Name in katakana (ふりがな)",
      id: "Nama dalam katakana (ふりがな)",
      ja: "ふりがな",
    },
    s5DateOfBirth: { en: "Date of birth", id: "Tanggal lahir", ja: "生年月日" },
    s5Gender: { en: "Gender", id: "Jenis kelamin", ja: "性別" },
    s5GenderMale: { en: "Male", id: "Laki-laki", ja: "男性" },
    s5GenderFemale: { en: "Female", id: "Perempuan", ja: "女性" },
    s5Phone: { en: "Phone number", id: "Nomor telepon", ja: "電話番号" },
    s5Address: { en: "Mailing address", id: "Alamat surat", ja: "住所" },
    s5VisaExpiration: {
      en: "Residence card expiration date",
      id: "Tanggal kedaluwarsa kartu izin tinggal",
      ja: "在留カード有効期限",
    },
    s5VisaCategory: {
      en: "Visa category (e.g. Engineer/Specialist in Humanities)",
      id: "Kategori visa (misalnya Insinyur/Spesialis Humaniora)",
      ja: "在留資格（例：技術・人文知識・国際業務）",
    },
    s5GroupExtras: {
      en: "Extras (optional)",
      id: "Tambahan (opsional)",
      ja: "その他（任意）",
    },
    s5Photo: { en: "Photo", id: "Foto", ja: "写真" },
    s5PhotoHint: {
      en: "Used on your generated rirekisho. You can add or change this later in Settings.",
      id: "Digunakan pada rirekisho yang dihasilkan. Bisa ditambah/diganti nanti di Pengaturan.",
      ja: "生成される履歴書に使用されます。後で設定からも追加・変更できます。",
    },
    s5Hobbies: { en: "Hobbies", id: "Hobi", ja: "趣味" },
    s5SpecialSkills: { en: "Special skills", id: "Keahlian khusus", ja: "特技" },
    s5PersonalRequests: {
      en: "Requests to employer",
      id: "Permintaan kepada perusahaan",
      ja: "本人希望記入欄",
    },
    s5PersonalRequestsHint: {
      en: "Leave as-is to use the standard phrase, or edit if you have a specific request.",
      id: "Biarkan apa adanya untuk frasa standar, atau ubah jika punya permintaan khusus.",
      ja: "標準の文言のままでも構いません。特に希望があれば編集してください。",
    },
  },

  // ---------------------------------------------------------------------------
  // Resumes
  // ---------------------------------------------------------------------------
  resumes: {
    title: { en: "Resumes", id: "Resume", ja: "レジュメ" },
    sub: {
      en: "Upload your resume to get started. We'll analyse it for the Japanese job market.",
      id: "Unggah resumemu untuk memulai. Kami akan menganalisisnya untuk pasar kerja Jepang.",
      ja: "レジュメをアップロードして始めましょう。日本の就職市場向けに分析します。",
    },
    yourResumes: { en: "Your resumes", id: "Resume kamu", ja: "あなたのレジュメ" },
    noResumes: {
      en: "No resumes yet. Upload one above.",
      id: "Belum ada resume. Unggah di atas.",
      ja: "まだレジュメがありません。上でアップロードしてください。",
    },
    loadError: {
      en: "Failed to load resumes. Please refresh.",
      id: "Gagal memuat resume. Coba muat ulang.",
      ja: "レジュメの読み込みに失敗しました。更新してください。",
    },
    setPrimary: { en: "Set primary", id: "Jadikan utama", ja: "メインに設定" },
    confirmDelete: {
      en: "Delete this resume?",
      id: "Hapus resume ini?",
      ja: "このレジュメを削除しますか？",
    },
    // Uploader
    dragDrop: {
      en: "Drag & drop your resume",
      id: "Seret & lepas resume kamu",
      ja: "レジュメをドラッグ＆ドロップ",
    },
    dropHere: {
      en: "Drop your resume here",
      id: "Lepaskan resume kamu di sini",
      ja: "ここにレジュメをドロップ",
    },
    fileTypeHint: {
      en: "PDF or DOCX · max 10 MB",
      id: "PDF atau DOCX · maks 10 MB",
      ja: "PDFまたはDOCX · 最大10MB",
    },
    chooseFile: { en: "Choose file", id: "Pilih file", ja: "ファイルを選択" },
    uploading: { en: "Uploading…", id: "Mengunggah…", ja: "アップロード中…" },
    uploadSuccess: {
      en: "Resume uploaded successfully.",
      id: "Resume berhasil diunggah.",
      ja: "レジュメが正常にアップロードされました。",
    },
    // Detail
    notFound: {
      en: "Resume not found.",
      id: "Resume tidak ditemukan.",
      ja: "レジュメが見つかりません。",
    },
    uploaded: { en: "Uploaded", id: "Diunggah", ja: "アップロード" },
    aiAnalysis: { en: "AI Analysis", id: "Analisis AI", ja: "AI 分析" },
    analyseBtn: { en: "Analyse resume", id: "Analisis resume", ja: "レジュメを分析" },
    queueing: { en: "Queuing…", id: "Mengantri…", ja: "待機中…" },
    analysing: {
      en: "Analysing your resume… this may take up to 30 seconds.",
      id: "Menganalisis resume kamu… ini mungkin membutuhkan waktu hingga 30 detik.",
      ja: "レジュメを分析中…最大30秒かかる場合があります。",
    },
    analysisReady: {
      en: "Resume analysis is ready.",
      id: "Analisis resume sudah siap.",
      ja: "レジュメの分析が完了しました。",
    },
    analysisFailedBudget: {
      en: "You've reached your AI usage limit, so the analysis didn't run. Try again later.",
      id: "Kamu sudah mencapai batas penggunaan AI, jadi analisis tidak dijalankan. Coba lagi nanti.",
      ja: "AIの利用上限に達したため、分析を実行できませんでした。時間をおいて再試行してください。",
    },
    analysisFailedUnreadable: {
      en: "We couldn't read the text in this file. Upload a text-based PDF or DOCX and try again.",
      id: "Kami tidak dapat membaca teks di file ini. Unggah PDF atau DOCX berbasis teks, lalu coba lagi.",
      ja: "このファイルのテキストを読み取れませんでした。テキスト形式のPDFまたはDOCXをアップロードして再試行してください。",
    },
    analysisFailedFile: {
      en: "We couldn't open the stored file. Please try again.",
      id: "Kami tidak dapat membuka file yang tersimpan. Coba lagi.",
      ja: "保存されたファイルを開けませんでした。再試行してください。",
    },
    analysisFailedAi: {
      en: "The AI analysis couldn't be completed. Please try again.",
      id: "Analisis AI tidak dapat diselesaikan. Coba lagi.",
      ja: "AI分析を完了できませんでした。再試行してください。",
    },
    analysisFailedTimeout: {
      en: "The analysis stopped before it finished. Please try again.",
      id: "Analisis berhenti sebelum selesai. Coba lagi.",
      ja: "分析が完了する前に停止しました。再試行してください。",
    },
    analysisFailedUnknown: {
      en: "Something went wrong while analysing your resume. Please try again.",
      id: "Terjadi kesalahan saat menganalisis resume kamu. Coba lagi.",
      ja: "レジュメの分析中にエラーが発生しました。再試行してください。",
    },
    analysisLoadError: {
      en: "Couldn't load the analysis. Please try again.",
      id: "Gagal memuat analisis. Coba lagi.",
      ja: "分析を読み込めませんでした。再試行してください。",
    },
    analysisStatusError: {
      en: "Couldn't check the analysis status.",
      id: "Gagal memeriksa status analisis.",
      ja: "分析の状態を確認できませんでした。",
    },
    japanScore: { en: "Japan Market Score", id: "Skor Pasar Jepang", ja: "日本市場スコア" },
    strengths: { en: "Strengths", id: "Kelebihan", ja: "強み" },
    gaps: { en: "Gaps", id: "Kekurangan", ja: "ギャップ" },
    recommendations: { en: "Recommendations", id: "Rekomendasi", ja: "推奨事項" },
    langAssessment: { en: "Language Assessment", id: "Penilaian Bahasa", ja: "語学評価" },
    jpRequired: {
      en: "Estimated Japanese required:",
      id: "Perkiraan bahasa Jepang yang dibutuhkan:",
      ja: "必要な日本語レベル（推定）：",
    },
    jpNotRequired: { en: "Not required", id: "Tidak diperlukan", ja: "不要" },
    analysedAt: { en: "Analysed", id: "Dianalisis", ja: "分析済み" },
    uploadBtn: { en: "Upload resume", id: "Unggah resume", ja: "レジュメをアップロード" },
  },

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------
  jobs: {
    matchNotPossible: {
      en: "We couldn't score this match. The posting may not be translated yet, or that resume couldn't be read — try translating it again or picking another resume.",
      id: "Kami tidak dapat menilai kecocokan ini. Lowongan mungkin belum diterjemahkan, atau resume itu tidak terbaca — coba terjemahkan lagi atau pilih resume lain.",
      ja: "このマッチ度を算出できませんでした。求人がまだ翻訳されていないか、そのレジュメを読み取れなかった可能性があります。翻訳をやり直すか、別のレジュメを選んでください。",
    },
    title: { en: "Job Postings", id: "Lowongan Kerja", ja: "求人一覧" },
    sub: {
      en: "Translate Japanese job postings and score them against your resume.",
      id: "Terjemahkan lowongan kerja Jepang dan cocokkan dengan resume kamu.",
      ja: "日本語の求人を翻訳し、レジュメとマッチングします。",
    },
    tracker: { en: "Tracker", id: "Pelacak", ja: "管理" },
    translateBtn: { en: "+ Translate posting", id: "+ Terjemahkan lowongan", ja: "+ 求人を翻訳" },
    searchPlaceholder: {
      en: "Search job titles or summaries…",
      id: "Cari judul atau ringkasan lowongan…",
      ja: "求人タイトルや概要を検索…",
    },
    allScores: { en: "All scores", id: "Semua skor", ja: "すべてのスコア" },
    searchLabel: { en: "Search jobs", id: "Cari lowongan", ja: "求人を検索" },
    minScoreLabel: { en: "Minimum score", id: "Skor minimum", ja: "最低スコア" },
    matchResumeLabel: {
      en: "Resume to match",
      id: "Resume untuk dicocokkan",
      ja: "照合するレジュメ",
    },
    notesLabel: { en: "Application notes", id: "Catatan lamaran", ja: "応募メモ" },
    noPostings: {
      en: "No job postings found.",
      id: "Tidak ada lowongan kerja.",
      ja: "求人が見つかりません。",
    },
    translateLink: { en: "Translate a posting", id: "Terjemahkan lowongan", ja: "求人を翻訳する" },
    toGetStarted: { en: "to get started.", id: "untuk memulai.", ja: "して始めましょう。" },
    jobId: { en: "Job ID", id: "ID Lowongan", ja: "求人ID" },
    jobIdHint: {
      en: 'Paste this into the "Job posting ID" field when generating a document to tailor it to this role.',
      id: 'Tempel ini ke kolom "ID lowongan kerja" saat membuat dokumen agar disesuaikan dengan posisi ini.',
      ja: "書類を生成する際に「求人ID」欄へ貼り付けると、この求人向けに最適化されます。",
    },
    copy: { en: "Copy", id: "Salin", ja: "コピー" },
    copied: { en: "Copied!", id: "Disalin!", ja: "コピーしました！" },
    generateForThisJob: {
      en: "Generate for this job",
      id: "Buat untuk lowongan ini",
      ja: "この求人向けに生成",
    },
    generateRirekishoForJob: {
      en: "Generate 履歴書",
      id: "Buat 履歴書",
      ja: "履歴書を生成",
    },
    generateShokumuForJob: {
      en: "Generate 職務経歴書",
      id: "Buat 職務経歴書",
      ja: "職務経歴書を生成",
    },
    addToTracker: {
      en: "Add to tracker",
      id: "Tambahkan ke pelacak",
      ja: "トラッカーに追加",
    },
    addingToTracker: {
      en: "Adding...",
      id: "Menambahkan...",
      ja: "追加中...",
    },
    trackingLabel: {
      en: "Tracking:",
      id: "Dilacak:",
      ja: "追跡中：",
    },
    loadError: {
      en: "Failed to load job postings. Please refresh.",
      id: "Gagal memuat lowongan kerja. Coba muat ulang.",
      ja: "求人の読み込みに失敗しました。更新してください。",
    },
    untitled: { en: "Untitled posting", id: "Lowongan tanpa judul", ja: "タイトルなし" },
    friendliness: { en: "friendliness", id: "keramahan", ja: "フレンドリー度" },
    visaSponsorship: { en: "Visa sponsorship", id: "Sponsor visa", ja: "ビザサポート" },
    confirmDelete: {
      en: "Delete this job posting?",
      id: "Hapus lowongan ini?",
      ja: "この求人を削除しますか？",
    },
    // Translate page
    translateTitle: {
      en: "Translate a Job Posting",
      id: "Terjemahkan Lowongan Kerja",
      ja: "求人を翻訳",
    },
    translateSub: {
      en: "Paste the full text of a Japanese job posting and we'll translate it into Indonesian, extract key details, and score how foreigner-friendly it is.",
      id: "Tempel teks lengkap lowongan kerja Jepang dan kami akan menerjemahkannya ke Bahasa Indonesia, mengekstrak detail penting, dan menilai seberapa ramah untuk orang asing.",
      ja: "日本語求人の全文を貼り付けると、インドネシア語に翻訳し、詳細を抽出して外国人フレンドリー度を評価します。",
    },
    sourceUrl: { en: "Source URL", id: "URL Sumber", ja: "ソースURL" },
    sourceUrlHint: {
      en: "With a URL, the posting and its translation are shared with other users. Without one, only you can see it. We do not fetch the URL.",
      id: "Dengan URL, lowongan dan terjemahannya dibagikan dengan pengguna lain. Tanpa URL, hanya kamu yang bisa melihatnya. Kami tidak mengambil konten URL.",
      ja: "URLを入力すると、求人と翻訳は他のユーザーにも共有されます。URLがない場合はあなただけが閲覧できます。URLのコンテンツは取得しません。",
    },
    jobText: { en: "Job posting text", id: "Teks lowongan kerja", ja: "求人テキスト" },
    jobTextPlaceholder: {
      en: "Paste the full Japanese job posting text here…",
      id: "Tempel teks lengkap lowongan kerja Jepang di sini…",
      ja: "日本語求人の全文をここに貼り付けてください…",
    },
    charCount: {
      en: "{n} / {max} characters",
      id: "{n} / {max} karakter",
      ja: "{n} / {max}文字",
    },
    minChars: {
      en: "Minimum 50 characters required.",
      id: "Minimal 50 karakter diperlukan.",
      ja: "最低50文字必要です。",
    },
    translateSubmit: { en: "Translate posting", id: "Terjemahkan lowongan", ja: "求人を翻訳" },
    translating: { en: "Translating…", id: "Menerjemahkan…", ja: "翻訳中…" },
    backToJobs: { en: "← Back to jobs", id: "← Kembali ke lowongan", ja: "← 求人一覧へ" },
    jobNotFound: {
      en: "Job posting not found.",
      id: "Lowongan tidak ditemukan.",
      ja: "求人が見つかりません。",
    },
    // Detail page info
    jobDetails: { en: "Job Details", id: "Detail Pekerjaan", ja: "求人詳細" },
    company: { en: "Company", id: "Perusahaan", ja: "会社" },
    location: { en: "Location", id: "Lokasi", ja: "勤務地" },
    employmentType: { en: "Employment type", id: "Jenis pekerjaan", ja: "雇用形態" },
    salary: { en: "Salary", id: "Gaji", ja: "給与" },
    japaneseRequired: {
      en: "Japanese required",
      id: "Bahasa Jepang dibutuhkan",
      ja: "必要な日本語",
    },
    notRequired: { en: "Not required", id: "Tidak diperlukan", ja: "不要" },
    experience: { en: "Experience", id: "Pengalaman", ja: "経験年数" },
    freshGrads: { en: "Fresh graduates welcome", id: "Lulusan baru diterima", ja: "新卒歓迎" },
    yearsPlus: { en: "+ years", id: "+ tahun", ja: "年以上" },
    keyRequirements: { en: "Key requirements", id: "Persyaratan utama", ja: "主な要件" },
    benefits: { en: "Benefits", id: "Tunjangan", ja: "福利厚生" },
    translatedDesc: {
      en: "Translated Description",
      id: "Deskripsi Terjemahan",
      ja: "翻訳された説明",
    },
    summaryLabel: { en: "Summary:", id: "Ringkasan:", ja: "概要：" },
    showFull: { en: "Show full description", id: "Tampilkan deskripsi lengkap", ja: "全文を表示" },
    showLess: { en: "Show less", id: "Tampilkan lebih sedikit", ja: "折りたたむ" },
    foreignerFriendly: {
      en: "Foreigner Friendliness",
      id: "Keramahan terhadap Asing",
      ja: "外国人フレンドリー度",
    },
    outOf100: { en: "out of 100", id: "dari 100", ja: "/ 100" },
    veryAccessible: { en: "Very accessible", id: "Sangat terbuka", ja: "非常に受け入れやすい" },
    accessible: { en: "Accessible", id: "Terbuka", ja: "受け入れやすい" },
    challenging: { en: "Challenging", id: "Cukup sulit", ja: "難しい" },
    veryDifficult: { en: "Very difficult", id: "Sangat sulit", ja: "非常に難しい" },
    matchScore: { en: "Match Score", id: "Skor Kecocokan", ja: "マッチスコア" },
    uploadResumeTo: { en: "Upload a resume", id: "Unggah resume", ja: "レジュメをアップロード" },
    toScoreJob: {
      en: "to score this job.",
      id: "untuk menilai pekerjaan ini.",
      ja: "してこの求人をスコアリングしましょう。",
    },
    selectResume: { en: "Select a resume…", id: "Pilih resume…", ja: "レジュメを選択…" },
    scoreBtn: { en: "Score my resume", id: "Nilai resume saya", ja: "マッチスコアを計算" },
    scoring: { en: "Scoring…", id: "Menilai…", ja: "計算中…" },
    overallMatch: { en: "overall match", id: "kecocokan keseluruhan", ja: "総合マッチ度" },
    skills: { en: "Skills", id: "Keterampilan", ja: "スキル" },
    expLabel: { en: "Experience", id: "Pengalaman", ja: "経験" },
    japanese: { en: "Japanese", id: "Bahasa Jepang", ja: "日本語" },
    cultureFit: { en: "Culture fit", id: "Kesesuaian budaya", ja: "文化フィット" },
    strengths: { en: "Strengths", id: "Kelebihan", ja: "強み" },
    gaps: { en: "Gaps", id: "Kekurangan", ja: "ギャップ" },
    actions: { en: "Actions", id: "Tindakan", ja: "アクション" },
    // Applications tracker
    appTitle: { en: "Application Tracker", id: "Pelacak Lamaran", ja: "応募管理" },
    appSub: {
      en: "Track your job applications through the hiring pipeline.",
      id: "Pantau lamaran kerja kamu melalui jalur rekrutmen.",
      ja: "採用プロセスを通じて応募状況を管理します。",
    },
    appLoadError: {
      en: "Failed to load applications. Please refresh.",
      id: "Gagal memuat lamaran. Coba muat ulang.",
      ja: "応募の読み込みに失敗しました。更新してください。",
    },
    colPlanning: { en: "Planning", id: "Berencana", ja: "準備中" },
    colApplied: { en: "Applied", id: "Melamar", ja: "応募済み" },
    colInterviewing: { en: "Interviewing", id: "Wawancara", ja: "面接中" },
    colOffered: { en: "Offered", id: "Ditawari", ja: "内定" },
    colRejected: { en: "Rejected", id: "Ditolak", ja: "不採用" },
    colWithdrawn: { en: "Withdrawn", id: "Ditarik", ja: "辞退" },
    appliedOn: { en: "Applied", id: "Melamar", ja: "応募" },
    jobBoard: { en: "← Job board", id: "← Papan lowongan", ja: "← 求人一覧" },
    confirmRemove: {
      en: "Remove this application from the tracker?",
      id: "Hapus lamaran ini dari pelacak?",
      ja: "この応募をトラッカーから削除しますか？",
    },
    source: { en: "Source:", id: "Sumber:", ja: "ソース：" },
  },

  // ---------------------------------------------------------------------------
  // Interview
  // ---------------------------------------------------------------------------
  interview: {
    title: { en: "Interview Practice", id: "Latihan Wawancara", ja: "面接練習" },
    sub: {
      en: "Practise with an AI interviewer and get real-time per-answer feedback.",
      id: "Berlatih dengan pewawancara AI dan dapatkan umpan balik real-time untuk setiap jawaban.",
      ja: "AIによる面接練習で、回答ごとのリアルタイムフィードバックを取得します。",
    },
    newSession: { en: "+ New session", id: "+ Sesi baru", ja: "+ 新しいセッション" },
    noSessions: {
      en: "No completed sessions yet.",
      id: "Belum ada sesi yang selesai.",
      ja: "完了したセッションはまだありません。",
    },
    startFirst: {
      en: "Start your first practice interview.",
      id: "Mulai latihan wawancara pertama kamu.",
      ja: "最初の練習面接を始めましょう。",
    },
    loadError: {
      en: "Failed to load sessions. Please refresh.",
      id: "Gagal memuat sesi. Coba muat ulang.",
      ja: "セッションの読み込みに失敗しました。更新してください。",
    },
    // One per InterviewStreamErrorCode in types/api.ts.
    streamQuestionFailed: {
      en: "The interviewer couldn't produce a question, so this session was ended. Please start a new one.",
      id: "Pewawancara tidak dapat membuat pertanyaan, jadi sesi ini diakhiri. Mulai sesi baru.",
      ja: "面接官が質問を生成できなかったため、このセッションを終了しました。新しいセッションを開始してください。",
    },
    streamAnswerNotSaved: {
      en: "Your answer couldn't be saved. Send it again.",
      id: "Jawaban kamu tidak dapat disimpan. Kirim lagi.",
      ja: "回答を保存できませんでした。もう一度送信してください。",
    },
    streamSummaryFailed: {
      en: "The summary couldn't be generated. Try ending the session again.",
      id: "Ringkasan tidak dapat dibuat. Coba akhiri sesi lagi.",
      ja: "サマリーを生成できませんでした。もう一度セッションを終了してください。",
    },
    streamSummaryNotSaved: {
      en: "The summary couldn't be saved. Try ending the session again.",
      id: "Ringkasan tidak dapat disimpan. Coba akhiri sesi lagi.",
      ja: "サマリーを保存できませんでした。もう一度セッションを終了してください。",
    },
    streamEnded: {
      en: "The response ended unexpectedly. Please try again.",
      id: "Respons berakhir tiba-tiba. Coba lagi.",
      ja: "応答が途中で終了しました。再試行してください。",
    },
    connectionLost: {
      en: "Connection lost. Please try again.",
      id: "Koneksi terputus. Coba lagi.",
      ja: "接続が切断されました。再試行してください。",
    },
    sessionLoadError: {
      en: "Couldn't load this interview session.",
      id: "Gagal memuat sesi wawancara ini.",
      ja: "この面接セッションを読み込めませんでした。",
    },
    sessionNotFound: {
      en: "This interview session doesn't exist.",
      id: "Sesi wawancara ini tidak ditemukan.",
      ja: "この面接セッションは見つかりません。",
    },
    sessionRefreshError: {
      en: "Couldn't load the latest messages, so the next question may be missing.",
      id: "Gagal memuat pesan terbaru, jadi pertanyaan berikutnya mungkin belum muncul.",
      ja: "最新のメッセージを読み込めなかったため、次の質問が表示されていない可能性があります。",
    },
    sessionOffline: {
      en: "You're offline. This session will load when you reconnect.",
      id: "Kamu sedang offline. Sesi ini akan dimuat saat kamu terhubung kembali.",
      ja: "オフラインです。再接続するとこのセッションが読み込まれます。",
    },
    sessionRefreshOffline: {
      en: "You're offline. The latest messages will load when you reconnect.",
      id: "Kamu sedang offline. Pesan terbaru akan dimuat saat kamu terhubung kembali.",
      ja: "オフラインです。再接続すると最新のメッセージが読み込まれます。",
    },
    sessionSignedOut: {
      en: "Your sign-in may have expired. Try again, or sign in again if this keeps happening.",
      id: "Sesi masukmu mungkin sudah berakhir. Coba lagi, atau masuk kembali jika ini terus terjadi.",
      ja: "ログインの有効期限が切れた可能性があります。再試行するか、繰り返し発生する場合は再度ログインしてください。",
    },
    score: { en: "score", id: "skor", ja: "スコア" },
    langJa: { en: "Japanese", id: "Jepang", ja: "日本語" },
    langEn: { en: "English", id: "Inggris", ja: "英語" },
    langId: { en: "Indonesian", id: "Indonesia", ja: "インドネシア語" },
    review: { en: "Review →", id: "Lihat →", ja: "レビュー →" },
    // New session
    newTitle: {
      en: "Start a Mock Interview",
      id: "Mulai Wawancara Simulasi",
      ja: "模擬面接を始める",
    },
    newSub: {
      en: "Practice with an AI interviewer and get real-time feedback on each answer.",
      id: "Berlatih dengan pewawancara AI dan dapatkan umpan balik real-time untuk setiap jawaban.",
      ja: "AIによる面接練習で各回答のフィードバックを受け取ります。",
    },
    interviewType: { en: "Interview type", id: "Jenis wawancara", ja: "面接タイプ" },
    typeGeneral: { en: "General", id: "Umum", ja: "総合" },
    typeGeneralDesc: {
      en: "Self-introduction, motivation, and career goals — ideal for first practice.",
      id: "Perkenalan diri, motivasi, dan tujuan karier — ideal untuk latihan pertama.",
      ja: "自己紹介・動機・キャリア目標 — 初回練習に最適。",
    },
    typeBehavioral: { en: "Behavioural", id: "Perilaku", ja: "行動" },
    typeBehavioralDesc: {
      en: "STAR-method questions about past experience and how you handled situations.",
      id: "Pertanyaan metode STAR tentang pengalaman masa lalu.",
      ja: "過去の経験と対処法に関するSTAR方式の質問。",
    },
    typeTechnical: { en: "Technical", id: "Teknis", ja: "技術" },
    typeTechnicalDesc: {
      en: "Role-specific technical questions tailored to your target field.",
      id: "Pertanyaan teknis spesifik peran yang disesuaikan dengan bidang target kamu.",
      ja: "目標職種に合わせた技術的な専門質問。",
    },
    typeCulture: { en: "Culture Fit", id: "Kesesuaian Budaya", ja: "カルチャーフィット" },
    typeCultureDesc: {
      en: "Japanese workplace culture: teamwork, 報連相, adaptability, and values.",
      id: "Budaya tempat kerja Jepang: kerja tim, 報連相, kemampuan adaptasi, dan nilai-nilai.",
      ja: "日本の職場文化：チームワーク、報連相、適応力、価値観。",
    },
    titleGeneral: { en: "General Interview", id: "Wawancara Umum", ja: "総合面接" },
    titleBehavioral: { en: "Behavioural Interview", id: "Wawancara Perilaku", ja: "行動面接" },
    titleTechnical: { en: "Technical Interview", id: "Wawancara Teknis", ja: "技術面接" },
    titleCulture: {
      en: "Culture Fit Interview",
      id: "Wawancara Kesesuaian Budaya",
      ja: "カルチャーフィット面接",
    },
    interviewLang: { en: "Interview language", id: "Bahasa wawancara", ja: "面接言語" },
    context: { en: "Context", id: "Konteks", ja: "コンテキスト" },
    contextHint: {
      en: "optional — improves question quality",
      id: "opsional — meningkatkan kualitas pertanyaan",
      ja: "任意 — 質問の質が向上します",
    },
    rolePlaceholder: {
      en: "Target role (e.g. Software Engineer)",
      id: "Peran target (cth. Software Engineer)",
      ja: "希望職種（例：ソフトウェアエンジニア）",
    },
    companyPlaceholder: {
      en: "Target company (e.g. Toyota)",
      id: "Perusahaan target (cth. Toyota)",
      ja: "希望企業（例：トヨタ）",
    },
    startBtn: { en: "Start interview", id: "Mulai wawancara", ja: "面接を開始" },
    starting: { en: "Starting session…", id: "Memulai sesi…", ja: "セッション開始中…" },
    backToList: { en: "← Back", id: "← Kembali", ja: "← 戻る" },
    // Session page
    endSession: { en: "End session", id: "Akhiri sesi", ja: "セッションを終了" },
    endConfirm: {
      en: "End this interview session and get your overall feedback?",
      id: "Akhiri sesi wawancara ini dan dapatkan umpan balik keseluruhan?",
      ja: "このセッションを終了して全体フィードバックを取得しますか？",
    },
    stop: { en: "Stop", id: "Berhenti", ja: "停止" },
    send: { en: "Send", id: "Kirim", ja: "送信" },
    inputPlaceholder: {
      en: "Type your answer… (Enter to send, Shift+Enter for new line)",
      id: "Ketik jawabanmu… (Enter untuk kirim, Shift+Enter untuk baris baru)",
      ja: "回答を入力…（Enterで送信、Shift+Enterで改行）",
    },
    enterHint: {
      en: "Enter to send · Shift+Enter for new line",
      id: "Enter untuk kirim · Shift+Enter untuk baris baru",
      ja: "Enterで送信 · Shift+Enterで改行",
    },
    statusActive: { en: "active", id: "aktif", ja: "実施中" },
    statusCompleted: { en: "completed", id: "selesai", ja: "完了" },
    statusAbandoned: { en: "abandoned", id: "ditinggalkan", ja: "中断" },
    answerFeedback: { en: "Answer feedback", id: "Umpan balik jawaban", ja: "回答フィードバック" },
    answerLabel: { en: "Your answer", id: "Jawabanmu", ja: "あなたの回答" },
    feedbackReady: {
      en: "Feedback on your answer is ready.",
      id: "Umpan balik untuk jawabanmu sudah siap.",
      ja: "回答へのフィードバックが届きました。",
    },
    replyReady: {
      en: "The interviewer replied:",
      id: "Pewawancara membalas:",
      ja: "面接官の返答：",
    },
    summaryReady: {
      en: "Session complete. Your summary is ready.",
      id: "Sesi selesai. Ringkasanmu sudah siap.",
      ja: "セッションが終了しました。サマリーが届きました。",
    },
    keigo: { en: "Keigo", id: "Keigo", ja: "敬語" },
    relevance: { en: "Relevance", id: "Relevansi", ja: "関連性" },
    specificity: { en: "Specificity", id: "Spesifisitas", ja: "具体性" },
    goodLabel: { en: "Good:", id: "Bagus:", ja: "良い点：" },
    tipLabel: { en: "Tip:", id: "Tips:", ja: "アドバイス：" },
    grammarNotes: { en: "Grammar notes", id: "Catatan tata bahasa", ja: "文法メモ" },
    sessionComplete: { en: "Session Complete", id: "Sesi Selesai", ja: "セッション完了" },
    readiness80: { en: "Interview-ready", id: "Siap wawancara", ja: "面接準備完了" },
    readiness60: { en: "Almost ready", id: "Hampir siap", ja: "もう少し" },
    readiness40: { en: "Keep practising", id: "Terus berlatih", ja: "練習継続" },
    readiness0: {
      en: "More preparation needed",
      id: "Perlu lebih banyak persiapan",
      ja: "もっと準備が必要",
    },
    strengthsLabel: { en: "Strengths", id: "Kelebihan", ja: "強み" },
    improvementsLabel: { en: "Areas to improve", id: "Area yang perlu ditingkatkan", ja: "改善点" },
    backToSessions: { en: "Back to sessions", id: "Kembali ke sesi", ja: "セッション一覧へ" },
  },

  // ---------------------------------------------------------------------------
  // Visa
  // ---------------------------------------------------------------------------
  visa: {
    assessNeedsProfile: {
      en: "Complete your profile before we can assess your visa options.",
      id: "Lengkapi profil kamu sebelum kami bisa menilai opsi visa.",
      ja: "ビザの選択肢を判定する前に、プロフィールを完成させてください。",
    },
    roadmapOptionStale: {
      en: "That option isn't part of your latest assessment. Run the assessment again to choose from current options.",
      id: "Opsi itu bukan bagian dari penilaian terbaru kamu. Jalankan penilaian lagi untuk memilih dari opsi saat ini.",
      ja: "その選択肢は最新の判定に含まれていません。もう一度判定を実行して、現在の選択肢から選んでください。",
    },
    title: { en: "Visa Guidance", id: "Panduan Visa", ja: "ビザガイダンス" },
    sub: {
      en: "Personalised Japanese work visa roadmap based on your profile.",
      id: "Peta jalan visa kerja Jepang yang dipersonalisasi berdasarkan profilmu.",
      ja: "プロフィールに基づいた個別の日本就労ビザロードマップ。",
    },
    recommendedVisa: {
      en: "Recommended visa category",
      id: "Kategori visa yang direkomendasikan",
      ja: "推奨ビザカテゴリ",
    },
    guidance: { en: "Guidance", id: "Panduan", ja: "ガイダンス" },
    yourRoadmap: { en: "Your roadmap", id: "Peta jalanmu", ja: "あなたのロードマップ" },
    roadmapPhases: { en: "Roadmap phases", id: "Fase peta jalan", ja: "ロードマップのフェーズ" },
    previousRoadmaps: {
      en: "Previous roadmaps",
      id: "Peta jalan sebelumnya",
      ja: "過去のロードマップ",
    },
    generated: { en: "Generated", id: "Dibuat", ja: "生成日" },
    optional: { en: "optional", id: "opsional", ja: "任意" },
    showMore: { en: "Show more", id: "Tampilkan lebih", ja: "続きを表示" },
    showLess: { en: "Show less", id: "Tampilkan lebih sedikit", ja: "折りたたむ" },
    resources: { en: "Resources", id: "Sumber daya", ja: "参考資料" },
    roadmapTitle: { en: "Visa Roadmap", id: "Peta Jalan Visa", ja: "ビザロードマップ" },
    consultNotFound: {
      en: "Consultation not found.",
      id: "Konsultasi tidak ditemukan.",
      ja: "コンサルテーションが見つかりません。",
    },
    assessBtn: {
      en: "Assess my visa options",
      id: "Nilai opsi visa saya",
      ja: "ビザの選択肢を診断",
    },
    reassessBtn: {
      en: "Re-assess my options",
      id: "Nilai ulang opsi saya",
      ja: "選択肢を再診断",
    },
    assessing: { en: "Assessing…", id: "Menilai…", ja: "診断中…" },
    noAssessment: {
      en: "No visa assessment yet.",
      id: "Belum ada penilaian visa.",
      ja: "ビザ診断はまだありません。",
    },
    noAssessmentSub: {
      en: "Assess your options to see which visa categories you qualify for.",
      id: "Nilai opsi kamu untuk melihat kategori visa mana yang memenuhi syarat.",
      ja: "診断すると、条件を満たすビザカテゴリが分かります。",
    },
    loadFail: {
      en: "Couldn't load your visa assessment. Refresh the page to try again.",
      id: "Gagal memuat penilaian visamu. Muat ulang halaman untuk mencoba lagi.",
      ja: "ビザ診断を読み込めませんでした。ページを再読み込みしてもう一度お試しください。",
    },
    yourOptions: { en: "Your visa options", id: "Opsi visa kamu", ja: "ビザの選択肢" },
    eligible: { en: "Eligible", id: "Memenuhi syarat", ja: "条件を満たす" },
    eligibleWithGaps: {
      en: "Eligible with gaps",
      id: "Memenuhi syarat dengan catatan",
      ja: "一部条件が不足",
    },
    notEligible: { en: "Not eligible yet", id: "Belum memenuhi syarat", ja: "現時点では不可" },
    recommendedBadge: { en: "Recommended", id: "Direkomendasikan", ja: "おすすめ" },
    requirements: { en: "Requirements", id: "Persyaratan", ja: "要件" },
    gaps: { en: "What's missing", id: "Yang masih kurang", ja: "不足している点" },
    estimatedTime: { en: "Est. time", id: "Perkiraan waktu", ja: "目安期間" },
    months: { en: "months", id: "bulan", ja: "ヶ月" },
    buildRoadmap: { en: "Build roadmap", id: "Buat peta jalan", ja: "ロードマップを作成" },
    buildRoadmapHint: {
      en: "Uses one AI generation",
      id: "Menggunakan satu generasi AI",
      ja: "AI生成を1回使用します",
    },
    viewRoadmap: { en: "View roadmap", id: "Lihat peta jalan", ja: "ロードマップを見る" },
    building: { en: "Building…", id: "Membuat…", ja: "作成中…" },
    assessmentReady: {
      en: "Your visa options are ready.",
      id: "Opsi visamu sudah siap.",
      ja: "ビザの選択肢が表示されました。",
    },
    roadmapReady: {
      en: "Your roadmap is ready.",
      id: "Peta jalanmu sudah siap.",
      ja: "ロードマップが表示されました。",
    },
    backToOptions: { en: "Back to options", id: "Kembali ke opsi", ja: "選択肢に戻る" },
    switchRoadmap: { en: "Your roadmaps", id: "Peta jalanmu", ja: "あなたのロードマップ" },
    progressSaveFail: {
      en: "Couldn't save your progress.",
      id: "Gagal menyimpan progresmu.",
      ja: "進捗を保存できませんでした。",
    },
  },

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------
  documents: {
    title: { en: "Documents", id: "Dokumen", ja: "書類" },
    filterLabel: { en: "Filter by type", id: "Filter menurut jenis", ja: "種類で絞り込む" },
    wizJobIdLabel: { en: "Job posting ID", id: "ID lowongan", ja: "求人ID" },
    sub: {
      en: "Generate Japanese-format career documents from your resume.",
      id: "Buat dokumen karier format Jepang dari resume kamu.",
      ja: "レジュメから日本フォーマットのキャリア書類を生成します。",
    },
    all: { en: "All", id: "Semua", ja: "すべて" },
    noDocuments: {
      en: "No documents yet.",
      id: "Belum ada dokumen.",
      ja: "書類がまだありません。",
    },
    generateA: { en: "Generate a", id: "Buat", ja: "生成する" },
    orLabel: { en: "or", id: "atau", ja: "または" },
    toGetStarted: { en: "to get started.", id: "untuk memulai.", ja: "して始めましょう。" },
    loadError: {
      en: "Failed to load documents. Please refresh.",
      id: "Gagal memuat dokumen. Coba muat ulang.",
      ja: "書類の読み込みに失敗しました。更新してください。",
    },
    confirmDelete: {
      en: "Delete this document?",
      id: "Hapus dokumen ini?",
      ja: "この書類を削除しますか？",
    },
    profileIncompleteTitle: {
      en: "Complete your profile to generate a rirekisho",
      id: "Lengkapi profil untuk membuat rirekisho",
      ja: "履歴書を生成するにはプロフィールを完成させてください",
    },
    profileIncompleteHint: {
      en: "The following are required before a 履歴書 can be generated:",
      id: "Berikut ini wajib diisi sebelum 履歴書 dapat dibuat:",
      ja: "履歴書を生成する前に、以下の入力が必要です：",
    },
    goToSettings: { en: "Go to Settings", id: "Buka Pengaturan", ja: "設定へ移動" },
    profileLoadError: {
      en: "Failed to load your profile. Please refresh.",
      id: "Gagal memuat profil kamu. Coba muat ulang.",
      ja: "プロフィールの読み込みに失敗しました。更新してください。",
    },
    created: { en: "Created", id: "Dibuat", ja: "作成日" },
    statusPending: { en: "pending", id: "menunggu", ja: "待機中" },
    statusProcessing: { en: "processing", id: "diproses", ja: "処理中" },
    statusCompleted: { en: "completed", id: "selesai", ja: "完了" },
    statusFailed: { en: "failed", id: "gagal", ja: "失敗" },
    // Detail page
    backToDocuments: { en: "Back to documents", id: "Kembali ke dokumen", ja: "書類一覧へ" },
    notFound: {
      en: "Document not found.",
      id: "Dokumen tidak ditemukan.",
      ja: "書類が見つかりません。",
    },
    statusHeading: { en: "Document Status", id: "Status Dokumen", ja: "書類ステータス" },
    queued: { en: "Queued for generation", id: "Mengantri untuk dibuat", ja: "生成待ち" },
    generating: {
      en: "Generating your document…",
      id: "Membuat dokumen kamu…",
      ja: "書類を生成中…",
    },
    genWait: {
      en: "This usually takes 20–60 seconds. The page updates automatically.",
      id: "Biasanya membutuhkan 20–60 detik. Halaman diperbarui otomatis.",
      ja: "通常20〜60秒かかります。ページは自動で更新されます。",
    },
    genFailed: { en: "Generation failed", id: "Pembuatan gagal", ja: "生成失敗" },
    // One per DocumentErrorCode in types/api.ts.
    genFailedBudget: {
      en: "You've reached your AI usage limit, so the document wasn't generated. Try again later.",
      id: "Kamu sudah mencapai batas penggunaan AI, jadi dokumen tidak dibuat. Coba lagi nanti.",
      ja: "AIの利用上限に達したため、書類を生成できませんでした。時間をおいて再試行してください。",
    },
    genFailedProfile: {
      en: "Your profile is missing details a 履歴書 requires. Complete it, then generate the document again.",
      id: "Profil kamu belum memuat data yang diwajibkan 履歴書. Lengkapi dulu, lalu buat dokumen lagi.",
      ja: "履歴書に必要なプロフィール情報が不足しています。入力してから再度生成してください。",
    },
    genFailedResume: {
      en: "The resume this document was built from is no longer available. Generate a new document from a resume you still have.",
      id: "Resume sumber dokumen ini sudah tidak tersedia. Buat dokumen baru dari resume yang masih ada.",
      ja: "この書類の元になったレジュメは利用できなくなりました。お手元のレジュメから新しい書類を作成してください。",
    },
    genFailedFile: {
      en: "We couldn't open the stored resume file. Please try again.",
      id: "Kami tidak dapat membuka file resume yang tersimpan. Coba lagi.",
      ja: "保存されたレジュメファイルを開けませんでした。再試行してください。",
    },
    genFailedUnreadable: {
      en: "We couldn't read the text in the resume file. Upload a text-based PDF or DOCX and try again.",
      id: "Kami tidak dapat membaca teks di file resume. Unggah PDF atau DOCX berbasis teks, lalu coba lagi.",
      ja: "レジュメファイルのテキストを読み取れませんでした。テキスト形式のPDFまたはDOCXをアップロードして再試行してください。",
    },
    genFailedAi: {
      en: "The AI couldn't produce this document. Please try again.",
      id: "AI tidak dapat membuat dokumen ini. Coba lagi.",
      ja: "AIがこの書類を生成できませんでした。再試行してください。",
    },
    genFailedPdf: {
      en: "The document was written but the PDF couldn't be rendered. Please try again.",
      id: "Dokumen sudah ditulis tetapi PDF gagal dirender. Coba lagi.",
      ja: "書類は作成されましたが、PDFを生成できませんでした。再試行してください。",
    },
    genFailedUpload: {
      en: "The document was created but couldn't be saved. Please try again.",
      id: "Dokumen berhasil dibuat tetapi gagal disimpan. Coba lagi.",
      ja: "書類は作成されましたが、保存できませんでした。再試行してください。",
    },
    genFailedTimeout: {
      en: "Generation stopped before it finished. Please try again.",
      id: "Pembuatan berhenti sebelum selesai. Coba lagi.",
      ja: "生成が完了する前に停止しました。再試行してください。",
    },
    genFailedUnknown: {
      en: "Something went wrong while generating this document. Please try again.",
      id: "Terjadi kesalahan saat membuat dokumen ini. Coba lagi.",
      ja: "この書類の生成中にエラーが発生しました。再試行してください。",
    },
    statusLoadError: {
      en: "Failed to load this document's status. Please try again.",
      id: "Gagal memuat status dokumen ini. Coba lagi.",
      ja: "この書類のステータスを読み込めませんでした。再試行してください。",
    },
    statusPollError: {
      en: "Automatic updates stopped, so this may be out of date. Check again to resume them.",
      id: "Pembaruan otomatis berhenti, jadi ini mungkin sudah usang. Periksa lagi untuk melanjutkannya.",
      ja: "自動更新が停止したため、最新でない可能性があります。再確認すると再開します。",
    },
    linkError: {
      en: "Your document is ready, but the download link couldn't be prepared.",
      id: "Dokumen kamu sudah siap, tetapi tautan unduhan gagal disiapkan.",
      ja: "書類は完成しましたが、ダウンロードリンクを準備できませんでした。",
    },
    genFailHint: {
      en: "You can try again by creating a new document.",
      id: "Coba lagi dengan membuat dokumen baru.",
      ja: "新しい書類を作成して再試行できます。",
    },
    genSuccess: {
      en: "Document generated successfully",
      id: "Dokumen berhasil dibuat",
      ja: "書類が正常に生成されました",
    },
    on: { en: "on", id: "pada", ja: "：" },
    downloadPdf: { en: "Download PDF", id: "Unduh PDF", ja: "PDFをダウンロード" },
    preparingLink: {
      en: "Preparing download link…",
      id: "Mempersiapkan tautan unduhan…",
      ja: "ダウンロードリンクを準備中…",
    },
    linkExpiry: {
      en: "Download links expire after 15 minutes. Refresh this page to get a new link.",
      id: "Tautan unduhan kedaluwarsa setelah 15 menit. Muat ulang halaman untuk mendapatkan tautan baru.",
      ja: "ダウンロードリンクは15分で失効します。新しいリンクを取得するにはページを更新してください。",
    },
    // Wizard — new rirekisho / shokumu pages
    generateRirekisho: { en: "Generate 履歴書", id: "Buat 履歴書", ja: "履歴書を生成" },
    rirekishoSub: {
      en: "We'll convert your resume into a Japanese-format 履歴書 (rirekisho) PDF.",
      id: "Kami akan mengubah resume kamu menjadi PDF 履歴書 (rirekisho) format Jepang.",
      ja: "履歴書をJapanese形式の履歴書（rirekisho）PDFに変換します。",
    },
    generateShokumu: { en: "Generate 職務経歴書", id: "Buat 職務経歴書", ja: "職務経歴書を生成" },
    shokumuSub: {
      en: "We'll convert your resume into a Japanese-format 職務経歴書 (shokumukeirekisho) PDF.",
      id: "Kami akan mengubah resume kamu menjadi PDF 職務経歴書 (shokumukeirekisho) format Jepang.",
      ja: "レジュメをJapanese形式の職務経歴書（shokumukeirekisho）PDFに変換します。",
    },
    // DocumentWizard
    wizStep1Title: { en: "Select a resume", id: "Pilih resume", ja: "レジュメを選択" },
    wizNoResumes: {
      en: "No resumes found.",
      id: "Tidak ada resume ditemukan.",
      ja: "レジュメが見つかりません。",
    },
    wizUploadFirst: {
      en: "Upload one first.",
      id: "Unggah dulu.",
      ja: "先にアップロードしてください。",
    },
    wizUploaded: { en: "Uploaded", id: "Diunggah", ja: "アップロード済み" },
    wizPrimary: { en: "Primary", id: "Utama", ja: "メイン" },
    wizNext: { en: "Next", id: "Berikut", ja: "次へ" },
    wizStep2Title: {
      en: "Job context (optional)",
      id: "Konteks pekerjaan (opsional)",
      ja: "求人コンテキスト（任意）",
    },
    wizStep2Sub: {
      en: 'To tailor the document to a specific role, open that job posting from your Jobs list and copy the Job ID shown there — or just click "Generate for this job" on the job\'s page instead. Leave this blank to generate a general-purpose document.',
      id: 'Untuk menyesuaikan dokumen dengan posisi tertentu, buka lowongan tersebut dari daftar Jobs dan salin Job ID yang ditampilkan di sana — atau langsung klik "Buat untuk lowongan ini" di halaman lowongan tersebut. Kosongkan untuk membuat dokumen umum.',
      ja: "特定の職種向けに書類を最適化するには、求人一覧からその求人を開き、表示されている求人IDをコピーしてください。または求人ページの「この求人向けに生成」をクリックしても構いません。空欄のままにすると汎用書類が生成されます。",
    },
    wizJobIdPlaceholder: {
      en: "Job posting ID (optional) — not a job title",
      id: "ID lowongan kerja (opsional) — bukan nama posisi",
      ja: "求人ID（任意）— 職種名ではありません",
    },
    wizJobIdInvalid: {
      en: "That doesn't look like a job posting ID. Find it in the URL of a job posting's page, or leave this blank.",
      id: "Itu bukan format ID lowongan. Cari ID-nya di URL halaman lowongan, atau kosongkan kolom ini.",
      ja: "求人IDの形式ではないようです。求人ページのURLで確認するか、空欄のままにしてください。",
    },
    wizOrientationLabel: {
      en: "Layout",
      id: "Tata letak",
      ja: "レイアウト",
    },
    wizOrientationPortrait: { en: "Portrait", id: "Potret", ja: "縦書き" },
    wizOrientationLandscape: { en: "Landscape", id: "Lanskap", ja: "横書き" },
    wizStep3Title: { en: "Confirm and generate", id: "Konfirmasi dan buat", ja: "確認して生成" },
    wizResumeLabel: { en: "Resume", id: "Resume", ja: "レジュメ" },
    wizJobLabel: { en: "Job context", id: "Konteks pekerjaan", ja: "求人コンテキスト" },
    wizNoJobContext: { en: "None (general-purpose)", id: "Tidak ada (umum)", ja: "なし（汎用）" },
    wizGenWait: {
      en: "Generation takes 20–60 seconds. You'll be taken to the status page where you can track progress and download the PDF when ready.",
      id: "Pembuatan membutuhkan 20–60 detik. Kamu akan dibawa ke halaman status.",
      ja: "生成には20〜60秒かかります。ステータスページでPDFをダウンロードできます。",
    },
    wizQueuing: { en: "Queuing…", id: "Mengantri…", ja: "待機中…" },
    wizStepOf: { en: "Step {n} of {t}", id: "Langkah {n} dari {t}", ja: "ステップ {n} / {t}" },
  },

  // ---------------------------------------------------------------------------
  // Culture
  // ---------------------------------------------------------------------------
  culture: {
    title: {
      en: "Japanese Workplace Culture",
      id: "Budaya Tempat Kerja Jepang",
      ja: "日本の職場文化",
    },
    sub: {
      en: "Learn workplace norms, etiquette, and key Japanese terms to succeed in a Japanese company.",
      id: "Pelajari norma tempat kerja, etiket, dan istilah Jepang untuk sukses di perusahaan Jepang.",
      ja: "日本企業で成功するための職場規範、マナー、重要な用語を学びましょう。",
    },
    topicsTab: { en: "Topics", id: "Topik", ja: "トピック" },
    glossaryTab: { en: "Glossary", id: "Glosarium", ja: "用語集" },
    allTags: { en: "All", id: "Semua", ja: "すべて" },
    noTopics: {
      en: "No articles yet. Check back soon.",
      id: "Belum ada artikel. Periksa kembali nanti.",
      ja: "まだ記事がありません。後でご確認ください。",
    },
    noGlossary: {
      en: "No glossary entries yet.",
      id: "Belum ada entri glosarium.",
      ja: "まだ用語集の項目がありません。",
    },
    searchPlaceholder: { en: "Search terms…", id: "Cari istilah…", ja: "用語を検索…" },
    searchLabel: { en: "Search glossary", id: "Cari glosarium", ja: "用語集を検索" },
    topicsLoadError: {
      en: "Failed to load culture topics.",
      id: "Gagal memuat topik budaya.",
      ja: "文化トピックの読み込みに失敗しました。",
    },
    glossaryLoadError: {
      en: "Failed to load the glossary.",
      id: "Gagal memuat glosarium.",
      ja: "用語集の読み込みに失敗しました。",
    },
    colTerm: { en: "Term", id: "Istilah", ja: "用語" },
    colReading: { en: "Reading", id: "Bacaan", ja: "読み方" },
    colDefinition: { en: "Definition (ID)", id: "Definisi (ID)", ja: "定義（ID）" },
    noMatch: {
      en: "No matching terms.",
      id: "Tidak ada istilah yang cocok.",
      ja: "一致する用語がありません。",
    },
    notFound: {
      en: "Article not found.",
      id: "Artikel tidak ditemukan.",
      ja: "記事が見つかりません。",
    },
    backToCulture: { en: "← Back to Culture", id: "← Kembali ke Budaya", ja: "← 文化へ" },
  },

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  settings: {
    title: { en: "Settings", id: "Pengaturan", ja: "設定" },
    sub: {
      en: "Your profile, your 履歴書 details and your account.",
      id: "Profil, detail 履歴書, dan akunmu.",
      ja: "プロフィール、履歴書の詳細、アカウントの設定。",
    },
    profile: { en: "Profile", id: "Profil", ja: "プロフィール" },
    nationality: { en: "Nationality", id: "Kewarganegaraan", ja: "国籍" },
    yearsRange: {
      en: "Enter a number from 0 to 80",
      id: "Masukkan angka 0 sampai 80",
      ja: "0〜80の数字を入力してください",
    },
    jpLevel: {
      en: "Japanese level (JLPT)",
      id: "Tingkat bahasa Jepang (JLPT)",
      ja: "日本語レベル（JLPT）",
    },
    jpNotTested: {
      en: "Not tested / below N5",
      id: "Belum diuji / di bawah N5",
      ja: "未受験 / N5以下",
    },
    visaStatus: { en: "Current visa status", id: "Status visa saat ini", ja: "現在のビザ状況" },
    visaNone: {
      en: "No visa / not yet applied",
      id: "Belum ada visa / belum melamar",
      ja: "ビザなし / 未申請",
    },
    visaPending: { en: "Application pending", id: "Sedang diproses", ja: "申請中" },
    visaHeld: { en: "Currently held", id: "Sudah dimiliki", ja: "取得済み" },
    yearsExp: { en: "Years of work experience", id: "Tahun pengalaman kerja", ja: "職務経験年数" },
    targetRoles: { en: "Target roles", id: "Posisi yang diinginkan", ja: "希望職種" },
    targetIndustries: { en: "Target industries", id: "Industri target", ja: "希望業界" },
    rirekishoReady: {
      en: "Your 履歴書 has everything it needs",
      id: "履歴書-mu sudah lengkap",
      ja: "履歴書に必要な項目はすべて入力済みです",
    },
    fullName: { en: "Full name", id: "Nama lengkap", ja: "氏名" },
    nameKana: { en: "Name (furigana)", id: "Nama (furigana)", ja: "ふりがな" },
    dateOfBirth: { en: "Date of birth", id: "Tanggal lahir", ja: "生年月日" },
    gender: { en: "Gender", id: "Jenis kelamin", ja: "性別" },
    genderSelect: { en: "Select…", id: "Pilih…", ja: "選択してください" },
    genderMale: { en: "Male", id: "Laki-laki", ja: "男性" },
    genderFemale: { en: "Female", id: "Perempuan", ja: "女性" },
    phone: { en: "Phone number", id: "Nomor telepon", ja: "電話番号" },
    address: { en: "Mailing address", id: "Alamat surat", ja: "住所" },
    visaExpiration: {
      en: "Residence card expiration",
      id: "Masa berlaku kartu izin tinggal",
      ja: "在留カード有効期限",
    },
    visaCategory: { en: "Visa category", id: "Kategori visa", ja: "ビザの種類" },
    photo: { en: "Photo", id: "Foto", ja: "写真" },
    photoHint: {
      en: "Saves as soon as you upload it.",
      id: "Tersimpan begitu diunggah.",
      ja: "アップロードするとすぐに保存されます。",
    },
    photoNone: { en: "No photo", id: "Belum ada foto", ja: "写真なし" },
    photoTypeHint: {
      en: "JPEG or PNG · max {n} MB",
      id: "JPEG atau PNG · maks {n} MB",
      ja: "JPEGまたはPNG · 最大{n}MB",
    },
    photoUpload: { en: "Upload photo", id: "Unggah foto", ja: "写真をアップロード" },
    photoUploading: { en: "Uploading…", id: "Mengunggah…", ja: "アップロード中…" },
    hobbies: { en: "Hobbies", id: "Hobi", ja: "趣味" },
    specialSkills: { en: "Special skills", id: "Keahlian khusus", ja: "特技" },
    commuteTime: { en: "Commute time", id: "Waktu perjalanan", ja: "通勤時間" },
    dependents: {
      en: "Dependents",
      id: "Tanggungan",
      ja: "扶養家族",
    },
    personalRequests: {
      en: "Requests to employer",
      id: "Permintaan kepada perusahaan",
      ja: "本人希望記入欄",
    },
    personalRequestsHint: {
      en: "The standard phrase: “I will follow your company's rules.” Change it only for a specific request.",
      id: "Kalimat standar: “Saya akan mengikuti peraturan perusahaan.” Ubah hanya jika ada permintaan khusus.",
      ja: "定型文です。特別な希望がある場合のみ変更してください。",
    },
    deleteAccount: { en: "Delete account", id: "Hapus akun", ja: "アカウント削除" },
    deleteDesc: {
      en: "Permanently delete your account and all associated data — resumes, documents, job postings, interview sessions, and visa consultations. This action cannot be undone.",
      id: "Hapus permanen akun dan semua data terkait — resume, dokumen, lowongan kerja, sesi wawancara, dan konsultasi visa. Tindakan ini tidak dapat dibatalkan.",
      ja: "アカウントと関連するすべてのデータ（レジュメ・書類・求人・面接・ビザ相談）を完全に削除します。この操作は取り消せません。",
    },
    deleteBtn: { en: "Delete my account", id: "Hapus akun saya", ja: "アカウントを削除する" },
    confirmPhrase: { en: "delete my account", id: "hapus akun saya", ja: "アカウントを削除" },
    typeToConfirm: { en: "Type", id: "Ketik", ja: "以下を入力してください：" },
    toConfirm: { en: "to confirm.", id: "untuk konfirmasi.", ja: "" },
    confirmDeletion: { en: "Confirm deletion", id: "Konfirmasi penghapusan", ja: "削除を確認" },
    deleting: { en: "Deleting…", id: "Menghapus…", ja: "削除中…" },
    sectionVisa: { en: "Visa & residence", id: "Visa & izin tinggal", ja: "ビザ・在留" },
    sectionExtras: { en: "履歴書 extras", id: "Tambahan 履歴書", ja: "履歴書の追加項目" },
    sectionCareer: { en: "Career", id: "Karier", ja: "キャリア" },
    sectionAccount: { en: "Account", id: "Akun", ja: "アカウント" },
    sectionsNav: { en: "Settings sections", id: "Bagian pengaturan", ja: "設定のセクション" },
    profileDesc: {
      en: "Printed at the top of your 履歴書.",
      id: "Dicetak di bagian atas 履歴書-mu.",
      ja: "履歴書の上部に記載されます。",
    },
    visaDesc: {
      en: "Category and expiry are needed on your 履歴書 once you hold a visa.",
      id: "Kategori dan masa berlaku diperlukan di 履歴書-mu setelah kamu memiliki visa.",
      ja: "ビザを取得済みの場合、在留資格と在留期限が履歴書に必要です。",
    },
    extrasDesc: {
      en: "All optional. Hobbies and skills fill the 特技・趣味 box (left empty if blank). Commute time and dependents print only on the landscape 履歴書, and only when switched on.",
      id: "Semua opsional. Hobi dan keahlian mengisi kotak 特技・趣味 (kosong jika tidak diisi). Waktu tempuh dan tanggungan hanya dicetak di 履歴書 lanskap, dan hanya jika diaktifkan.",
      ja: "すべて任意です。趣味と特技は「特技・趣味」欄に記載されます（未入力なら空欄）。通勤時間と扶養家族は、オンにした場合のみ横向きの履歴書に記載されます。",
    },
    careerDesc: {
      en: "Optional. Used to tailor your documents and job matches.",
      id: "Opsional. Dipakai untuk menyesuaikan dokumen dan pencocokan lowonganmu.",
      ja: "任意。書類や求人マッチングの調整に使います。",
    },
    optional: { en: "Optional", id: "Opsional", ja: "任意" },
    email: { en: "Email", id: "Email", ja: "メールアドレス" },
    emailHint: {
      en: "From your sign-in. Change it in your account menu.",
      id: "Dari akun masukmu. Ubah lewat menu akun.",
      ja: "ログイン情報のものです。アカウントメニューから変更できます。",
    },
    showCommute: {
      en: "Show commute time (通勤時間)",
      id: "Tampilkan waktu tempuh (通勤時間)",
      ja: "通勤時間を記載する",
    },
    showDependents: {
      en: "Show dependents (扶養家族)",
      id: "Tampilkan tanggungan (扶養家族)",
      ja: "扶養家族を記載する",
    },
    commuteExample: { en: "For example 約45分", id: "Contoh: 約45分", ja: "例：約45分" },
    dependentsExample: {
      en: "For example 配偶者1名",
      id: "Contoh: 配偶者1名",
      ja: "例：配偶者1名",
    },
    commuteOff: {
      en: "Off: no 通勤時間 box on your landscape 履歴書.",
      id: "Nonaktif: tidak ada kotak 通勤時間 di 履歴書 lanskap.",
      ja: "オフ：横向きの履歴書に通勤時間欄は記載されません。",
    },
    dependentsOff: {
      en: "Off: no 扶養家族 box on your landscape 履歴書.",
      id: "Nonaktif: tidak ada kotak 扶養家族 di 履歴書 lanskap.",
      ja: "オフ：横向きの履歴書に扶養家族欄は記載されません。",
    },
    appLanguage: { en: "App language", id: "Bahasa aplikasi", ja: "表示言語" },
    appLanguageHint: {
      en: "Changes the app straight away; not part of Save.",
      id: "Langsung mengubah aplikasi; tidak termasuk Simpan.",
      ja: "すぐにアプリに反映されます（保存は不要）。",
    },
    addRole: { en: "Add a role…", id: "Tambah posisi…", ja: "職種を追加…" },
    addIndustry: { en: "Add an industry…", id: "Tambah industri…", ja: "業界を追加…" },
    removeTag: { en: "Remove {tag}", id: "Hapus {tag}", ja: "{tag}を削除" },
    rirekishoNeedsOne: {
      en: "Your 履歴書 needs 1 more detail:",
      id: "履歴書-mu masih perlu 1 data lagi:",
      ja: "履歴書にあと1項目必要です：",
    },
    rirekishoNeedsMany: {
      en: "Your 履歴書 needs {n} more details:",
      id: "履歴書-mu masih perlu {n} data lagi:",
      ja: "履歴書にあと{n}項目必要です：",
    },
    unsavedOne: {
      en: "1 unsaved change",
      id: "1 perubahan belum disimpan",
      ja: "未保存の変更が1件あります",
    },
    unsavedMany: {
      en: "{n} unsaved changes",
      id: "{n} perubahan belum disimpan",
      ja: "未保存の変更が{n}件あります",
    },
    discard: { en: "Discard", id: "Buang", ja: "破棄" },
    leaveTitle: {
      en: "Discard unsaved changes?",
      id: "Buang perubahan yang belum disimpan?",
      ja: "未保存の変更を破棄しますか？",
    },
    keepEditing: { en: "Keep editing", id: "Lanjut mengedit", ja: "編集を続ける" },
  },

  // ---------------------------------------------------------------------------
  // AI quota meter — fragments, composed with numbers in ai-quota-meter.tsx
  // ---------------------------------------------------------------------------
  aiQuota: {
    // Word separator. Japanese sets no space between clauses or between a
    // number and its counter, so composed strings join with "" there.
    sep: { en: " ", id: " ", ja: "" },
    meterTitle: { en: "AI calls", id: "Panggilan AI", ja: "AI利用" },
    left: { en: "AI calls left", id: "panggilan AI tersisa", ja: "回のAI利用が可能" },
    exhausted: {
      en: "AI limit reached.",
      id: "Batas AI tercapai.",
      ja: "AI利用上限に達しました。",
    },
    resetsIn: { en: "Resets in", id: "Tersedia lagi dalam", ja: "回復まで" },
    soon: { en: "under a minute", id: "kurang dari semenit", ja: "まもなく" },
    hourUnit: { en: "h", id: "j", ja: "時間" },
    minuteUnit: { en: "m", id: "m", ja: "分" },
    sharedPool: {
      en: "Shared demo limit",
      id: "Batas demo bersama",
      ja: "デモ全体の上限",
    },
    yourQuota: {
      en: "Your 24-hour limit",
      id: "Batas 24 jam kamu",
      ja: "あなたの24時間の上限",
    },
  },

  // ---------------------------------------------------------------------------
  // Journey steps (lib/journey.ts): the board label, then the next-step card's
  // title, reason and button. The uploaded CV is "レジュメ" in Japanese so it
  // doesn't collide with the 履歴書 document on the same board.
  // ---------------------------------------------------------------------------
  journey: {
    profile: {
      en: "Complete your profile",
      id: "Lengkapi profilmu",
      ja: "プロフィールを完成させる",
    },
    profileTitle: {
      en: "Complete your profile",
      id: "Lengkapi profilmu",
      ja: "プロフィールを完成させましょう",
    },
    profileWhy: {
      en: "Your 履歴書 is filled in from your profile, so missing details make a weaker document.",
      id: "履歴書 diisi dari profilmu, jadi data yang kurang membuat dokumennya lebih lemah.",
      ja: "履歴書はプロフィールから作成されます。不足があると書類の完成度が下がります。",
    },
    profileCta: { en: "Open settings", id: "Buka pengaturan", ja: "設定を開く" },

    resumeUploaded: { en: "Upload a resume", id: "Unggah resume", ja: "レジュメをアップロード" },
    resumeUploadedTitle: {
      en: "Upload your resume",
      id: "Unggah resumemu",
      ja: "レジュメをアップロードしましょう",
    },
    resumeUploadedWhy: {
      en: "The analysis, your documents and job matching all start from it.",
      id: "Analisis, dokumen, dan pencocokan lowongan semuanya dimulai dari sini.",
      ja: "分析・書類作成・求人マッチングはすべてここから始まります。",
    },
    resumeUploadedCta: { en: "Upload resume", id: "Unggah resume", ja: "アップロード" },

    resumeAnalysed: {
      en: "Get your resume analysed",
      id: "Analisis resumemu",
      ja: "レジュメを分析する",
    },
    resumeAnalysedTitle: {
      en: "Get your resume analysed",
      id: "Minta analisis resumemu",
      ja: "レジュメを分析しましょう",
    },
    resumeAnalysedWhy: {
      en: "See how it reads to Japanese employers, and what to strengthen before you apply.",
      id: "Lihat bagaimana perusahaan Jepang membacanya, dan apa yang perlu diperkuat sebelum melamar.",
      ja: "日本の採用担当者にどう見えるか、応募前に何を強化すべきかがわかります。",
    },
    resumeAnalysedCta: { en: "Analyse", id: "Analisis", ja: "分析する" },

    rirekisho: { en: "Create a 履歴書", id: "Buat 履歴書", ja: "履歴書を作成" },
    rirekishoTitle: {
      en: "Create your 履歴書",
      id: "Buat 履歴書-mu",
      ja: "履歴書を作成しましょう",
    },
    rirekishoWhy: {
      en: "The standard Japanese application form. Nearly every application asks for one.",
      id: "Formulir lamaran standar Jepang. Hampir setiap lamaran memintanya.",
      ja: "日本の標準的な応募書類です。ほぼすべての応募で求められます。",
    },
    rirekishoCta: { en: "Create", id: "Buat", ja: "作成する" },

    shokumu: { en: "Create a 職務経歴書", id: "Buat 職務経歴書", ja: "職務経歴書を作成" },
    shokumuTitle: {
      en: "Create your 職務経歴書",
      id: "Buat 職務経歴書-mu",
      ja: "職務経歴書を作成しましょう",
    },
    shokumuWhy: {
      en: "Most employers ask for it alongside the 履歴書, to see your work history in detail.",
      id: "Kebanyakan perusahaan memintanya bersama 履歴書 untuk melihat riwayat kerjamu secara rinci.",
      ja: "多くの企業が履歴書とあわせて求め、職歴を詳しく確認します。",
    },
    shokumuCta: { en: "Create", id: "Buat", ja: "作成する" },

    application: { en: "Track an application", id: "Lacak lamaran", ja: "応募を記録する" },
    applicationTitle: {
      en: "Track your first application",
      id: "Lacak lamaran pertamamu",
      ja: "最初の応募を記録しましょう",
    },
    applicationWhy: {
      en: "Save a job you're applying for, so its status and notes stay in one place.",
      id: "Simpan lowongan yang kamu lamar agar status dan catatannya ada di satu tempat.",
      ja: "応募する求人を保存すると、状況やメモを一か所で管理できます。",
    },
    applicationCta: { en: "Browse jobs", id: "Lihat lowongan", ja: "求人を見る" },

    interview: { en: "Practise an interview", id: "Latihan wawancara", ja: "面接を練習する" },
    interviewTitle: {
      en: "Practise an interview",
      id: "Latihan wawancara",
      ja: "面接を練習しましょう",
    },
    interviewWhy: {
      en: "A mock interview with feedback, before the real one.",
      id: "Simulasi wawancara dengan masukan, sebelum yang sebenarnya.",
      ja: "本番の前に、フィードバック付きの模擬面接で練習できます。",
    },
    interviewCta: { en: "Start practice", id: "Mulai latihan", ja: "練習を始める" },

    visa: { en: "Check your visa options", id: "Cek opsi visamu", ja: "ビザの選択肢を確認" },
    visaTitle: {
      en: "Check your visa options",
      id: "Cek opsi visamu",
      ja: "ビザの選択肢を確認しましょう",
    },
    visaWhy: {
      en: "Find which visa fits your background, and what you'll need to apply for it.",
      id: "Temukan visa yang cocok dengan latar belakangmu, dan apa yang dibutuhkan untuk mengajukannya.",
      ja: "経歴に合うビザと、申請に必要なものがわかります。",
    },
    visaCta: { en: "Check visa", id: "Cek visa", ja: "確認する" },
  },

  // ---------------------------------------------------------------------------
  // Home (app/dashboard/page.tsx)
  // ---------------------------------------------------------------------------
  home: {
    greeting: { en: "Welcome back", id: "Selamat datang kembali", ja: "おかえりなさい" },
    greetingNamed: {
      en: "Welcome back, {name}",
      id: "Selamat datang kembali, {name}",
      ja: "おかえりなさい、{name}さん",
    },
    progress: {
      en: "{done} of {total} steps · your move to Japan",
      id: "{done} dari {total} langkah · perjalananmu ke Jepang",
      ja: "全{total}ステップ中{done}完了 · 日本への道のり",
    },
    progressLabel: { en: "Journey progress", id: "Progres perjalanan", ja: "進捗状況" },
    nextStep: { en: "Next step", id: "Langkah berikutnya", ja: "次のステップ" },
    // Read after a finished step's struck-through label, which a screen reader can't see.
    stepDone: { en: "(done)", id: "(selesai)", ja: "（完了）" },
    couldntCheck: { en: "Couldn't check", id: "Tidak dapat memeriksa", ja: "確認できませんでした" },
    allDoneTitle: {
      en: "You've completed every step",
      id: "Kamu sudah menyelesaikan semua langkah",
      ja: "すべてのステップを完了しました",
    },
    allDoneBody: {
      en: "Keep preparing with the culture guides: workplace customs, keigo and what interviews look for.",
      id: "Lanjutkan persiapan dengan panduan budaya: kebiasaan kerja, keigo, dan apa yang dicari saat wawancara.",
      ja: "文化ガイドで準備を続けましょう。職場の習慣、敬語、面接で見られるポイントを解説しています。",
    },
    allDoneCta: {
      en: "Read the culture guides",
      id: "Baca panduan budaya",
      ja: "文化ガイドを読む",
    },
    activityTitle: { en: "Recent activity", id: "Aktivitas terbaru", ja: "最近のアクティビティ" },
    activityResumeUploaded: {
      en: "Resume uploaded",
      id: "Resume diunggah",
      ja: "レジュメをアップロード",
    },
    activityResumeAnalysed: {
      en: "Resume analysed",
      id: "Resume dianalisis",
      ja: "レジュメを分析",
    },
    activityRirekisho: { en: "履歴書 generated", id: "履歴書 dibuat", ja: "履歴書を作成" },
    activityShokumu: {
      en: "職務経歴書 generated",
      id: "職務経歴書 dibuat",
      ja: "職務経歴書を作成",
    },
    activityApplication: { en: "Application added", id: "Lamaran ditambahkan", ja: "応募を追加" },
    activityInterview: {
      en: "Interview practice completed",
      id: "Latihan wawancara selesai",
      ja: "面接練習を完了",
    },
    activityVisa: { en: "Visa options checked", id: "Opsi visa dicek", ja: "ビザを確認" },
  },

  // ---------------------------------------------------------------------------
  // Legacy dashboard section (kept for backward compat)
  // ---------------------------------------------------------------------------
  dashboard: {
    resumesTitle: { en: "Resumes", id: "Resume", ja: "レジュメ" },
    resumesSub: {
      en: "Upload your resume to get started. We'll analyse it for the Japanese job market.",
      id: "Unggah resumemu untuk memulai. Kami akan menganalisisnya untuk pasar kerja Jepang.",
      ja: "レジュメをアップロードして始めましょう。日本の就職市場向けに分析します。",
    },
    uploadBtn: { en: "Upload resume", id: "Unggah resume", ja: "レジュメをアップロード" },
    noResumes: { en: "No resumes yet.", id: "Belum ada resume.", ja: "まだレジュメがありません。" },
  },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(section: keyof typeof translations, key: string, lang: Language): string {
  const sec = translations[section] as Record<string, Record<Language, string>>;
  return sec[key]?.[lang] ?? sec[key]?.["en"] ?? key;
}
