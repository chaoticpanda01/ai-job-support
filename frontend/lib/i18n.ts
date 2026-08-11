export type Language = "en" | "id" | "ja";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "ja", label: "JP" },
];

export const translations = {
  // ---------------------------------------------------------------------------
  // Navbar
  // ---------------------------------------------------------------------------
  nav: {
    resumes: { en: "Resumes", id: "Resume", ja: "履歴書" },
    documents: { en: "Documents", id: "Dokumen", ja: "書類" },
    jobs: { en: "Jobs", id: "Lowongan", ja: "求人" },
    interview: { en: "Interview", id: "Wawancara", ja: "面接" },
    visa: { en: "Visa", id: "Visa", ja: "ビザ" },
    culture: { en: "Culture", id: "Budaya", ja: "文化" },
    settings: { en: "Settings", id: "Pengaturan", ja: "設定" },
    signIn: { en: "Sign in", id: "Masuk", ja: "ログイン" },
    getStarted: { en: "Get started free", id: "Mulai gratis", ja: "無料で始める" },
    openMenu: { en: "Open menu", id: "Buka menu", ja: "メニューを開く" },
    closeMenu: { en: "Close menu", id: "Tutup menu", ja: "メニューを閉じる" },
    goToDashboard: { en: "Go to Dashboard", id: "Ke Dasbor", ja: "ダッシュボードへ" },
  },

  // ---------------------------------------------------------------------------
  // Landing page
  // ---------------------------------------------------------------------------
  landing: {
    badge: {
      en: "For Indonesian professionals pursuing careers in Japan",
      id: "Untuk profesional Indonesia yang mengejar karier di Jepang",
      ja: "日本でキャリアを目指すインドネシア人向け",
    },
    heroTitle1: {
      en: "Your AI-powered guide to",
      id: "Panduan bertenaga AI untuk",
      ja: "日本で働くための",
    },
    heroTitle2: { en: "working in Japan", id: "bekerja di Jepang", ja: "AIガイド" },
    heroSub: {
      en: "Japan Job Support helps Indonesian professionals navigate the Japanese job market — from resume translation to visa guidance — all powered by AI and explained in Bahasa Indonesia.",
      id: "Japan Job Support membantu profesional Indonesia menavigasi pasar kerja Jepang — dari terjemahan resume hingga panduan visa — semua didukung AI dan dijelaskan dalam Bahasa Indonesia.",
      ja: "Japan Job Supportは、インドネシア人プロフェッショナルが日本の就職市場をナビゲートするためのAIプラットフォームです。",
    },
    ctaPrimary: { en: "Get started for free", id: "Mulai gratis", ja: "無料で始める" },
    ctaSecondary: {
      en: "Browse culture guide",
      id: "Jelajahi panduan budaya",
      ja: "文化ガイドを見る",
    },
    featuresTitle: {
      en: "Everything you need to land a job in Japan",
      id: "Semua yang kamu butuhkan untuk mendapat pekerjaan di Jepang",
      ja: "日本での就職に必要なすべて",
    },
    howTitle: { en: "How it works", id: "Cara kerjanya", ja: "使い方" },
    ctaTitle: {
      en: "Ready to start your Japan career journey?",
      id: "Siap memulai perjalanan karier Jepang kamu?",
      ja: "日本でのキャリアを始める準備はできましたか？",
    },
    ctaSub: {
      en: "Create a free account and upload your first resume in minutes.",
      id: "Buat akun gratis dan unggah resume pertamamu dalam hitungan menit.",
      ja: "無料アカウントを作成して、数分で最初の履歴書をアップロードしましょう。",
    },
    ctaBtn: { en: "Create free account", id: "Buat akun gratis", ja: "無料アカウント作成" },
    footer: {
      en: "Built for Indonesian professionals.",
      id: "Dibuat untuk profesional Indonesia.",
      ja: "インドネシア人プロフェッショナルのために。",
    },
    step1Title: { en: "Create an account", id: "Buat akun", ja: "アカウントを作成" },
    step1Desc: {
      en: "Sign up for free in under a minute.",
      id: "Daftar gratis dalam kurang dari satu menit.",
      ja: "1分以内に無料登録できます。",
    },
    step2Title: { en: "Upload your resume", id: "Unggah resumemu", ja: "履歴書をアップロード" },
    step2Desc: {
      en: "Upload your existing English resume in PDF or DOCX format.",
      id: "Unggah resume bahasa Inggrismu dalam format PDF atau DOCX.",
      ja: "既存の英語履歴書をPDFまたはDOCX形式でアップロードします。",
    },
    step3Title: { en: "Let AI do the work", id: "Biarkan AI bekerja", ja: "AIに任せる" },
    step3Desc: {
      en: "Get your Japanese documents, scores, and visa roadmap instantly.",
      id: "Dapatkan dokumen Jepang, skor, dan peta jalan visa secara instan.",
      ja: "日本語書類、スコア、ビザロードマップを即座に取得します。",
    },
  },

  // ---------------------------------------------------------------------------
  // Features
  // ---------------------------------------------------------------------------
  features: {
    resume: { en: "Resume Analysis", id: "Analisis Resume", ja: "履歴書分析" },
    resumeDesc: {
      en: "Upload your English resume and get an instant Japan-market score with actionable feedback.",
      id: "Unggah resume bahasa Inggrismu dan dapatkan skor pasar Jepang instan dengan masukan yang dapat ditindaklanjuti.",
      ja: "英語の履歴書をアップロードして、日本市場スコアとフィードバックを即座に取得します。",
    },
    docs: {
      en: "Japanese Document Generation",
      id: "Pembuatan Dokumen Jepang",
      ja: "日本語書類生成",
    },
    docsDesc: {
      en: "Automatically generate a 履歴書 and 職務経歴書 tailored for Japanese employers.",
      id: "Buat 履歴書 dan 職務経歴書 secara otomatis yang disesuaikan untuk perusahaan Jepang.",
      ja: "日本の雇用主向けに最適化された履歴書と職務経歴書を自動生成します。",
    },
    jobs: { en: "Job Posting Translation", id: "Terjemahan Lowongan Kerja", ja: "求人翻訳" },
    jobsDesc: {
      en: "Paste any Japanese job posting and get a full Indonesian translation with a match score.",
      id: "Tempelkan lowongan kerja Jepang apa pun dan dapatkan terjemahan Indonesia lengkap dengan skor kecocokan.",
      ja: "日本語の求人をペーストして、インドネシア語の完全翻訳とマッチスコアを取得します。",
    },
    interview: { en: "Interview Preparation", id: "Persiapan Wawancara", ja: "面接準備" },
    interviewDesc: {
      en: "Practice with AI-generated interview questions based on your resume and target role.",
      id: "Berlatih dengan pertanyaan wawancara yang dihasilkan AI berdasarkan resume dan peran targetmu.",
      ja: "履歴書と目標職種に基づいたAI生成の面接質問で練習します。",
    },
    visa: { en: "Visa Guidance", id: "Panduan Visa", ja: "ビザガイダンス" },
    visaDesc: {
      en: "Get a personalised visa roadmap and step-by-step checklist based on your profile.",
      id: "Dapatkan peta jalan visa yang dipersonalisasi dan daftar periksa langkah demi langkah.",
      ja: "あなたのプロフィールに基づいた個別のビザロードマップとチェックリストを取得します。",
    },
    culture: { en: "Culture & Glossary", id: "Budaya & Glosarium", ja: "文化・用語集" },
    cultureDesc: {
      en: "Learn Japanese workplace culture, business etiquette, and key terms in Indonesian.",
      id: "Pelajari budaya tempat kerja Jepang, etiket bisnis, dan istilah kunci dalam Bahasa Indonesia.",
      ja: "日本の職場文化、ビジネスマナー、重要な用語をインドネシア語で学びます。",
    },
  },

  // ---------------------------------------------------------------------------
  // Shared / common
  // ---------------------------------------------------------------------------
  common: {
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
      ja: "Japan Job SupportはAIを使用して履歴書を分析し、キャリア書類を生成します。続行前に以下をご確認ください。",
    },
    s1Agree: {
      en: "By continuing, you agree that Japan Job Support may:",
      id: "Dengan melanjutkan, kamu setuju bahwa Japan Job Support dapat:",
      ja: "続行することで、Japan Job Supportが以下を行うことに同意します：",
    },
    s1P1: {
      en: "Process the content of your uploaded resume using the Gemini AI API to generate analysis, career documents, and job-match scores.",
      id: "Memproses konten resume yang diunggah menggunakan Gemini AI API untuk menghasilkan analisis, dokumen karier, dan skor kecocokan pekerjaan.",
      ja: "アップロードされた履歴書をGemini AI APIで処理し、分析・キャリア書類・マッチスコアを生成します。",
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
      ja: "上記の説明に従ったAIによる履歴書データの処理に同意します。",
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
      ja: "日本市場向けに履歴書のスコアを評価します。",
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
  },

  // ---------------------------------------------------------------------------
  // Resumes
  // ---------------------------------------------------------------------------
  resumes: {
    title: { en: "Resumes", id: "Resume", ja: "履歴書" },
    sub: {
      en: "Upload your resume to get started. We'll analyse it for the Japanese job market.",
      id: "Unggah resumemu untuk memulai. Kami akan menganalisisnya untuk pasar kerja Jepang.",
      ja: "履歴書をアップロードして始めましょう。日本の就職市場向けに分析します。",
    },
    yourResumes: { en: "Your resumes", id: "Resume kamu", ja: "あなたの履歴書" },
    noResumes: {
      en: "No resumes yet. Upload one above.",
      id: "Belum ada resume. Unggah di atas.",
      ja: "まだ履歴書がありません。上でアップロードしてください。",
    },
    loadError: {
      en: "Failed to load resumes. Please refresh.",
      id: "Gagal memuat resume. Coba muat ulang.",
      ja: "履歴書の読み込みに失敗しました。更新してください。",
    },
    setPrimary: { en: "Set primary", id: "Jadikan utama", ja: "メインに設定" },
    confirmDelete: {
      en: "Delete this resume?",
      id: "Hapus resume ini?",
      ja: "この履歴書を削除しますか？",
    },
    // Uploader
    dragDrop: {
      en: "Drag & drop your resume",
      id: "Seret & lepas resume kamu",
      ja: "履歴書をドラッグ＆ドロップ",
    },
    dropHere: {
      en: "Drop your resume here",
      id: "Lepaskan resume kamu di sini",
      ja: "ここに履歴書をドロップ",
    },
    fileTypeHint: {
      en: "PDF or DOCX · max 10 MB",
      id: "PDF atau DOCX · maks 10 MB",
      ja: "PDFまたはDOCX · 最大10MB",
    },
    chooseFile: { en: "Choose file", id: "Pilih file", ja: "ファイルを選択" },
    uploading: { en: "Uploading…", id: "Mengunggah…", ja: "アップロード中…" },
    invalidFile: { en: "Invalid file", id: "File tidak valid", ja: "無効なファイルです" },
    uploadFailed: {
      en: "Upload failed. Please try again.",
      id: "Unggah gagal. Coba lagi.",
      ja: "アップロードに失敗しました。再試行してください。",
    },
    uploadSuccess: {
      en: "Resume uploaded successfully.",
      id: "Resume berhasil diunggah.",
      ja: "履歴書が正常にアップロードされました。",
    },
    // Detail
    backToResumes: { en: "← Back to resumes", id: "← Kembali ke resume", ja: "← 履歴書一覧へ" },
    notFound: {
      en: "Resume not found.",
      id: "Resume tidak ditemukan.",
      ja: "履歴書が見つかりません。",
    },
    uploaded: { en: "Uploaded", id: "Diunggah", ja: "アップロード" },
    aiAnalysis: { en: "AI Analysis", id: "Analisis AI", ja: "AI 分析" },
    analyseBtn: { en: "Analyse resume", id: "Analisis resume", ja: "履歴書を分析" },
    queueing: { en: "Queuing…", id: "Mengantri…", ja: "待機中…" },
    analysing: {
      en: "Analysing your resume… this may take up to 30 seconds.",
      id: "Menganalisis resume kamu… ini mungkin membutuhkan waktu hingga 30 detik.",
      ja: "履歴書を分析中…最大30秒かかる場合があります。",
    },
    queued: {
      en: "Analysis queued — results will appear here shortly.",
      id: "Analisis sudah diantri — hasil akan muncul sebentar lagi.",
      ja: "分析がキューに入りました — まもなく結果が表示されます。",
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
    uploadBtn: { en: "Upload resume", id: "Unggah resume", ja: "履歴書をアップロード" },
  },

  // ---------------------------------------------------------------------------
  // Jobs
  // ---------------------------------------------------------------------------
  jobs: {
    title: { en: "Job Postings", id: "Lowongan Kerja", ja: "求人一覧" },
    sub: {
      en: "Translate Japanese job postings and score them against your resume.",
      id: "Terjemahkan lowongan kerja Jepang dan cocokkan dengan resume kamu.",
      ja: "日本語の求人を翻訳し、履歴書とマッチングします。",
    },
    tracker: { en: "Tracker", id: "Pelacak", ja: "管理" },
    translateBtn: { en: "+ Translate posting", id: "+ Terjemahkan lowongan", ja: "+ 求人を翻訳" },
    searchPlaceholder: {
      en: "Search job titles or summaries…",
      id: "Cari judul atau ringkasan lowongan…",
      ja: "求人タイトルや概要を検索…",
    },
    allScores: { en: "All scores", id: "Semua skor", ja: "すべてのスコア" },
    noPostings: {
      en: "No job postings found.",
      id: "Tidak ada lowongan kerja.",
      ja: "求人が見つかりません。",
    },
    translateLink: { en: "Translate a posting", id: "Terjemahkan lowongan", ja: "求人を翻訳する" },
    toGetStarted: { en: "to get started.", id: "untuk memulai.", ja: "して始めましょう。" },
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
      en: "Used to detect duplicate translations. We do not fetch the URL.",
      id: "Digunakan untuk mendeteksi terjemahan duplikat. Kami tidak mengambil konten URL.",
      ja: "重複翻訳の検出に使用します。URLのコンテンツは取得しません。",
    },
    jobText: { en: "Job posting text", id: "Teks lowongan kerja", ja: "求人テキスト" },
    jobTextPlaceholder: {
      en: "Paste the full Japanese job posting text here…",
      id: "Tempel teks lengkap lowongan kerja Jepang di sini…",
      ja: "日本語求人の全文をここに貼り付けてください…",
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
    uploadResumeTo: { en: "Upload a resume", id: "Unggah resume", ja: "履歴書をアップロード" },
    toScoreJob: {
      en: "to score this job.",
      id: "untuk menilai pekerjaan ini.",
      ja: "してこの求人をスコアリングしましょう。",
    },
    selectResume: { en: "Select a resume…", id: "Pilih resume…", ja: "履歴書を選択…" },
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
    typeCulture: { en: "Culture Fit", id: "Kesesuaian Budaya", ja: "文化適合" },
    typeCultureDesc: {
      en: "Japanese workplace culture: teamwork, 報連相, adaptability, and values.",
      id: "Budaya tempat kerja Jepang: kerja tim, 報連相, kemampuan adaptasi, dan nilai-nilai.",
      ja: "日本の職場文化：チームワーク、報連相、適応力、価値観。",
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
    sessionTitle: { en: "Interview Session", id: "Sesi Wawancara", ja: "面接セッション" },
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
    title: { en: "Visa Guidance", id: "Panduan Visa", ja: "ビザガイダンス" },
    sub: {
      en: "Personalised Japanese work visa roadmap based on your profile.",
      id: "Peta jalan visa kerja Jepang yang dipersonalisasi berdasarkan profilmu.",
      ja: "プロフィールに基づいた個別の日本就労ビザロードマップ。",
    },
    generateBtn: {
      en: "Generate new roadmap",
      id: "Buat peta jalan baru",
      ja: "新しいロードマップを生成",
    },
    generating: { en: "Generating…", id: "Membuat…", ja: "生成中…" },
    noRoadmap: {
      en: "No visa roadmap yet.",
      id: "Belum ada peta jalan visa.",
      ja: "ビザロードマップはまだありません。",
    },
    noRoadmapSub: {
      en: "Click Generate new roadmap to get personalised guidance.",
      id: "Klik Buat peta jalan baru untuk mendapatkan panduan personal.",
      ja: "「新しいロードマップを生成」をクリックして個別ガイダンスを取得してください。",
    },
    generateFail: {
      en: "Failed to generate roadmap. Please try again.",
      id: "Gagal membuat peta jalan. Coba lagi.",
      ja: "ロードマップの生成に失敗しました。再試行してください。",
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
    backToVisa: {
      en: "← Back to Visa Guidance",
      id: "← Kembali ke Panduan Visa",
      ja: "← ビザガイダンスへ",
    },
    consultNotFound: {
      en: "Consultation not found.",
      id: "Konsultasi tidak ditemukan.",
      ja: "コンサルテーションが見つかりません。",
    },
  },

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------
  documents: {
    title: { en: "Documents", id: "Dokumen", ja: "書類" },
    sub: {
      en: "Generate Japanese-format career documents from your resume.",
      id: "Buat dokumen karier format Jepang dari resume kamu.",
      ja: "履歴書から日本フォーマットのキャリア書類を生成します。",
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
    created: { en: "Created", id: "Dibuat", ja: "作成日" },
    statusPending: { en: "pending", id: "menunggu", ja: "待機中" },
    statusProcessing: { en: "processing", id: "diproses", ja: "処理中" },
    statusCompleted: { en: "completed", id: "selesai", ja: "完了" },
    statusFailed: { en: "failed", id: "gagal", ja: "失敗" },
    // Detail page
    backToDocuments: { en: "← Back to documents", id: "← Kembali ke dokumen", ja: "← 書類一覧へ" },
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
      ja: "履歴書をJapanese形式の職務経歴書（shokumukeirekisho）PDFに変換します。",
    },
    // DocumentWizard
    wizStep1Title: { en: "Select a resume", id: "Pilih resume", ja: "履歴書を選択" },
    wizNoResumes: {
      en: "No resumes found.",
      id: "Tidak ada resume ditemukan.",
      ja: "履歴書が見つかりません。",
    },
    wizUploadFirst: {
      en: "Upload one first.",
      id: "Unggah dulu.",
      ja: "先にアップロードしてください。",
    },
    wizUploaded: { en: "Uploaded", id: "Diunggah", ja: "アップロード済み" },
    wizPrimary: { en: "Primary", id: "Utama", ja: "メイン" },
    wizNext: { en: "Next →", id: "Berikut →", ja: "次へ →" },
    wizStep2Title: {
      en: "Job context (optional)",
      id: "Konteks pekerjaan (opsional)",
      ja: "求人コンテキスト（任意）",
    },
    wizStep2Sub: {
      en: "Paste a job posting ID to tailor the document to a specific role. You can skip this and generate a general-purpose document.",
      id: "Tempel ID lowongan untuk menyesuaikan dokumen. Kamu bisa melewati ini untuk membuat dokumen umum.",
      ja: "求人IDを入力して特定の職種向けに書類を最適化できます。省略すると汎用書類が生成されます。",
    },
    wizJobIdPlaceholder: {
      en: "Job posting ID (optional)",
      id: "ID lowongan kerja (opsional)",
      ja: "求人ID（任意）",
    },
    wizStep3Title: { en: "Confirm and generate", id: "Konfirmasi dan buat", ja: "確認して生成" },
    wizResumeLabel: { en: "Resume", id: "Resume", ja: "履歴書" },
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
      en: "Update your profile and manage your account.",
      id: "Perbarui profil dan kelola akunmu.",
      ja: "プロフィールの更新とアカウントの管理。",
    },
    profile: { en: "Profile", id: "Profil", ja: "プロフィール" },
    nationality: { en: "Nationality", id: "Kewarganegaraan", ja: "国籍" },
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
    targetRolesHint: {
      en: "Comma-separated list of job titles you're targeting",
      id: "Daftar jabatan target yang dipisahkan koma",
      ja: "希望する職種名のカンマ区切りリスト",
    },
    targetIndustries: { en: "Target industries", id: "Industri target", ja: "希望業界" },
    targetIndustriesHint: {
      en: "Comma-separated list of industries you're interested in",
      id: "Daftar industri yang diminati, dipisahkan koma",
      ja: "興味のある業界のカンマ区切りリスト",
    },
    preferredLang: { en: "Preferred language", id: "Bahasa yang digunakan", ja: "使用言語" },
    saveFail: {
      en: "Failed to save. Please try again.",
      id: "Gagal menyimpan. Coba lagi.",
      ja: "保存に失敗しました。再試行してください。",
    },
    dangerZone: { en: "Danger zone", id: "Zona berbahaya", ja: "危険ゾーン" },
    deleteAccount: { en: "Delete account", id: "Hapus akun", ja: "アカウント削除" },
    deleteDesc: {
      en: "Permanently delete your account and all associated data — resumes, documents, job postings, interview sessions, and visa consultations. This action cannot be undone.",
      id: "Hapus permanen akun dan semua data terkait — resume, dokumen, lowongan kerja, sesi wawancara, dan konsultasi visa. Tindakan ini tidak dapat dibatalkan.",
      ja: "アカウントと関連するすべてのデータ（履歴書・書類・求人・面接・ビザ相談）を完全に削除します。この操作は取り消せません。",
    },
    deleteBtn: { en: "Delete my account", id: "Hapus akun saya", ja: "アカウントを削除する" },
    confirmPhrase: { en: "delete my account", id: "hapus akun saya", ja: "アカウントを削除" },
    typeToConfirm: { en: "Type", id: "Ketik", ja: "以下を入力してください：" },
    toConfirm: { en: "to confirm.", id: "untuk konfirmasi.", ja: "" },
    confirmDeletion: { en: "Confirm deletion", id: "Konfirmasi penghapusan", ja: "削除を確認" },
    deleting: { en: "Deleting…", id: "Menghapus…", ja: "削除中…" },
    deleteFail: {
      en: "Failed to delete account. Please try again.",
      id: "Gagal menghapus akun. Coba lagi.",
      ja: "アカウントの削除に失敗しました。再試行してください。",
    },
  },

  // ---------------------------------------------------------------------------
  // Legacy dashboard section (kept for backward compat)
  // ---------------------------------------------------------------------------
  dashboard: {
    resumesTitle: { en: "Resumes", id: "Resume", ja: "履歴書" },
    resumesSub: {
      en: "Upload your resume to get started. We'll analyse it for the Japanese job market.",
      id: "Unggah resumemu untuk memulai. Kami akan menganalisisnya untuk pasar kerja Jepang.",
      ja: "履歴書をアップロードして始めましょう。日本の就職市場向けに分析します。",
    },
    uploadBtn: { en: "Upload resume", id: "Unggah resume", ja: "履歴書をアップロード" },
    noResumes: { en: "No resumes yet.", id: "Belum ada resume.", ja: "まだ履歴書がありません。" },
  },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(section: keyof typeof translations, key: string, lang: Language): string {
  const sec = translations[section] as Record<string, Record<Language, string>>;
  return sec[key]?.[lang] ?? sec[key]?.["en"] ?? key;
}
