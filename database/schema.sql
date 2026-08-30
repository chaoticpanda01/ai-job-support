-- =============================================================================
-- Japan Job Support Platform — PostgreSQL Schema
-- Version: 1.2 | PostgreSQL 16
-- Changelog:
--   1.2 — Fixed table ordering (job_postings before resume_analyses),
--          subscription_limits before views, pg_cron block made optional,
--          CREATE ROLE uses IF NOT EXISTS, consent_given_at added to profiles.
--   1.1 (Phase 0) — Added resumes.updated_at trigger; job_postings soft-delete
--                   (deleted_at); fixed full-text index to 'simple' dictionary;
--                   added monthly_token_budget to subscription_limits; extended
--                   ai_usage_logs partitions to 2027-12; added culture_topics,
--                   culture_glossary, job_applications, subscriptions,
--                   billing_events, notification_log tables;
--                   removed cover_letter from document_type ENUM (deferred post-MVP).
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- trigram indexes for text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";    -- GIN indexes on scalar types
-- pg_cron is optional — only available on managed PostgreSQL (Railway, RDS, etc.)
-- CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE subscription_tier   AS ENUM ('free', 'basic', 'pro');
CREATE TYPE japanese_level      AS ENUM ('N1', 'N2', 'N3', 'N4', 'N5', 'none');
CREATE TYPE preferred_language  AS ENUM ('id', 'en', 'ja');
CREATE TYPE visa_status         AS ENUM ('none', 'pending', 'held');
CREATE TYPE gender              AS ENUM ('male', 'female');

-- cover_letter removed — deferred to post-MVP. Re-add when prompt and endpoint are ready.
CREATE TYPE document_type       AS ENUM ('rirekisho', 'shokumukeirekisho');

CREATE TYPE document_status     AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE document_orientation AS ENUM ('portrait', 'landscape');
CREATE TYPE job_source_platform AS ENUM ('indeed_jp', 'rikunabi', 'mynavi', 'hellowork', 'manual');
CREATE TYPE interview_type      AS ENUM ('behavioral', 'technical', 'general', 'culture_fit');
CREATE TYPE interview_status    AS ENUM ('active', 'completed', 'abandoned');
CREATE TYPE message_role        AS ENUM ('interviewer', 'user', 'feedback');
CREATE TYPE analysis_type       AS ENUM ('general', 'job_match', 'gap_analysis');
CREATE TYPE original_language   AS ENUM ('ja', 'en', 'id');
CREATE TYPE notification_channel AS ENUM ('email', 'push');
CREATE TYPE notification_status  AS ENUM ('sent', 'delivered', 'bounced', 'failed');
CREATE TYPE subscription_status  AS ENUM ('active', 'past_due', 'cancelled', 'trialing');
CREATE TYPE billing_event_type   AS ENUM ('subscribed', 'renewed', 'upgraded', 'downgraded', 'cancelled', 'payment_failed', 'refunded');
CREATE TYPE application_status   AS ENUM ('planning', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn');
CREATE TYPE user_role            AS ENUM ('user', 'admin');

-- =============================================================================
-- UTILITY: updated_at trigger function (shared across all tables)
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =============================================================================
-- TABLE: users
-- =============================================================================

CREATE TABLE users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id          VARCHAR(255) NOT NULL,
  email             VARCHAR(255) NOT NULL,
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  full_name         VARCHAR(255),
  role              user_role   NOT NULL DEFAULT 'user',
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT users_clerk_id_uk UNIQUE (clerk_id),
  CONSTRAINT users_email_uk    UNIQUE (email),
  CONSTRAINT users_email_fmt   CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: profiles
-- Extended user preferences. One per user (enforced by unique constraint).
-- onboarding_step: 0=not started, 1=basic info, 2=resume uploaded,
--                  3=preferences set, 4=Japanese level/visa/preferences saved,
--                  5=completed (rirekisho personal-info step done)
-- =============================================================================

CREATE TABLE profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL,
  nationality           VARCHAR(100) NOT NULL DEFAULT 'Indonesian',
  japanese_level        japanese_level NOT NULL DEFAULT 'none',
  target_industry       TEXT[]      NOT NULL DEFAULT '{}',
  target_role           TEXT[]      NOT NULL DEFAULT '{}',
  years_experience      SMALLINT    CHECK (years_experience >= 0 AND years_experience <= 80),
  current_location      VARCHAR(255),
  target_location       VARCHAR(255),
  visa_status           visa_status NOT NULL DEFAULT 'none',
  preferred_language    preferred_language NOT NULL DEFAULT 'id',
  onboarding_step       SMALLINT    NOT NULL DEFAULT 0 CHECK (onboarding_step BETWEEN 0 AND 5),
  onboarding_completed  BOOLEAN     GENERATED ALWAYS AS (onboarding_step = 5) STORED,
  consent_given_at      TIMESTAMPTZ,
  name_kana             VARCHAR(255),
  date_of_birth         DATE,
  gender                gender,
  phone_number          VARCHAR(50),
  mailing_address       TEXT,
  residence_card_expiration DATE,
  visa_category         VARCHAR(255),
  photo_storage_key     VARCHAR(500),
  hobbies               TEXT,
  special_skills        TEXT,
  personal_requests     TEXT,
  commute_time          TEXT,
  dependents            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT profiles_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_user_id_uk UNIQUE (user_id)
);

