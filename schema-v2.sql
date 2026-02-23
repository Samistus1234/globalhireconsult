-- ============================================
-- GLOBALHIRE@ELAB — Schema v2
-- New tables for enhanced platform features
-- ============================================

-- Run within the globalhire schema
CREATE SCHEMA IF NOT EXISTS globalhire;

-- ── Articles (News, Updates, Success Stories for Explore page) ──
CREATE TABLE IF NOT EXISTS globalhire.articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  body TEXT,
  category TEXT NOT NULL CHECK (category IN ('regulatory', 'industry', 'success_story', 'market_report', 'announcement')),
  cover_image_url TEXT,
  author_name TEXT,
  published_at TIMESTAMPTZ,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Events (Recruitment Events, Webinars, Virtual Fairs) ──
CREATE TABLE IF NOT EXISTS globalhire.events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('virtual_fair', 'webinar', 'workshop', 'conference')),
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  location TEXT, -- NULL for virtual events
  is_virtual BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  max_attendees INT,
  registration_url TEXT,
  recording_url TEXT, -- for past events
  cover_image_url TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Event Registrations ──
CREATE TABLE IF NOT EXISTS globalhire.event_registrations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES globalhire.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT now(),
  attended BOOLEAN DEFAULT false,
  UNIQUE(event_id, user_id)
);

-- ── Guides (Resource Library Content) ──
CREATE TABLE IF NOT EXISTS globalhire.guides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  body TEXT,
  category TEXT NOT NULL CHECK (category IN ('country', 'licensing', 'relocation', 'job_hunting', 'settling_in')),
  country_code CHAR(2), -- ISO country code, NULL for non-country guides
  cover_image_url TEXT,
  read_time_minutes INT DEFAULT 5,
  is_featured BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Countries (Country data for guides and country-detail pages) ──
CREATE TABLE IF NOT EXISTS globalhire.countries (
  code CHAR(2) PRIMARY KEY, -- ISO 3166-1 alpha-2
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  flag_emoji TEXT,
  avg_salary_range TEXT,
  processing_time TEXT,
  language_requirements TEXT,
  healthcare_system TEXT,
  licensing_body TEXT,
  visa_difficulty INT CHECK (visa_difficulty BETWEEN 1 AND 5),
  cost_of_living TEXT,
  work_life_balance TEXT,
  healthcare_overview TEXT,
  language_detail TEXT,
  cost_detail TEXT,
  work_life_detail TEXT,
  licensing_steps JSONB DEFAULT '[]', -- array of {title, desc}
  required_docs TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Jobs (Dynamic Job Listings) ──
CREATE TABLE IF NOT EXISTS globalhire.jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  employer_name TEXT NOT NULL,
  employer_logo_text TEXT, -- 2-letter abbreviation
  employer_logo_style TEXT, -- CSS gradient style
  country_code CHAR(2) REFERENCES globalhire.countries(code),
  city TEXT,
  specialty TEXT NOT NULL,
  contract_type TEXT CHECK (contract_type IN ('permanent', 'contract', 'temporary', 'locum')),
  employment_type TEXT CHECK (employment_type IN ('full_time', 'part_time', 'per_diem')),
  salary_amount NUMERIC,
  salary_currency TEXT DEFAULT 'USD',
  salary_period TEXT DEFAULT 'year',
  salary_display TEXT, -- formatted string e.g. "£34,500"
  visa_sponsored BOOLEAN DEFAULT false,
  visa_details TEXT,
  description TEXT,
  requirements TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  badge_type TEXT CHECK (badge_type IN ('new', 'closing_soon', 'urgent', 'high_demand', NULL)),
  is_active BOOLEAN DEFAULT true,
  posted_at TIMESTAMPTZ DEFAULT now(),
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── Job Applications (Applicant job applications with status tracking) ──
CREATE TABLE IF NOT EXISTS globalhire.job_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES globalhire.jobs(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'screening', 'interview', 'offer', 'placed', 'rejected', 'withdrawn')),
  cover_letter TEXT,
  notes TEXT,
  applied_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, applicant_id)
);

