export type Language = "en" | "id" | "ja";

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: "en", label: "EN" },
  { code: "id", label: "ID" },
  { code: "ja", label: "JP" },
];

export const translations = {
  // Navbar
  nav: {
    resumes:   { en: "Resumes",   id: "Resume",      ja: "履歴書" },
    documents: { en: "Documents", id: "Dokumen",     ja: "書類" },
    jobs:      { en: "Jobs",      id: "Lowongan",    ja: "求人" },
    interview: { en: "Interview", id: "Wawancara",   ja: "面接" },
    visa:      { en: "Visa",      id: "Visa",        ja: "ビザ" },
    culture:   { en: "Culture",   id: "Budaya",      ja: "文化" },
    billing:   { en: "Billing",   id: "Tagihan",     ja: "料金" },
    settings:  { en: "Settings",  id: "Pengaturan",  ja: "設定" },
    signIn:    { en: "Sign in",   id: "Masuk",       ja: "ログイン" },
    getStarted:{ en: "Get started free", id: "Mulai gratis", ja: "無料で始める" },
  },

  // Landing page
  landing: {
    badge:       { en: "For Indonesian professionals pursuing careers in Japan", id: "Untuk profesional Indonesia yang mengejar karier di Jepang", ja: "日本でキャリアを目指すインドネシア人向け" },
    heroTitle1:  { en: "Your AI-powered guide to", id: "Panduan bertenaga AI untuk", ja: "日本で働くための" },
    heroTitle2:  { en: "working in Japan", id: "bekerja di Jepang", ja: "AIガイド" },
    heroSub:     { en: "Japan Job Support helps Indonesian professionals navigate the Japanese job market — from resume translation to visa guidance — all powered by AI and explained in Bahasa Indonesia.", id: "Japan Job Support membantu profesional Indonesia menavigasi pasar kerja Jepang — dari terjemahan resume hingga panduan visa — semua didukung AI dan dijelaskan dalam Bahasa Indonesia.", ja: "Japan Job Supportは、インドネシア人プロフェッショナルが日本の就職市場をナビゲートするためのAIプラットフォームです。" },
    ctaPrimary:  { en: "Get started for free", id: "Mulai gratis", ja: "無料で始める" },
    ctaSecondary:{ en: "Browse culture guide", id: "Jelajahi panduan budaya", ja: "文化ガイドを見る" },
    featuresTitle: { en: "Everything you need to land a job in Japan", id: "Semua yang kamu butuhkan untuk mendapat pekerjaan di Jepang", ja: "日本での就職に必要なすべて" },
    howTitle:    { en: "How it works", id: "Cara kerjanya", ja: "使い方" },
    ctaTitle:    { en: "Ready to start your Japan career journey?", id: "Siap memulai perjalanan karier Jepang kamu?", ja: "日本でのキャリアを始める準備はできましたか？" },
    ctaSub:      { en: "Create a free account and upload your first resume in minutes.", id: "Buat akun gratis dan unggah resume pertamamu dalam hitungan menit.", ja: "無料アカウントを作成して、数分で最初の履歴書をアップロードしましょう。" },
    ctaBtn:      { en: "Create free account", id: "Buat akun gratis", ja: "無料アカウント作成" },
    footer:      { en: "Built for Indonesian professionals.", id: "Dibuat untuk profesional Indonesia.", ja: "インドネシア人プロフェッショナルのために。" },
    step1Title:  { en: "Create an account", id: "Buat akun", ja: "アカウントを作成" },
    step1Desc:   { en: "Sign up for free in under a minute.", id: "Daftar gratis dalam kurang dari satu menit.", ja: "1分以内に無料登録できます。" },
    step2Title:  { en: "Upload your resume", id: "Unggah resumemu", ja: "履歴書をアップロード" },
    step2Desc:   { en: "Upload your existing English resume in PDF or DOCX format.", id: "Unggah resume bahasa Inggrismu dalam format PDF atau DOCX.", ja: "既存の英語履歴書をPDFまたはDOCX形式でアップロードします。" },
    step3Title:  { en: "Let AI do the work", id: "Biarkan AI bekerja", ja: "AIに任せる" },
    step3Desc:   { en: "Get your Japanese documents, scores, and visa roadmap instantly.", id: "Dapatkan dokumen Jepang, skor, dan peta jalan visa secara instan.", ja: "日本語書類、スコア、ビザロードマップを即座に取得します。" },
  },

  // Features
  features: {
    resume:      { en: "Resume Analysis",               id: "Analisis Resume",              ja: "履歴書分析" },
    resumeDesc:  { en: "Upload your English resume and get an instant Japan-market score with actionable feedback.", id: "Unggah resume bahasa Inggrismu dan dapatkan skor pasar Jepang instan dengan masukan yang dapat ditindaklanjuti.", ja: "英語の履歴書をアップロードして、日本市場スコアとフィードバックを即座に取得します。" },
    docs:        { en: "Japanese Document Generation",  id: "Pembuatan Dokumen Jepang",     ja: "日本語書類生成" },
    docsDesc:    { en: "Automatically generate a 履歴書 and 職務経歴書 tailored for Japanese employers.", id: "Buat 履歴書 dan 職務経歴書 secara otomatis yang disesuaikan untuk perusahaan Jepang.", ja: "日本の雇用主向けに最適化された履歴書と職務経歴書を自動生成します。" },
    jobs:        { en: "Job Posting Translation",        id: "Terjemahan Lowongan Kerja",    ja: "求人翻訳" },
    jobsDesc:    { en: "Paste any Japanese job posting and get a full Indonesian translation with a match score.", id: "Tempelkan lowongan kerja Jepang apa pun dan dapatkan terjemahan Indonesia lengkap dengan skor kecocokan.", ja: "日本語の求人をペーストして、インドネシア語の完全翻訳とマッチスコアを取得します。" },
    interview:   { en: "Interview Preparation",          id: "Persiapan Wawancara",          ja: "面接準備" },
    interviewDesc:{ en: "Practice with AI-generated interview questions based on your resume and target role.", id: "Berlatih dengan pertanyaan wawancara yang dihasilkan AI berdasarkan resume dan peran targetmu.", ja: "履歴書と目標職種に基づいたAI生成の面接質問で練習します。" },
    visa:        { en: "Visa Guidance",                  id: "Panduan Visa",                 ja: "ビザガイダンス" },
    visaDesc:    { en: "Get a personalised visa roadmap and step-by-step checklist based on your profile.", id: "Dapatkan peta jalan visa yang dipersonalisasi dan daftar periksa langkah demi langkah.", ja: "あなたのプロフィールに基づいた個別のビザロードマップとチェックリストを取得します。" },
    culture:     { en: "Culture & Glossary",             id: "Budaya & Glosarium",           ja: "文化・用語集" },
    cultureDesc: { en: "Learn Japanese workplace culture, business etiquette, and key terms in Indonesian.", id: "Pelajari budaya tempat kerja Jepang, etiket bisnis, dan istilah kunci dalam Bahasa Indonesia.", ja: "日本の職場文化、ビジネスマナー、重要な用語をインドネシア語で学びます。" },
  },

  // Dashboard pages
  dashboard: {
    resumesTitle:   { en: "Resumes",    id: "Resume",     ja: "履歴書" },
    resumesSub:     { en: "Upload your resume to get started. We'll analyse it for the Japanese job market.", id: "Unggah resumemu untuk memulai. Kami akan menganalisisnya untuk pasar kerja Jepang.", ja: "履歴書をアップロードして始めましょう。日本の就職市場向けに分析します。" },
    uploadBtn:      { en: "Upload resume", id: "Unggah resume", ja: "履歴書をアップロード" },
    noResumes:      { en: "No resumes yet.", id: "Belum ada resume.", ja: "まだ履歴書がありません。" },
  },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(
  section: keyof typeof translations,
  key: string,
  lang: Language
): string {
  const sec = translations[section] as Record<string, Record<Language, string>>;
  return sec[key]?.[lang] ?? sec[key]?.["en"] ?? key;
}