CREATE INDEX idx_profiles_user_id ON profiles (user_id);

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: resumes
-- =============================================================================

CREATE TABLE resumes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  file_name       VARCHAR(500) NOT NULL,
  file_url        TEXT        NOT NULL,
  file_size_bytes INTEGER     NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  mime_type       VARCHAR(100) NOT NULL CHECK (mime_type IN (
                    'application/pdf',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  )),
  language        preferred_language NOT NULL DEFAULT 'id',
  is_primary      BOOLEAN     NOT NULL DEFAULT FALSE,
  parsed_content  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT resumes_user_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_resumes_one_primary   ON resumes (user_id) WHERE is_primary = TRUE;
CREATE INDEX idx_resumes_user_id              ON resumes (user_id);
CREATE INDEX idx_resumes_created_at           ON resumes (user_id, created_at DESC);
CREATE INDEX idx_resumes_parsed_content       ON resumes USING GIN (parsed_content);

CREATE TRIGGER resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: job_postings
-- Must be created before resume_analyses (FK dependency).
-- Soft-delete via deleted_at. Filter WHERE deleted_at IS NULL in all queries.
-- Hard deletes are never performed — resume_analyses FK uses SET NULL.
-- =============================================================================

CREATE TABLE job_postings (
  id                        UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url                TEXT,
  source_platform           job_source_platform NOT NULL DEFAULT 'manual',
  original_title            TEXT,
  original_company          VARCHAR(500),
  original_description      TEXT,
  original_language         original_language   NOT NULL DEFAULT 'ja',
  translated_title          TEXT,
  translated_description    TEXT,
  translation_summary       TEXT,
  structured_data           JSONB,
  foreigner_friendliness_score NUMERIC(5,2)     CHECK (foreigner_friendliness_score BETWEEN 0 AND 100),
  submitted_by              UUID,
  created_at                TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  cached_until              TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ,        -- soft-delete; NULL = active

  CONSTRAINT job_postings_submitted_by_fk FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Unique URL constraint only among active (non-deleted) postings
CREATE UNIQUE INDEX idx_job_postings_source_url     ON job_postings (source_url) WHERE source_url IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_job_postings_created_at            ON job_postings (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_job_postings_company               ON job_postings (original_company)  WHERE deleted_at IS NULL;
CREATE INDEX idx_job_postings_structured            ON job_postings USING GIN (structured_data);
CREATE INDEX idx_job_postings_friendliness          ON job_postings (foreigner_friendliness_score DESC) WHERE deleted_at IS NULL;

-- 'simple' dictionary: lowercases + strips accents without language-specific stemming.
-- Correct for Indonesian text — no built-in Indonesian dictionary exists in PostgreSQL.
CREATE INDEX idx_job_postings_title_search ON job_postings
  USING GIN (to_tsvector('simple', COALESCE(translated_title, '') || ' ' || COALESCE(translation_summary, '')))
  WHERE deleted_at IS NULL;

-- =============================================================================
-- TABLE: resume_analyses
-- job_posting_id is nullable with SET NULL on delete so analyses survive
-- job removal.
-- =============================================================================

CREATE TABLE resume_analyses (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id       UUID         NOT NULL,
  analysis_type   analysis_type NOT NULL DEFAULT 'general',
  job_posting_id  UUID,
  ai_model        VARCHAR(100) NOT NULL,
  input_tokens    INTEGER      NOT NULL CHECK (input_tokens >= 0),
  output_tokens   INTEGER      NOT NULL CHECK (output_tokens >= 0),
  result          JSONB        NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT resume_analyses_resume_fk     FOREIGN KEY (resume_id)      REFERENCES resumes(id)      ON DELETE CASCADE,
  CONSTRAINT resume_analyses_job_fk        FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE SET NULL
);

CREATE INDEX idx_resume_analyses_resume_id ON resume_analyses (resume_id);
CREATE INDEX idx_resume_analyses_result    ON resume_analyses USING GIN (result);

-- =============================================================================
-- TABLE: generated_documents
-- =============================================================================

CREATE TABLE generated_documents (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID            NOT NULL,
  resume_id       UUID,
  document_type   document_type   NOT NULL,
  status          document_status NOT NULL DEFAULT 'pending',
  orientation     document_orientation NOT NULL DEFAULT 'portrait',
  job_context     JSONB,
  ai_model        VARCHAR(100),
  input_tokens    INTEGER         CHECK (input_tokens >= 0),
  output_tokens   INTEGER         CHECK (output_tokens >= 0),
  content         JSONB,
  file_url        TEXT,
  error_message   TEXT,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  CONSTRAINT generated_documents_user_fk   FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE,
  CONSTRAINT generated_documents_resume_fk FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL,
  CONSTRAINT generated_documents_timing    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE INDEX idx_gen_docs_user_id ON generated_documents (user_id);
CREATE INDEX idx_gen_docs_status  ON generated_documents (status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_gen_docs_created ON generated_documents (user_id, created_at DESC);

-- =============================================================================
-- TABLE: job_matches
-- =============================================================================

CREATE TABLE job_matches (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  resume_id       UUID        NOT NULL,
  job_posting_id  UUID        NOT NULL,
  match_score     NUMERIC(5,2) NOT NULL CHECK (match_score BETWEEN 0 AND 100),
  match_breakdown JSONB       NOT NULL,
  recommendations JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT job_matches_user_fk    FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT job_matches_resume_fk  FOREIGN KEY (resume_id)      REFERENCES resumes(id)      ON DELETE CASCADE,
  CONSTRAINT job_matches_job_fk     FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE,
  CONSTRAINT job_matches_unique_triple UNIQUE (user_id, resume_id, job_posting_id)
);

CREATE INDEX idx_job_matches_user_resume ON job_matches (user_id, resume_id);
CREATE INDEX idx_job_matches_score       ON job_matches (user_id, match_score DESC);

-- =============================================================================
-- TABLE: saved_jobs
-- =============================================================================

CREATE TABLE saved_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL,
  job_posting_id  UUID        NOT NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT saved_jobs_user_fk FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT saved_jobs_job_fk  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE,
  CONSTRAINT saved_jobs_unique  UNIQUE (user_id, job_posting_id)
);

CREATE INDEX idx_saved_jobs_user_id ON saved_jobs (user_id);

-- =============================================================================
-- TABLE: job_applications
-- =============================================================================

CREATE TABLE job_applications (
  id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID               NOT NULL,
  job_posting_id  UUID               NOT NULL,
  status          application_status NOT NULL DEFAULT 'planning',
  applied_at      TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT job_applications_user_fk FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
  CONSTRAINT job_applications_job_fk  FOREIGN KEY (job_posting_id) REFERENCES job_postings(id) ON DELETE CASCADE,
  CONSTRAINT job_applications_unique  UNIQUE (user_id, job_posting_id)
);

CREATE INDEX idx_job_applications_user_id ON job_applications (user_id);
CREATE INDEX idx_job_applications_status  ON job_applications (user_id, status);

CREATE TRIGGER job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: interview_sessions
-- =============================================================================

CREATE TABLE interview_sessions (
  id               UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID             NOT NULL,
  session_type     interview_type   NOT NULL DEFAULT 'general',
  target_role      VARCHAR(255),
  target_company   VARCHAR(255),
  language         preferred_language NOT NULL DEFAULT 'ja',
  status           interview_status NOT NULL DEFAULT 'active',
  session_data     JSONB,
  overall_score    NUMERIC(5,2)     CHECK (overall_score BETWEEN 0 AND 100),
  feedback_summary TEXT,
  created_at       TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,

  CONSTRAINT interview_sessions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT interview_sessions_timing  CHECK (completed_at IS NULL OR completed_at >= created_at)
);

CREATE INDEX idx_interview_sessions_user_id ON interview_sessions (user_id);
CREATE INDEX idx_interview_sessions_status  ON interview_sessions (user_id, status);
CREATE INDEX idx_interview_sessions_created ON interview_sessions (user_id, created_at DESC);

-- =============================================================================
-- TABLE: interview_messages
-- =============================================================================

CREATE TABLE interview_messages (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID         NOT NULL,
  role          message_role NOT NULL,
  content       TEXT         NOT NULL,
  language      preferred_language,
  ai_evaluation JSONB,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT interview_messages_session_fk FOREIGN KEY (session_id)
    REFERENCES interview_sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_interview_messages_session ON interview_messages (session_id, created_at ASC);

-- =============================================================================
-- TABLE: visa_consultations
-- =============================================================================

CREATE TABLE visa_consultations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL,
  visa_type        VARCHAR(100),
  profile_snapshot JSONB       NOT NULL,
  checklist        JSONB,
  ai_guidance      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT visa_consultations_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_visa_consultations_user_id ON visa_consultations (user_id);

CREATE TRIGGER visa_consultations_updated_at
  BEFORE UPDATE ON visa_consultations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: culture_topics
-- =============================================================================

CREATE TABLE culture_topics (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         VARCHAR(255) NOT NULL,
  title        TEXT        NOT NULL,
  body         TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT culture_topics_slug_uk UNIQUE (slug)
);

CREATE INDEX idx_culture_topics_published ON culture_topics (published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX idx_culture_topics_tags      ON culture_topics USING GIN (tags);

CREATE TRIGGER culture_topics_updated_at
  BEFORE UPDATE ON culture_topics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: culture_glossary
-- =============================================================================

CREATE TABLE culture_glossary (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  term_ja        VARCHAR(255) NOT NULL,
  reading_romaji VARCHAR(255),
  definition_id  TEXT        NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT culture_glossary_term_uk UNIQUE (term_ja)
);

CREATE INDEX idx_culture_glossary_term ON culture_glossary USING GIN (to_tsvector('simple', term_ja || ' ' || COALESCE(reading_romaji, '')));

-- =============================================================================
-- TABLE: subscriptions
-- =============================================================================

CREATE TABLE subscriptions (
  id                    UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID               NOT NULL,
  stripe_subscription_id VARCHAR(255)      NOT NULL,
  stripe_customer_id    VARCHAR(255)       NOT NULL,
  tier                  subscription_tier  NOT NULL,
  status                subscription_status NOT NULL DEFAULT 'active',
  current_period_start  TIMESTAMPTZ        NOT NULL,
  current_period_end    TIMESTAMPTZ        NOT NULL,
  cancelled_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT subscriptions_user_fk        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT subscriptions_stripe_sub_uk  UNIQUE (stripe_subscription_id),
  CONSTRAINT subscriptions_period_order   CHECK (current_period_end > current_period_start)
);

CREATE UNIQUE INDEX idx_subscriptions_active_user
  ON subscriptions (user_id)
  WHERE status IN ('active', 'trialing');

CREATE INDEX idx_subscriptions_user_id ON subscriptions (user_id);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- TABLE: billing_events
-- =============================================================================

CREATE TABLE billing_events (
  id               UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID,
  stripe_event_id  VARCHAR(255)       NOT NULL,
  event_type       billing_event_type NOT NULL,
  tier_from        subscription_tier,
  tier_to          subscription_tier,
  amount_jpy       INTEGER,
  created_at       TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_events_user_fk      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT billing_events_stripe_ev_uk UNIQUE (stripe_event_id)
);

CREATE INDEX idx_billing_events_user_id ON billing_events (user_id, created_at DESC);

-- =============================================================================
-- TABLE: notification_log
-- =============================================================================

CREATE TABLE notification_log (
  id          UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,
  channel     notification_channel NOT NULL,
  template_id VARCHAR(100)         NOT NULL,
  status      notification_status  NOT NULL DEFAULT 'sent',
  provider_id TEXT,
  created_at  TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

  CONSTRAINT notification_log_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_notification_log_user_template ON notification_log (user_id, template_id, created_at DESC);

-- =============================================================================
-- TABLE: ai_usage_logs (partitioned by month)
-- =============================================================================

CREATE TABLE ai_usage_logs (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id       UUID,
  feature       VARCHAR(100) NOT NULL,
  model         VARCHAR(100) NOT NULL,
  input_tokens  INTEGER     NOT NULL DEFAULT 0 CHECK (input_tokens  >= 0),
  output_tokens INTEGER     NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cost_usd      NUMERIC(12,6),
  latency_ms    INTEGER     CHECK (latency_ms >= 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_usage_logs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) PARTITION BY RANGE (created_at);

-- 2026 partitions
CREATE TABLE ai_usage_logs_2026_01 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE ai_usage_logs_2026_02 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE ai_usage_logs_2026_03 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE ai_usage_logs_2026_04 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE ai_usage_logs_2026_05 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE ai_usage_logs_2026_06 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE ai_usage_logs_2026_07 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE ai_usage_logs_2026_08 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE ai_usage_logs_2026_09 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE ai_usage_logs_2026_10 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE ai_usage_logs_2026_11 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE ai_usage_logs_2026_12 PARTITION OF ai_usage_logs FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- 2027 partitions
CREATE TABLE ai_usage_logs_2027_01 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE ai_usage_logs_2027_02 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');
CREATE TABLE ai_usage_logs_2027_03 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-03-01') TO ('2027-04-01');
CREATE TABLE ai_usage_logs_2027_04 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-04-01') TO ('2027-05-01');
CREATE TABLE ai_usage_logs_2027_05 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-05-01') TO ('2027-06-01');
CREATE TABLE ai_usage_logs_2027_06 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-06-01') TO ('2027-07-01');
CREATE TABLE ai_usage_logs_2027_07 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-07-01') TO ('2027-08-01');
CREATE TABLE ai_usage_logs_2027_08 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-08-01') TO ('2027-09-01');
CREATE TABLE ai_usage_logs_2027_09 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-09-01') TO ('2027-10-01');
CREATE TABLE ai_usage_logs_2027_10 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-10-01') TO ('2027-11-01');
CREATE TABLE ai_usage_logs_2027_11 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-11-01') TO ('2027-12-01');
CREATE TABLE ai_usage_logs_2027_12 PARTITION OF ai_usage_logs FOR VALUES FROM ('2027-12-01') TO ('2028-01-01');

CREATE INDEX idx_ai_usage_user_date    ON ai_usage_logs (user_id, created_at DESC);
CREATE INDEX idx_ai_usage_feature_date ON ai_usage_logs (feature, created_at DESC);

-- pg_cron automated partition creation (production only — requires pg_cron extension).
-- On managed PostgreSQL, enable pg_cron and run:
--   SELECT cron.schedule('create-ai-usage-partition', '0 0 25 * *', $cmd$
--     DO $do$
--     DECLARE
--       next_month     DATE := DATE_TRUNC('month', NOW() + INTERVAL '1 month');
--       partition_name TEXT := 'ai_usage_logs_' || TO_CHAR(next_month, 'YYYY_MM');
--       range_start    TEXT := TO_CHAR(next_month, 'YYYY-MM-DD');
--       range_end      TEXT := TO_CHAR(next_month + INTERVAL '1 month', 'YYYY-MM-DD');
--     BEGIN
--       EXECUTE FORMAT(
--         'CREATE TABLE IF NOT EXISTS %I PARTITION OF ai_usage_logs FOR VALUES FROM (%L) TO (%L)',
--         partition_name, range_start, range_end
--       );
--     END;
--     $do$;
--   $cmd$);

-- =============================================================================
-- TABLE: subscription_limits (must exist before views that reference it)
-- =============================================================================

CREATE TABLE subscription_limits (
  tier                   subscription_tier PRIMARY KEY,
  monthly_resume_uploads INTEGER NOT NULL,
  monthly_analyses       INTEGER NOT NULL,
  monthly_rirekisho      INTEGER NOT NULL,
  monthly_shokumu        INTEGER NOT NULL,
  monthly_job_translate  INTEGER NOT NULL,
  monthly_interviews     INTEGER NOT NULL,
  monthly_token_budget   INTEGER NOT NULL,
  pdf_export_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  full_culture_access    BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO subscription_limits VALUES
--  tier     upl  ana  ris  sho  job  int  tokens    pdf    culture
  ('free',    1,   1,   1,   0,   3,   1,  50000,   FALSE, FALSE),
  ('basic',   5,  10,   5,   3,  30,   5,  500000,  TRUE,  TRUE),
  ('pro',    -1,  -1,  -1,  -1,  -1,  -1,  -1,      TRUE,  TRUE);

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE VIEW v_user_monthly_usage AS
SELECT
  user_id,
  feature,
  DATE_TRUNC('month', created_at) AS month,
  SUM(input_tokens + output_tokens) AS total_tokens,
  SUM(cost_usd)                     AS total_cost_usd,
  COUNT(*)                          AS call_count
FROM ai_usage_logs
GROUP BY user_id, feature, DATE_TRUNC('month', created_at);

CREATE VIEW v_interview_session_summary AS
SELECT
  s.id,
  s.user_id,
  s.session_type,
  s.target_role,
  s.status,
  s.overall_score,
  s.created_at,
  COUNT(m.id) FILTER (WHERE m.role = 'user')        AS user_turns,
  COUNT(m.id) FILTER (WHERE m.role = 'interviewer') AS interviewer_turns,
  MAX(m.created_at)                                  AS last_message_at
FROM interview_sessions s
LEFT JOIN interview_messages m ON m.session_id = s.id
GROUP BY s.id;

CREATE VIEW v_user_document_stats AS
SELECT
  user_id,
  document_type,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed,
  COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
  COUNT(*) FILTER (WHERE status = 'failed')    AS failed,
  MAX(created_at)                               AS last_generated_at
FROM generated_documents
GROUP BY user_id, document_type;

-- Active subscription view — join this to enforce feature access
CREATE VIEW v_active_subscriptions AS
SELECT
  s.user_id,
  s.tier,
  s.status,
  s.current_period_end,
  sl.monthly_resume_uploads,
  sl.monthly_analyses,
  sl.monthly_rirekisho,
  sl.monthly_shokumu,
  sl.monthly_job_translate,
  sl.monthly_interviews,
  sl.monthly_token_budget,
  sl.pdf_export_enabled,
  sl.full_culture_access
FROM subscriptions s
JOIN subscription_limits sl ON sl.tier = s.tier
WHERE s.status IN ('active', 'trialing');

-- =============================================================================
-- DATABASE ROLES
-- =============================================================================
-- Row Level Security is intentionally NOT used here. An earlier version of
-- this schema ran `ENABLE ROW LEVEL SECURITY` on every table with zero
-- `CREATE POLICY` statements defined — RLS with no policies enforces nothing
-- (a table owner is unaffected by RLS; a non-owner role with no permissive
-- policy is blocked entirely), so it provided no actual protection while
-- implying to readers that row-level isolation existed. It didn't.
--
-- Access control is enforced at the application layer instead: every
-- repository method that fetches a user-owned row (resumes, documents,
-- interview sessions, visa consultations, etc.) filters by the owning
-- user_id — see `get_owned()` in backend/app/repositories/*.py. If real
-- database-layer isolation is wanted later, add explicit `CREATE POLICY`
-- statements keyed on a per-request session variable (e.g.
-- `current_setting('app.user_id')`) rather than re-enabling RLS with no
-- policies.

DO $$ BEGIN
  CREATE ROLE app_service;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_service;

-- =============================================================================
-- MAINTENANCE NOTES
-- =============================================================================
-- 1. ai_usage_logs partitions are pre-created through 2027-12.
--    On managed PostgreSQL with pg_cron, enable the commented schedule above
--    to auto-create partitions monthly.
--
-- 2. job_postings uses soft-delete (deleted_at). Filter WHERE deleted_at IS NULL.
--
-- 3. Streaming: SSE for interview practice.
--    Frontend: @microsoft/fetch-event-source
--    Backend: FastAPI StreamingResponse, media_type='text/event-stream'
--
-- 4. cover_letter deferred from document_type ENUM.
--    To re-add: ALTER TYPE document_type ADD VALUE 'cover_letter';
--
-- 5. Run VACUUM ANALYZE weekly on:
--    resumes, generated_documents, interview_messages, ai_usage_logs
-- =============================================================================
