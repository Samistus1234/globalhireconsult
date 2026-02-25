-- ============================================
-- GLOBALHIRE@ELAB — Schema v3
-- Campaign Matching & Outreach Pipeline
-- ============================================

-- Ensure schema exists
CREATE SCHEMA IF NOT EXISTS globalhire;

-- ══════════════════════════════════════════════
-- 1. CAMPAIGNS TABLE
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  specialty TEXT NOT NULL,
  destination_country TEXT NOT NULL,
  min_experience INTEGER DEFAULT 0,
  positions INTEGER DEFAULT 1,
  salary_display TEXT,
  employer_name TEXT,
  visa_sponsored BOOLEAN DEFAULT false,
  description TEXT,
  job_id UUID REFERENCES globalhire.jobs(id) ON DELETE SET NULL,

  -- Lifecycle: draft → matching → review → sending → active → closed
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'matching', 'review', 'sending', 'active', 'closed')),

  -- Aggregate counters (updated by triggers/functions)
  matched_count INTEGER DEFAULT 0,
  contacted_count INTEGER DEFAULT 0,
  interested_count INTEGER DEFAULT 0,
  declined_count INTEGER DEFAULT 0,
  maybe_later_count INTEGER DEFAULT 0,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════
-- 2. CAMPAIGN MATCHES TABLE
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.campaign_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES globalhire.campaigns(id) ON DELETE CASCADE,
  applicant_id UUID NOT NULL REFERENCES globalhire.profiles(id) ON DELETE CASCADE,

  -- Matching
  match_score INTEGER DEFAULT 0 CHECK (match_score BETWEEN 0 AND 100),
  match_reasons JSONB DEFAULT '[]',

  -- Email delivery
  email_status TEXT DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'bounced')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,

  -- Response
  response TEXT CHECK (response IN ('interested', 'declined', 'maybe_later', NULL)),
  response_note TEXT,
  response_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  token_expires_at TIMESTAMPTZ DEFAULT (now() + interval '14 days'),
  responded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(campaign_id, applicant_id)
);