-- ── Saved Jobs (Bookmarked jobs) ──
CREATE TABLE IF NOT EXISTS globalhire.saved_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES globalhire.jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  saved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(job_id, user_id)
);

-- ── AI Recommendations (Pre-computed AI insights per user) ──
CREATE TABLE IF NOT EXISTS globalhire.ai_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('job_match', 'career_insight', 'licensing_tip', 'market_update')),
  title TEXT NOT NULL,
  description TEXT,
  action_url TEXT,
  relevance_score NUMERIC DEFAULT 0.5,
  is_read BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS idx_articles_category ON globalhire.articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published ON globalhire.articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_start ON globalhire.events(start_date);
CREATE INDEX IF NOT EXISTS idx_events_type ON globalhire.events(event_type);
CREATE INDEX IF NOT EXISTS idx_guides_category ON globalhire.guides(category);
CREATE INDEX IF NOT EXISTS idx_guides_country ON globalhire.guides(country_code);
CREATE INDEX IF NOT EXISTS idx_jobs_country ON globalhire.jobs(country_code);
CREATE INDEX IF NOT EXISTS idx_jobs_specialty ON globalhire.jobs(specialty);
CREATE INDEX IF NOT EXISTS idx_jobs_active ON globalhire.jobs(is_active, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_applications_applicant ON globalhire.job_applications(applicant_id);
CREATE INDEX IF NOT EXISTS idx_applications_job ON globalhire.job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_saved_user ON globalhire.saved_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user ON globalhire.ai_recommendations(user_id, is_read);

-- ── Public Views (for Supabase client access via ghFrom()) ──
CREATE OR REPLACE VIEW public.gh_articles AS SELECT * FROM globalhire.articles;
CREATE OR REPLACE VIEW public.gh_events AS SELECT * FROM globalhire.events;
CREATE OR REPLACE VIEW public.gh_event_registrations AS SELECT * FROM globalhire.event_registrations;
CREATE OR REPLACE VIEW public.gh_guides AS SELECT * FROM globalhire.guides;
CREATE OR REPLACE VIEW public.gh_countries AS SELECT * FROM globalhire.countries;
CREATE OR REPLACE VIEW public.gh_jobs AS SELECT * FROM globalhire.jobs;
CREATE OR REPLACE VIEW public.gh_job_applications AS SELECT * FROM globalhire.job_applications;
CREATE OR REPLACE VIEW public.gh_saved_jobs AS SELECT * FROM globalhire.saved_jobs;
CREATE OR REPLACE VIEW public.gh_ai_recommendations AS SELECT * FROM globalhire.ai_recommendations;

-- ── RLS Policies ──
ALTER TABLE globalhire.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.job_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.saved_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.ai_recommendations ENABLE ROW LEVEL SECURITY;

-- Public read access for content tables
CREATE POLICY "Public read articles" ON globalhire.articles FOR SELECT USING (true);
CREATE POLICY "Public read events" ON globalhire.events FOR SELECT USING (true);
CREATE POLICY "Public read guides" ON globalhire.guides FOR SELECT USING (true);
CREATE POLICY "Public read countries" ON globalhire.countries FOR SELECT USING (true);
CREATE POLICY "Public read jobs" ON globalhire.jobs FOR SELECT USING (is_active = true);

-- Authenticated access for user-specific tables
CREATE POLICY "Users manage own event registrations" ON globalhire.event_registrations
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own applications" ON globalhire.job_applications
  FOR ALL USING (auth.uid() = applicant_id);

CREATE POLICY "Users manage own saved jobs" ON globalhire.saved_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users read own recommendations" ON globalhire.ai_recommendations
  FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- SEED DATA
-- ============================================

-- ── Seed Countries ──
INSERT INTO globalhire.countries (code, name, region, flag_emoji, avg_salary_range, processing_time, language_requirements, healthcare_system, licensing_body, visa_difficulty, cost_of_living, work_life_balance)
VALUES
  ('gb', 'United Kingdom', 'Europe', '🇬🇧', '£28,000 – £45,000', '3-6 months', 'English (IELTS 7.0+ / OET B)', 'NHS', 'NMC', 3, 'Medium-High', '37.5h/week, 28 days leave'),
  ('us', 'United States', 'North America', '🇺🇸', '$60,000 – $120,000', '6-12 months', 'English (TOEFL / IELTS)', 'Private + Medicare/Medicaid', 'NCSBN (NCLEX)', 4, 'High', '36-40h/week, 10-15 days PTO'),
  ('ae', 'UAE', 'Gulf', '🇦🇪', 'AED 8,000 – 20,000/mo', '2-4 months', 'English', 'Mixed public/private', 'DHA / HAAD / MOH', 2, 'Medium-High', '48h/week, 30 days leave'),
  ('sa', 'Saudi Arabia', 'Gulf', '🇸🇦', 'SAR 8,000 – 25,000/mo', '2-4 months', 'English', 'MOH public system', 'SCFHS', 2, 'Medium', '48h/week, 21-30 days leave'),
  ('ca', 'Canada', 'North America', '🇨🇦', 'CAD $65,000 – $100,000', '8-14 months', 'English or French', 'Universal public', 'NNAS / Provincial', 3, 'Medium-High', '37.5h/week, 15-20 days vacation'),
  ('au', 'Australia', 'Oceania', '🇦🇺', 'AUD $70,000 – $110,000', '4-8 months', 'English (IELTS 7.0 / OET B)', 'Medicare + private', 'AHPRA', 3, 'High', '38h/week, 20 days leave'),
  ('de', 'Germany', 'Europe', '🇩🇪', '€36,000 – €58,000', '6-12 months', 'German (B2 required)', 'Statutory health insurance', 'State medical board', 4, 'Medium', '38.5h/week, 30 days leave'),
  ('qa', 'Qatar', 'Gulf', '🇶🇦', 'QAR 7,000 – 18,000/mo', '2-3 months', 'English', 'Hamad Medical Corp', 'QCHP', 2, 'Medium-High', '48h/week, 21 days leave'),
  ('ie', 'Ireland', 'Europe', '🇮🇪', '€30,000 – €55,000', '3-6 months', 'English', 'HSE public system', 'NMBI', 3, 'High', '39h/week, 20 days leave'),
  ('nz', 'New Zealand', 'Oceania', '🇳🇿', 'NZD $55,000 – $90,000', '4-6 months', 'English (IELTS 7.0)', 'Public + private', 'NCNZ', 3, 'Medium', '40h/week, 20 days leave'),
  ('sg', 'Singapore', 'Asia', '🇸🇬', 'SGD $36,000 – $72,000', '3-5 months', 'English', 'Mixed public/private', 'SNB', 3, 'High', '44h/week, 14 days leave'),
  ('kw', 'Kuwait', 'Gulf', '🇰🇼', 'KWD 350 – 1,200/mo', '2-3 months', 'English', 'MOH public system', 'MOH Kuwait', 2, 'Medium', '48h/week, 30 days leave')
ON CONFLICT (code) DO NOTHING;

-- ── Seed Sample Jobs ──
INSERT INTO globalhire.jobs (title, employer_name, employer_logo_text, employer_logo_style, country_code, city, specialty, contract_type, employment_type, salary_display, salary_currency, visa_sponsored, visa_details, tags, badge_type)
VALUES
  ('ICU Nurse — Band 5/6', 'NHS Manchester University Foundation Trust', 'NH', 'background:linear-gradient(135deg,#1a5276,#2e86c1);color:#fff', 'gb', 'Manchester', 'Nursing', 'permanent', 'full_time', '£34,500', 'GBP', true, 'Visa Sponsored', ARRAY['Critical Care', 'ICU', 'NMC Registration', 'Relocation Support'], 'urgent'),
  ('Emergency Medicine Physician', 'Cleveland Clinic Abu Dhabi', 'CC', 'background:linear-gradient(135deg,#8e44ad,#bb8fce);color:#fff', 'ae', 'Abu Dhabi', 'Physician', 'contract', 'full_time', '$185,000', 'USD', true, 'Visa + Housing', ARRAY['Emergency Medicine', 'Board Certified', 'Tax-Free', 'Family Package'], 'high_demand'),
  ('Senior Midwife', 'King Faisal Specialist Hospital', 'KF', 'background:linear-gradient(135deg,#1e8449,#2ecc71);color:#fff', 'sa', 'Riyadh', 'Midwifery', 'contract', 'full_time', '$72,000', 'USD', true, 'Visa + Flights', ARRAY['Midwifery', 'Labour & Delivery', 'Tax-Free', 'Accommodation'], 'closing_soon'),
  ('Diagnostic Radiographer', 'Toronto General Hospital — UHN', 'TG', 'background:linear-gradient(135deg,#c0392b,#e74c3c);color:#fff', 'ca', 'Toronto', 'Radiology', 'permanent', 'full_time', 'CAD $82,000', 'CAD', true, 'LMIA Support', ARRAY['Radiology', 'CT / MRI', 'PR Pathway', 'Benefits Package'], 'new'),
  ('Paediatric Nurse Specialist', 'Royal Adelaide Hospital', 'RA', 'background:linear-gradient(135deg,#2c3e50,#34495e);color:#fff', 'au', 'Adelaide', 'Nursing', 'permanent', 'full_time', 'AUD $95,000', 'AUD', true, 'Visa Sponsored', ARRAY['Paediatrics', 'NICU Experience', 'AHPRA Registration', 'Relocation Allowance'], 'urgent')
ON CONFLICT DO NOTHING;

-- ── Seed Sample Articles ──
INSERT INTO globalhire.articles (title, slug, excerpt, category, is_featured, published_at, tags)
VALUES
  ('UK Introduces Fast-Track Visa for Healthcare Workers', 'uk-fast-track-visa-2026', 'The UK government has announced a new expedited visa pathway for qualified healthcare professionals, reducing processing times by up to 50%.', 'regulatory', true, now() - interval '2 days', ARRAY['UK', 'Visa', 'Immigration']),
  ('Global Nursing Shortage Reaches Critical Levels', 'global-nursing-shortage-2026', 'WHO reports indicate a deficit of 5.9 million nurses worldwide, creating unprecedented demand for international recruitment.', 'industry', false, now() - interval '5 days', ARRAY['Nursing', 'WHO', 'Global']),
  ('From Lagos to London: Amara''s Journey to the NHS', 'amara-journey-lagos-london', 'How one Nigerian nurse navigated credentialing, relocation, and cultural adjustment to build a thriving career in the UK.', 'success_story', false, now() - interval '10 days', ARRAY['Nigeria', 'UK', 'Nursing', 'Success Story']),
  ('Gulf Healthcare Market Report Q1 2026', 'gulf-healthcare-q1-2026', 'Comprehensive analysis of hiring trends, salary benchmarks, and demand projections across UAE, Saudi Arabia, Qatar, and Kuwait.', 'market_report', false, now() - interval '7 days', ARRAY['Gulf', 'UAE', 'Saudi', 'Market Report'])
ON CONFLICT (slug) DO NOTHING;

-- ── Seed Sample Events ──
INSERT INTO globalhire.events (title, slug, description, event_type, start_date, end_date, is_virtual, is_featured, location)
VALUES
  ('GlobalHire International Nursing Recruitment Fair 2026', 'nursing-fair-2026', 'The largest virtual nursing recruitment event of 2026.', 'virtual_fair', '2026-03-15', '2026-03-16', true, true, NULL),
  ('UK NHS Recruitment Drive', 'uk-nhs-drive-2026', 'Connect with NHS trusts across England, Scotland, and Wales.', 'virtual_fair', '2026-03-22', '2026-03-22', true, false, NULL),
  ('NCLEX Preparation Masterclass', 'nclex-masterclass-2026', 'Expert-led webinar covering NCLEX-RN exam strategies.', 'webinar', '2026-03-28', '2026-03-28', true, false, NULL),
  ('Gulf Healthcare Career Summit', 'gulf-summit-2026', 'Two-day conference for healthcare professionals targeting Gulf careers.', 'conference', '2026-04-05', '2026-04-06', false, false, 'Dubai, UAE'),
  ('CV & Interview Workshop for Nurses', 'cv-workshop-2026', 'Hands-on workshop for crafting healthcare CVs and interview prep.', 'workshop', '2026-04-12', '2026-04-12', true, false, NULL),
  ('Australia AHPRA Registration Webinar', 'ahpra-webinar-2026', 'Step-by-step guide to AHPRA registration for international nurses.', 'webinar', '2026-04-18', '2026-04-18', true, false, NULL)
ON CONFLICT (slug) DO NOTHING;

-- ── Seed Sample Guides ──
INSERT INTO globalhire.guides (title, slug, excerpt, category, country_code, read_time_minutes, is_featured)
VALUES
  ('The Complete Guide to UK NMC Registration 2026', 'uk-nmc-registration-2026', 'Everything you need to know about registering with the NMC as an international nurse.', 'licensing', 'gb', 12, true),
  ('NCLEX-RN Study Guide for International Nurses', 'nclex-study-guide', 'Comprehensive preparation guide for the NCLEX-RN exam.', 'licensing', 'us', 15, false),
  ('Working in the Gulf: Complete Relocation Guide', 'gulf-relocation-guide', 'From visa processing to cultural adaptation in UAE, Saudi Arabia, and Qatar.', 'relocation', NULL, 10, false),
  ('Healthcare CV Writing That Gets Noticed', 'healthcare-cv-writing', 'Craft a compelling CV tailored for international healthcare recruitment.', 'job_hunting', NULL, 8, false),
  ('Finding Housing in a New Country', 'housing-new-country', 'Practical guide to securing accommodation before and after relocation.', 'settling_in', NULL, 6, false),
  ('Understanding Australia''s AHPRA Registration', 'ahpra-registration-guide', 'Step-by-step process for AHPRA registration and skills assessment.', 'licensing', 'au', 10, false),
  ('German Approbation: Complete Licensing Guide', 'german-approbation-guide', 'Navigate the Approbation process including language requirements and exams.', 'licensing', 'de', 14, false),
  ('Salary Negotiation for International Healthcare Roles', 'salary-negotiation-healthcare', 'How to evaluate and negotiate offers across different countries.', 'job_hunting', NULL, 7, false)
ON CONFLICT (slug) DO NOTHING;

-- ══════════════════════════════════════════════
-- SCHOLARSHIPS & FINANCIAL SUPPORT
-- ══════════════════════════════════════════════

-- ── Scholarship Programs ──
CREATE TABLE IF NOT EXISTS globalhire.scholarship_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('exam_sponsorship', 'language_support', 'relocation', 'continuing_education', 'visa_immigration')),
  max_amount_usd NUMERIC(10,2),
  duration_months INTEGER,
  destinations TEXT[] DEFAULT '{}',
  eligible_professions TEXT[] DEFAULT '{}',
  min_experience_years INTEGER DEFAULT 0,
  includes TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scholarship_programs_category ON globalhire.scholarship_programs(category);
