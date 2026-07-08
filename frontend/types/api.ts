export type SubscriptionTier = "free" | "basic" | "pro";
export type UserRole = "user" | "admin";
export type JapaneseLevel = "N1" | "N2" | "N3" | "N4" | "N5" | "none";
export type VisaStatus = "none" | "pending" | "held";
export type PreferredLanguage = "id" | "en" | "ja";
export type AnalysisType = "general" | "job_match" | "gap_analysis";

export interface Profile {
  id: string;
  user_id: string;
  nationality: string;
  japanese_level: JapaneseLevel;
  target_industry: string[];
  target_role: string[];
  years_experience: number | null;
  current_location: string | null;
  target_location: string | null;
  visa_status: VisaStatus;
  preferred_language: PreferredLanguage;
  onboarding_step: number;
  onboarding_completed: boolean;
  consent_given_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  clerk_id: string;
  email: string;
  email_verified: boolean;
  full_name: string | null;
  subscription_tier: SubscriptionTier;
  role: UserRole;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  profile: Profile | null;
}

export interface MeResponse {
  user: User;
  profile: Profile | null;
}

export interface ProfileUpdateRequest {
  nationality?: string;
  japanese_level?: JapaneseLevel;
  target_industry?: string[];
  target_role?: string[];
  years_experience?: number | undefined;
  current_location?: string;
  target_location?: string;
  visa_status?: VisaStatus;
  preferred_language?: PreferredLanguage;
  onboarding_step?: number;
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  language: PreferredLanguage;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResumeDetail extends Resume {
  download_url: string;
}

export interface ResumeList {
  items: Resume[];
  total: number;
}

export interface ResumeAnalysis {
  id: string;
  resume_id: string;
  analysis_type: AnalysisType;
  job_posting_id: string | null;
  ai_model: string;
  input_tokens: number;
  output_tokens: number;
  result: ResumeAnalysisResult;
  created_at: string;
}

export interface ResumeAnalysisResult {
  japan_market_score: number;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
  language_assessment: string;
  estimated_japanese_level_required: JapaneseLevel | "none";
  summary: string;
}

export interface AnalyzeResponse {
  task_id: string;
  resume_id: string;
  status: string;
}

export interface ApiError {
  detail: string;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type DocumentType = "rirekisho" | "shokumukeirekisho";
export type DocumentStatus = "pending" | "processing" | "completed" | "failed";

export interface DocumentStatusResponse {
  id: string;
  status: DocumentStatus;
  error_message: string | null;
  completed_at: string | null;
}

export interface Document {
  id: string;
  user_id: string;
  resume_id: string | null;
  document_type: DocumentType;
  status: DocumentStatus;
  job_context: Record<string, unknown> | null;
  ai_model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error_message: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DocumentDetail extends Document {
  content: Record<string, unknown> | null;
  download_url: string | null;
}

export interface DocumentList {
  items: Document[];
  total: number;
}

export interface CreateDocumentRequest {
  resume_id: string;
  job_posting_id?: string;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobStructuredData {
  company_name: string;
  location: string;
  employment_type: string;
  salary_range: string;
  required_japanese: "N1" | "N2" | "N3" | "N4" | "N5" | "none";
  required_experience_years: number;
  key_requirements: string[];
  benefits: string[];
  visa_sponsorship: boolean | null;
}

export interface JobPosting {
  id: string;
  source_url: string | null;
  source_platform: string;
  original_title: string | null;
  original_company: string | null;
  original_language: string;
  translated_title: string | null;
  translation_summary: string | null;
  foreigner_friendliness_score: number | null;
  structured_data: JobStructuredData | null;
  cached_until: string | null;
  submitted_by: string | null;
  created_at: string;
}

export interface JobPostingDetail extends JobPosting {
  original_description: string | null;
  translated_description: string | null;
}

export interface JobPostingList {
  items: JobPosting[];
  total: number;
}

export interface TranslateJobRequest {
  source_url?: string;
  raw_text: string;
}

export interface MatchBreakdown {
  skills_match: number;
  experience_match: number;
  language_match: number;
  culture_fit: number;
  summary: string;
}

export interface MatchRecommendations {
  strengths: string[];
  gaps: string[];
  actions: string[];
}

export interface JobMatch {
  id: string;
  user_id: string;
  resume_id: string;
  job_posting_id: string;
  match_score: number;
  match_breakdown: MatchBreakdown;
  recommendations: MatchRecommendations | null;
  created_at: string;
}

export interface MatchRequest {
  resume_id: string;
}

export type ApplicationStatus =
  | "planning"
  | "applied"
  | "interviewing"
  | "offered"
  | "rejected"
  | "withdrawn";

export interface JobApplication {
  id: string;
  user_id: string;
  job_posting_id: string;
  status: ApplicationStatus;
  applied_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  job_title: string | null;
  job_company: string | null;
}

export interface CreateApplicationRequest {
  job_posting_id: string;
  notes?: string;
}

export interface UpdateApplicationRequest {
  status?: ApplicationStatus;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Interview
// ---------------------------------------------------------------------------

export type InterviewType = "general" | "behavioral" | "technical" | "culture_fit";
export type InterviewStatus = "active" | "completed" | "abandoned";
export type InterviewLanguage = "ja" | "en" | "id";
export type MessageRole = "interviewer" | "user" | "feedback";

export interface InterviewEvaluation {
  keigo_score: number;
  content_relevance: number;
  specificity_score: number;
  grammar_issues: string[];
  positive_feedback: string;
  improvement_tip: string;
}

export interface InterviewSummary {
  overall_score: number;
  feedback_summary: string;
  top_strengths: string[];
  top_improvements: string[];
}

export interface InterviewMessage {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  language: string | null;
  ai_evaluation: InterviewEvaluation | null;
  created_at: string;
}

export interface InterviewSession {
  id: string;
  user_id: string;
  session_type: InterviewType;
  target_role: string | null;
  target_company: string | null;
  language: InterviewLanguage;
  status: InterviewStatus;
  overall_score: number | null;
  feedback_summary: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface InterviewSessionDetail extends InterviewSession {
  messages: InterviewMessage[];
}

export interface CreateSessionRequest {
  session_type: InterviewType;
  target_role?: string;
  target_company?: string;
  language: InterviewLanguage;
}

// SSE events received from the stream
export type SseEvent =
  | { type: "token"; content: string }
  | { type: "eval"; content: InterviewEvaluation }
  | { type: "summary"; content: InterviewSummary }
  | { type: "done" }
  | { type: "error"; content: string };

// ---------------------------------------------------------------------------
// Visa
// ---------------------------------------------------------------------------

export interface VisaChecklistStep {
  id: string;
  title: string;
  detail: string;
  required: boolean;
  estimated_weeks: number;
  resources: string[];
}

export interface VisaChecklistPhase {
  phase: string;
  description: string;
  steps: VisaChecklistStep[];
}

export interface VisaChecklist {
  phases: VisaChecklistPhase[];
}

export interface VisaConsultation {
  id: string;
  visa_type: string | null;
  ai_guidance: string | null;
  checklist: VisaChecklist | null;
  profile_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface VisaConsultationListItem {
  id: string;
  visa_type: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Culture
// ---------------------------------------------------------------------------

export interface CultureTopicSummary {
  id: string;
  slug: string;
  title: string;
  tags: string[];
  published_at: string;
}

export interface CultureTopicDetail {
  id: string;
  slug: string;
  title: string;
  body: string;
  tags: string[];
  published_at: string;
  created_at: string;
}

export interface GlossaryEntry {
  id: string;
  term_ja: string;
  reading_romaji: string | null;
  definition_id: string;
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled";
export type BillingEventType =
  | "subscribed"
  | "renewed"
  | "upgraded"
  | "downgraded"
  | "cancelled"
  | "payment_failed"
  | "refunded";

export interface Subscription {
  id: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancelled_at: string | null;
  stripe_customer_id: string;
}

export interface BillingEvent {
  id: string;
  event_type: BillingEventType;
  tier_from: SubscriptionTier | null;
  tier_to: SubscriptionTier | null;
  amount_jpy: number | null;
  created_at: string;
}

export interface CheckoutRequest {
  tier: SubscriptionTier;
}

export interface CheckoutResponse {
  url: string;
}

export interface PortalResponse {
  url: string;
}
