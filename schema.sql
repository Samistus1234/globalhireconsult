-- ============================================
-- GLOBALHIRE@ELAB — Supabase Database Schema
-- Isolated in `globalhire` schema to avoid
-- conflicts with existing public.* tables
-- Run this in Supabase SQL Editor
-- ============================================

-- ── 0. Create dedicated schema ──
CREATE SCHEMA IF NOT EXISTS globalhire;

-- Grant usage so Supabase roles can access it
GRANT USAGE ON SCHEMA globalhire TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA globalhire
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;

-- Expose via PostgREST (Supabase API)
-- NOTE: Run this in Dashboard > Settings > API > Exposed schemas
-- Or uncomment below if you have superuser access:
-- ALTER ROLE authenticator SET pgrst.db_schemas = 'public, globalhire';
-- NOTIFY pgrst, 'reload config';

-- ── 1. Profiles Table (extends auth.users) ──
CREATE TABLE globalhire.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'applicant' CHECK (role IN ('applicant', 'admin')),
  full_name TEXT,
  phone TEXT,
  specialty TEXT,
  specialty_detail TEXT,
  country_of_origin TEXT,
  years_of_experience INTEGER,
  license_number TEXT,
  preferred_destinations TEXT[] DEFAULT '{}',
  profile_completed BOOLEAN DEFAULT FALSE,
  avatar_initials TEXT,
  avatar_color_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE globalhire.profiles ENABLE ROW LEVEL SECURITY;

-- ── 2. Documents Table ──
CREATE TABLE globalhire.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES globalhire.profiles(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('license', 'degree', 'passport', 'cv')),
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'in_review')),
  reviewer_notes TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE globalhire.documents ENABLE ROW LEVEL SECURITY;

-- ── 3. Triggers ──

-- Auto-create globalhire profile on user signup
CREATE OR REPLACE FUNCTION globalhire.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO globalhire.profiles (id, full_name, avatar_initials, avatar_color_index)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    UPPER(
      COALESCE(
        NULLIF(
          LEFT(COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 1) ||
          COALESCE(
            SUBSTRING(
              NEW.raw_user_meta_data->>'full_name'
              FROM POSITION(' ' IN COALESCE(NEW.raw_user_meta_data->>'full_name','  ')) + 1
              FOR 1
            ), ''
          ),
          ''
        ),
        UPPER(LEFT(SPLIT_PART(NEW.email, '@', 1), 2))
      )
    ),
    FLOOR(RANDOM() * 6)::INT
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Use a unique trigger name to avoid conflicts
CREATE TRIGGER gh_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION globalhire.handle_new_user();

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION globalhire.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gh_profiles_updated_at
  BEFORE UPDATE ON globalhire.profiles
  FOR EACH ROW EXECUTE FUNCTION globalhire.update_updated_at();

-- ── 4. Admin Applicant Overview View ──
CREATE OR REPLACE VIEW globalhire.admin_applicant_overview AS
SELECT
  p.id,
  p.full_name,
  p.role,
  p.specialty,
  p.country_of_origin,
  p.years_of_experience,
  p.license_number,
  p.preferred_destinations,
  p.profile_completed,
  p.avatar_initials,
  p.avatar_color_index,
  p.phone,
  p.created_at,
  p.updated_at,
  u.email,
  COALESCE(dc.total_docs, 0) AS total_docs,
  COALESCE(dc.verified_docs, 0) AS verified_docs,
  COALESCE(dc.pending_docs, 0) AS pending_docs,
  CASE
    WHEN COALESCE(dc.total_docs, 0) = 0 THEN 'applied'
    WHEN p.profile_completed = FALSE THEN 'screening'
    WHEN COALESCE(dc.pending_docs, 0) > 0 OR COALESCE(dc.inreview_docs, 0) > 0 THEN 'verifying'
    WHEN COALESCE(dc.verified_docs, 0) = COALESCE(dc.total_docs, 0) AND dc.total_docs > 0 THEN 'verified'
    ELSE 'screening'
  END AS pipeline_status
FROM globalhire.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN (
  SELECT
    applicant_id,
    COUNT(*) AS total_docs,
    COUNT(*) FILTER (WHERE status = 'verified') AS verified_docs,
    COUNT(*) FILTER (WHERE status = 'pending') AS pending_docs,
    COUNT(*) FILTER (WHERE status = 'in_review') AS inreview_docs
  FROM globalhire.documents
  GROUP BY applicant_id
) dc ON dc.applicant_id = p.id
WHERE p.role = 'applicant';

-- ── 5. RLS Policies ──

-- Profiles: Users can read own profile
CREATE POLICY "gh_users_read_own_profile"
  ON globalhire.profiles FOR SELECT
  USING (auth.uid() = id);

-- Profiles: Users can update own profile
CREATE POLICY "gh_users_update_own_profile"
  ON globalhire.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Profiles: Admins can read all profiles
CREATE POLICY "gh_admins_read_all_profiles"
  ON globalhire.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Documents: Applicants read own documents
CREATE POLICY "gh_applicants_read_own_docs"
  ON globalhire.documents FOR SELECT
  USING (applicant_id = auth.uid());

-- Documents: Applicants insert own documents
CREATE POLICY "gh_applicants_insert_own_docs"
  ON globalhire.documents FOR INSERT
  WITH CHECK (applicant_id = auth.uid());

-- Documents: Applicants delete own documents
CREATE POLICY "gh_applicants_delete_own_docs"
  ON globalhire.documents FOR DELETE
  USING (applicant_id = auth.uid());

-- Documents: Admins read all documents
CREATE POLICY "gh_admins_read_all_docs"
  ON globalhire.documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Documents: Admins update all documents (verify/reject)
CREATE POLICY "gh_admins_update_all_docs"
  ON globalhire.documents FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 6. Storage Bucket (prefixed to avoid conflicts) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gh-applicant-documents',
  'gh-applicant-documents',
  FALSE,
  10485760, -- 10MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage: Applicants upload to their own folder
CREATE POLICY "gh_applicants_upload_own_files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Storage: Applicants read their own files
CREATE POLICY "gh_applicants_read_own_files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Storage: Applicants delete their own files
CREATE POLICY "gh_applicants_delete_own_files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'gh-applicant-documents'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- Storage: Admins read all files
CREATE POLICY "gh_admins_read_all_files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'gh-applicant-documents'
    AND EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 7. IMPORTANT: Expose the schema via PostgREST ──
-- You MUST add 'globalhire' to the exposed schemas in Supabase:
-- Dashboard > Project Settings > API > Data API Settings > Exposed schemas
-- Add: globalhire
-- This allows the JS client to query: supabase.schema('globalhire').from('profiles')...