CREATE INDEX IF NOT EXISTS idx_scholarship_programs_active ON globalhire.scholarship_programs(is_active);

-- ── Scholarship Applications ──
CREATE TABLE IF NOT EXISTS globalhire.scholarship_applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES globalhire.profiles(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES globalhire.scholarship_programs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'approved', 'disbursed', 'rejected', 'withdrawn')),
  destination_country TEXT,
  profession TEXT,
  experience_years TEXT,
  notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  disbursed_amount NUMERIC(10,2),
  disbursed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, program_id)
);

CREATE INDEX IF NOT EXISTS idx_scholarship_apps_user ON globalhire.scholarship_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_scholarship_apps_status ON globalhire.scholarship_applications(status);

-- ── Public Views ──
CREATE OR REPLACE VIEW public.gh_scholarship_programs AS
  SELECT * FROM globalhire.scholarship_programs WHERE is_active = true;

CREATE OR REPLACE VIEW public.gh_scholarship_applications AS
  SELECT * FROM globalhire.scholarship_applications;

-- ── RLS Policies ──
ALTER TABLE globalhire.scholarship_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.scholarship_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read scholarship programs" ON globalhire.scholarship_programs
  FOR SELECT USING (is_active = true);

CREATE POLICY "Users manage own scholarship applications" ON globalhire.scholarship_applications
  FOR ALL USING (auth.uid() = user_id);