-- ══════════════════════════════════════════════
-- 3. CAMPAIGN ACTIVITY LOG TABLE
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS globalhire.campaign_activity_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES globalhire.campaigns(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('created', 'matching_started', 'matching_completed', 'emails_sending', 'emails_sent', 'response_received', 'status_changed', 'closed', 'reopened')),
  event_data JSONB DEFAULT '{}',
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ══════════════════════════════════════════════
-- 4. INDEXES
-- ══════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON globalhire.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_by ON globalhire.campaigns(created_by);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON globalhire.campaigns(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campaign_matches_campaign ON globalhire.campaign_matches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_matches_applicant ON globalhire.campaign_matches(applicant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_matches_token ON globalhire.campaign_matches(response_token);
CREATE INDEX IF NOT EXISTS idx_campaign_matches_response ON globalhire.campaign_matches(response);
CREATE INDEX IF NOT EXISTS idx_campaign_matches_email ON globalhire.campaign_matches(email_status);

CREATE INDEX IF NOT EXISTS idx_campaign_activity_campaign ON globalhire.campaign_activity_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_activity_created ON globalhire.campaign_activity_log(created_at DESC);

-- ══════════════════════════════════════════════
-- 5. UPDATED_AT TRIGGERS
-- ══════════════════════════════════════════════
CREATE TRIGGER gh_campaigns_updated_at
  BEFORE UPDATE ON globalhire.campaigns
  FOR EACH ROW EXECUTE FUNCTION globalhire.update_updated_at();

CREATE TRIGGER gh_campaign_matches_updated_at
  BEFORE UPDATE ON globalhire.campaign_matches
  FOR EACH ROW EXECUTE FUNCTION globalhire.update_updated_at();

-- ══════════════════════════════════════════════
-- 6. RUN CAMPAIGN MATCHING FUNCTION
-- Rule-based SQL matching:
--   Specialty match:        40 pts
--   Destination preference: 25 pts
--   Experience:             20 pts
--   Profile completeness:   10 pts
--   Verified docs:           5 pts
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION globalhire.run_campaign_matching(p_campaign_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign RECORD;
  v_matched INTEGER := 0;
BEGIN
  -- Get campaign details
  SELECT * INTO v_campaign
  FROM globalhire.campaigns
  WHERE id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found: %', p_campaign_id;
  END IF;

  -- Update campaign status to matching
  UPDATE globalhire.campaigns
  SET status = 'matching', updated_at = now()
  WHERE id = p_campaign_id;

  -- Log matching start
  INSERT INTO globalhire.campaign_activity_log (campaign_id, event_type, event_data)
  VALUES (p_campaign_id, 'matching_started', jsonb_build_object('specialty', v_campaign.specialty, 'destination', v_campaign.destination_country));

  -- Delete existing uncontacted matches (allow re-running)
  DELETE FROM globalhire.campaign_matches
  WHERE campaign_id = p_campaign_id AND email_status = 'pending' AND response IS NULL;

  -- Insert matched applicants with scores
  WITH scored AS (
    SELECT
      p.id AS applicant_id,
      -- Specialty match (40 pts): exact or partial
      CASE
        WHEN LOWER(p.specialty) = LOWER(v_campaign.specialty) THEN 40
        WHEN LOWER(p.specialty) LIKE '%' || LOWER(SPLIT_PART(v_campaign.specialty, ' ', 1)) || '%' THEN 20
        ELSE 0
      END AS specialty_score,
      -- Destination preference (25 pts)
      CASE
        WHEN v_campaign.destination_country = ANY(p.preferred_destinations) THEN 25
        ELSE 0
      END AS destination_score,
      -- Experience (20 pts)
      CASE
        WHEN COALESCE(p.years_of_experience, 0) >= COALESCE(v_campaign.min_experience, 0) THEN 20
        WHEN COALESCE(p.years_of_experience, 0) >= COALESCE(v_campaign.min_experience, 0) - 1 THEN 10
        ELSE 0
      END AS experience_score,
      -- Profile completeness (10 pts)
      CASE WHEN p.profile_completed THEN 10 ELSE 0 END AS profile_score,
      -- Verified docs (5 pts)
      CASE
        WHEN EXISTS (
          SELECT 1 FROM globalhire.documents d
          WHERE d.applicant_id = p.id AND d.status = 'verified'
        ) THEN 5
        ELSE 0
      END AS docs_score,
      p.specialty,
      p.years_of_experience,
      p.preferred_destinations,
      p.profile_completed
    FROM globalhire.profiles p
    WHERE p.role = 'applicant'
      AND p.profile_completed = true
      -- Must not already be matched (with sent email or response)
      AND NOT EXISTS (
        SELECT 1 FROM globalhire.campaign_matches cm
        WHERE cm.campaign_id = p_campaign_id
          AND cm.applicant_id = p.id
          AND (cm.email_status != 'pending' OR cm.response IS NOT NULL)
      )
  )
  INSERT INTO globalhire.campaign_matches (campaign_id, applicant_id, match_score, match_reasons)
  SELECT
    p_campaign_id,
    s.applicant_id,
    s.specialty_score + s.destination_score + s.experience_score + s.profile_score + s.docs_score,
    jsonb_build_array(
      jsonb_build_object('criterion', 'specialty', 'score', s.specialty_score, 'max', 40, 'detail', s.specialty),
      jsonb_build_object('criterion', 'destination', 'score', s.destination_score, 'max', 25, 'detail', COALESCE(array_to_string(s.preferred_destinations, ', '), 'none set')),
      jsonb_build_object('criterion', 'experience', 'score', s.experience_score, 'max', 20, 'detail', COALESCE(s.years_of_experience, 0) || ' years'),
      jsonb_build_object('criterion', 'profile', 'score', s.profile_score, 'max', 10, 'detail', CASE WHEN s.profile_completed THEN 'complete' ELSE 'incomplete' END),
      jsonb_build_object('criterion', 'documents', 'score', s.docs_score, 'max', 5, 'detail', CASE WHEN s.docs_score > 0 THEN 'verified docs' ELSE 'no verified docs' END)
    )
  FROM scored s
  WHERE (s.specialty_score + s.destination_score + s.experience_score + s.profile_score + s.docs_score) >= 20
  ORDER BY (s.specialty_score + s.destination_score + s.experience_score + s.profile_score + s.docs_score) DESC;

  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- Update campaign counters and status
  UPDATE globalhire.campaigns
  SET matched_count = (
        SELECT COUNT(*) FROM globalhire.campaign_matches WHERE campaign_id = p_campaign_id
      ),
      status = 'review',
      updated_at = now()
  WHERE id = p_campaign_id;

  -- Log matching complete
  INSERT INTO globalhire.campaign_activity_log (campaign_id, event_type, event_data)
  VALUES (p_campaign_id, 'matching_completed', jsonb_build_object('new_matches', v_matched, 'total_matches', (
    SELECT COUNT(*) FROM globalhire.campaign_matches WHERE campaign_id = p_campaign_id
  )));

  RETURN v_matched;
END;
$$;

-- ══════════════════════════════════════════════
-- 7. RESPOND VIA TOKEN FUNCTION
-- Allows unauthenticated response via email link
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION globalhire.respond_via_token(
  p_token UUID,
  p_response TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_campaign RECORD;
BEGIN
  -- Validate response value
  IF p_response NOT IN ('interested', 'declined', 'maybe_later') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid response. Must be: interested, declined, or maybe_later');
  END IF;

  -- Find the match by token
  SELECT cm.*, p.full_name, p.specialty
  INTO v_match
  FROM globalhire.campaign_matches cm
  JOIN globalhire.profiles p ON p.id = cm.applicant_id
  WHERE cm.response_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired token');
  END IF;

  -- Check token expiry
  IF v_match.token_expires_at < now() THEN
    RETURN jsonb_build_object('success', false, 'error', 'This link has expired. Please log in to your portal to respond.');
  END IF;

  -- Check if already responded
  IF v_match.response IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'You have already responded to this opportunity', 'previous_response', v_match.response);
  END IF;

  -- Get campaign details
  SELECT * INTO v_campaign
  FROM globalhire.campaigns
  WHERE id = v_match.campaign_id;

  -- Update the match with response
  UPDATE globalhire.campaign_matches
  SET response = p_response,
      response_note = p_note,
      responded_at = now(),
      updated_at = now()
  WHERE id = v_match.id;

  -- Recalculate campaign counters
  UPDATE globalhire.campaigns
  SET interested_count = (
        SELECT COUNT(*) FROM globalhire.campaign_matches
        WHERE campaign_id = v_match.campaign_id AND response = 'interested'
      ),
      declined_count = (
        SELECT COUNT(*) FROM globalhire.campaign_matches
        WHERE campaign_id = v_match.campaign_id AND response = 'declined'
      ),
      maybe_later_count = (
        SELECT COUNT(*) FROM globalhire.campaign_matches
        WHERE campaign_id = v_match.campaign_id AND response = 'maybe_later'
      ),
      updated_at = now()
  WHERE id = v_match.campaign_id;

  -- Log response
  INSERT INTO globalhire.campaign_activity_log (campaign_id, event_type, event_data, actor_id)
  VALUES (v_match.campaign_id, 'response_received', jsonb_build_object(
    'applicant_name', v_match.full_name,
    'response', p_response,
    'match_score', v_match.match_score
  ), v_match.applicant_id);

  RETURN jsonb_build_object(
    'success', true,
    'response', p_response,
    'campaign', jsonb_build_object(
      'title', v_campaign.title,
      'employer', v_campaign.employer_name,
      'destination', v_campaign.destination_country,
      'salary', v_campaign.salary_display,
      'visa_sponsored', v_campaign.visa_sponsored
    )
  );
END;
$$;

-- ══════════════════════════════════════════════
-- 8. PUBLIC WRAPPER VIEWS
-- ══════════════════════════════════════════════

-- Campaigns view (admin-facing)
CREATE OR REPLACE VIEW public.gh_campaigns AS
SELECT * FROM globalhire.campaigns;

-- Campaign matches view (admin-facing)
CREATE OR REPLACE VIEW public.gh_campaign_matches AS
SELECT
  cm.*,
  p.full_name,
  p.specialty,
  p.country_of_origin,
  p.years_of_experience,
  p.preferred_destinations,
  p.avatar_initials,
  p.avatar_color_index
FROM globalhire.campaign_matches cm
JOIN globalhire.profiles p ON p.id = cm.applicant_id;

-- Campaign activity log view
CREATE OR REPLACE VIEW public.gh_campaign_activity_log AS
SELECT * FROM globalhire.campaign_activity_log;

-- Applicant-facing: my matched opportunities
CREATE OR REPLACE VIEW public.gh_my_opportunities AS
SELECT
  cm.id AS match_id,
  cm.campaign_id,
  cm.match_score,
  cm.match_reasons,
  cm.response,
  cm.response_note,
  cm.responded_at,
  cm.email_status,
  cm.applicant_id,
  c.title,
  c.specialty,
  c.destination_country,
  c.salary_display,
  c.employer_name,
  c.visa_sponsored,
  c.description,
  c.positions,
  c.status AS campaign_status,
  c.created_at AS campaign_created_at
FROM globalhire.campaign_matches cm
JOIN globalhire.campaigns c ON c.id = cm.campaign_id
WHERE c.status IN ('active', 'review', 'sending');

-- ══════════════════════════════════════════════
-- 9. RLS POLICIES
-- ══════════════════════════════════════════════
ALTER TABLE globalhire.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.campaign_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE globalhire.campaign_activity_log ENABLE ROW LEVEL SECURITY;

-- Campaigns: Admins full access
CREATE POLICY "gh_admins_manage_campaigns"
  ON globalhire.campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Campaign matches: Admins full access
CREATE POLICY "gh_admins_manage_matches"
  ON globalhire.campaign_matches FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Campaign matches: Applicants read own matches
CREATE POLICY "gh_applicants_read_own_matches"
  ON globalhire.campaign_matches FOR SELECT
  USING (applicant_id = auth.uid());

-- Campaign matches: Allow token-based updates via SECURITY DEFINER function
-- (respond_via_token runs as SECURITY DEFINER so it bypasses RLS)

-- Activity log: Admins read all
CREATE POLICY "gh_admins_read_activity"
  ON globalhire.campaign_activity_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Activity log: Admins insert
CREATE POLICY "gh_admins_insert_activity"
  ON globalhire.campaign_activity_log FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ══════════════════════════════════════════════
-- 10. GRANT PERMISSIONS
-- ══════════════════════════════════════════════
GRANT USAGE ON SCHEMA globalhire TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.campaigns TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON globalhire.campaign_matches TO authenticated, service_role;
GRANT SELECT, INSERT ON globalhire.campaign_activity_log TO authenticated, service_role;

-- Allow anon to execute token response function (for email click-through)
GRANT EXECUTE ON FUNCTION globalhire.respond_via_token(UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION globalhire.run_campaign_matching(UUID) TO authenticated, service_role;

-- ══════════════════════════════════════════════
-- 11. SEED DATA (Test Campaign)
-- ══════════════════════════════════════════════
-- Uncomment to insert test data:
-- INSERT INTO globalhire.campaigns (title, specialty, destination_country, min_experience, positions, salary_display, employer_name, visa_sponsored, description, status)
-- VALUES (
--   'ICU Nurses for King Faisal Medical City',
--   'ICU / Critical Care Nursing',
--   'Saudi Arabia',
--   3,
--   15,
--   'SAR 12,000/mo',
--   'King Faisal Medical City',
--   true,
--   'Urgent requirement for 15 experienced ICU nurses. Competitive tax-free salary, accommodation provided, annual flights, and family visa support.',
--   'draft'
-- );
