-- ============================================
-- GLOBALHIRE@ELAB — Schema v4
-- Applicant Opt-Out / Deactivation System
-- ============================================

-- ══════════════════════════════════════════════
-- 1. ADD AVAILABILITY COLUMNS TO PROFILES
-- ══════════════════════════════════════════════
ALTER TABLE globalhire.profiles
  ADD COLUMN IF NOT EXISTS availability_status TEXT NOT NULL DEFAULT 'active'
    CHECK (availability_status IN ('active', 'paused', 'closed')),
  ADD COLUMN IF NOT EXISTS availability_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason TEXT;

-- Index for filtering active applicants in matching
CREATE INDEX IF NOT EXISTS idx_profiles_availability
  ON globalhire.profiles(availability_status);

-- ══════════════════════════════════════════════
-- 2. ADD 'skipped' TO campaign_matches email_status
-- ══════════════════════════════════════════════
ALTER TABLE globalhire.campaign_matches
  DROP CONSTRAINT IF EXISTS campaign_matches_email_status_check;

ALTER TABLE globalhire.campaign_matches
  ADD CONSTRAINT campaign_matches_email_status_check
    CHECK (email_status IN ('pending', 'sending', 'sent', 'failed', 'bounced', 'skipped'));

-- ══════════════════════════════════════════════
-- 3. DEACTIVATE VIA TOKEN FUNCTION
-- Allows unauthenticated opt-out via email link
-- ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION globalhire.deactivate_via_token(
  p_token UUID,
  p_status TEXT DEFAULT 'closed',
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_match RECORD;
  v_profile RECORD;
BEGIN
  -- Validate status value
  IF p_status NOT IN ('paused', 'closed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid status. Must be: paused or closed');
  END IF;

  -- Find match by token to get applicant_id
  SELECT cm.applicant_id, cm.campaign_id, p.full_name
  INTO v_match
  FROM globalhire.campaign_matches cm
  JOIN globalhire.profiles p ON p.id = cm.applicant_id
  WHERE cm.response_token = p_token;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid token');
  END IF;

  -- Update the applicant profile
  UPDATE globalhire.profiles
  SET availability_status = p_status,
      availability_changed_at = now(),
      deactivation_reason = p_reason,
      updated_at = now()
  WHERE id = v_match.applicant_id;

  -- Log the deactivation event
  INSERT INTO globalhire.campaign_activity_log (campaign_id, event_type, event_data, actor_id)
  VALUES (v_match.campaign_id, 'status_changed', jsonb_build_object(
    'applicant_name', v_match.full_name,
    'new_status', p_status,
    'reason', COALESCE(p_reason, 'none'),
    'source', 'token_deactivation'
  ), v_match.applicant_id);

  RETURN jsonb_build_object(
    'success', true,
    'status', p_status,
    'applicant_name', v_match.full_name
  );
END;
$$;

-- Grant execute to anon (for unauthenticated email link clicks)
GRANT EXECUTE ON FUNCTION globalhire.deactivate_via_token(UUID, TEXT, TEXT) TO anon, authenticated, service_role;

-- ══════════════════════════════════════════════
-- 4. UPDATE run_campaign_matching() — FILTER BY ACTIVE
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
      AND p.availability_status = 'active'  -- Only match active applicants
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
-- 5. UPDATE PUBLIC VIEWS — INCLUDE availability_status
-- ══════════════════════════════════════════════

-- gh_profiles: include availability_status
CREATE OR REPLACE VIEW public.gh_profiles AS
SELECT * FROM globalhire.profiles;

-- gh_campaign_matches: include availability_status from profile join
CREATE OR REPLACE VIEW public.gh_campaign_matches AS
SELECT
  cm.*,
  p.full_name,
  p.specialty,
  p.country_of_origin,
  p.years_of_experience,
  p.preferred_destinations,
  p.avatar_initials,
  p.avatar_color_index,
  p.availability_status
FROM globalhire.campaign_matches cm
JOIN globalhire.profiles p ON p.id = cm.applicant_id;

-- admin_applicant_overview: include availability_status
CREATE OR REPLACE VIEW public.gh_admin_applicant_overview AS
SELECT
  p.*,
  u.email,
  COALESCE(d.total_docs, 0) AS total_docs
FROM globalhire.profiles p
LEFT JOIN auth.users u ON u.id = p.id
LEFT JOIN (
  SELECT applicant_id, COUNT(*) AS total_docs
  FROM globalhire.documents
  GROUP BY applicant_id
) d ON d.applicant_id = p.id
WHERE p.role = 'applicant';

-- Recreate other views unchanged
CREATE OR REPLACE VIEW public.gh_campaigns AS
SELECT * FROM globalhire.campaigns;

CREATE OR REPLACE VIEW public.gh_campaign_activity_log AS
SELECT * FROM globalhire.campaign_activity_log;

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