-- ── Seed Scholarship Programs ──
INSERT INTO globalhire.scholarship_programs (name, slug, description, category, max_amount_usd, duration_months, destinations, eligible_professions, min_experience_years, includes, is_active, is_featured) VALUES
  ('NCLEX Exam Sponsorship', 'nclex-sponsorship', 'Full sponsorship for the NCLEX-RN examination including registration fees, study materials, and virtual training simulations.', 'exam_sponsorship', 5000.00, 6, ARRAY['USA'], ARRAY['nurse', 'midwife'], 1, ARRAY['Exam registration fees', 'Study materials & prep courses', 'Virtual clinical simulations', '1-on-1 mentor support'], true, true),
  ('English Language Exam Support', 'english-exam-support', 'Full coverage for OET or IELTS examination fees plus intensive English preparation courses.', 'language_support', 2000.00, 4, ARRAY['UK', 'Australia', 'New Zealand', 'Ireland', 'Canada'], ARRAY['nurse', 'midwife', 'physician', 'pharmacist', 'physiotherapist', 'radiologist', 'lab_tech'], 0, ARRAY['OET or IELTS exam fees', '8-week prep course access', 'Practice speaking sessions'], true, false),
  ('CBT & OSCE Exam Sponsorship', 'cbt-osce-sponsorship', 'Full coverage of NMC Computer-Based Test and OSCE clinical exam fees for UK-bound nurses.', 'exam_sponsorship', 3500.00, 5, ARRAY['UK'], ARRAY['nurse', 'midwife'], 1, ARRAY['CBT registration & test fee', 'OSCE clinical exam fee', 'NMC application fee'], true, false),
  ('Relocation Assistance Grant', 'relocation-grant', 'Financial support for travel, initial accommodation, and settling-in expenses.', 'relocation', 8000.00, NULL, ARRAY['USA', 'UK', 'UAE', 'Saudi Arabia', 'Canada', 'Australia', 'Germany', 'Qatar', 'Ireland', 'New Zealand', 'Singapore', 'Kuwait'], ARRAY['nurse', 'midwife', 'physician', 'pharmacist', 'physiotherapist', 'radiologist', 'lab_tech'], 1, ARRAY['Flight ticket coverage', 'First 2 months accommodation', 'Settling-in stipend'], true, false),
  ('Continuing Education Scholarship', 'continuing-education', 'Funding for specialty certifications, advanced courses, and professional development.', 'continuing_education', 4000.00, 12, ARRAY['USA', 'UK', 'UAE', 'Saudi Arabia', 'Canada', 'Australia', 'Germany'], ARRAY['nurse', 'midwife', 'physician', 'pharmacist', 'physiotherapist', 'radiologist', 'lab_tech'], 3, ARRAY['Specialty certification fees', 'Online course subscriptions', 'CPD/CME credit programs'], true, false),
  ('Visa & Immigration Support', 'visa-immigration-support', 'Coverage of visa application fees, immigration legal support, and documentation costs.', 'visa_immigration', 3000.00, NULL, ARRAY['USA', 'UK', 'UAE', 'Saudi Arabia', 'Canada', 'Australia', 'Germany', 'Qatar', 'Ireland', 'New Zealand', 'Singapore', 'Kuwait'], ARRAY['nurse', 'midwife', 'physician', 'pharmacist', 'physiotherapist', 'radiologist', 'lab_tech'], 0, ARRAY['Visa application fees', 'Immigration legal counsel', 'Document attestation fees'], true, false)
ON CONFLICT (slug) DO NOTHING;
