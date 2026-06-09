-- schema-v17-riyadh-nurses-campaign.sql
-- Create the "Female Nurses — Private Hospital, Riyadh" campaign and match it to
-- all active registered nurses so the opportunity appears in their portal
-- (Opportunities tab). No salary stored (salary_display NULL → portal shows none).
-- Run in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix.

WITH nc AS (
  INSERT INTO globalhire.campaigns
    (title, specialty, destination_country, min_experience, positions, employer_name, visa_sponsored, description, status)
  VALUES
    ('Female Nurses — Private Hospital, Riyadh', 'General Nursing', 'Saudi Arabia', 0, 20,
     'Private Hospital — Riyadh', true,
     'A leading private hospital in Riyadh, Saudi Arabia is hiring female nurses now. Accommodation is provided. Priority for nurses who already hold Mumaris registration or a Saudi Council licence. ELAB manages Mumaris / Saudi Council licensing, DataFlow verification, visa sponsorship and relocation. Open to female applicants only.',
     'review')
  RETURNING id
),
ins AS (
  INSERT INTO globalhire.campaign_matches
    (campaign_id, applicant_id, match_score, match_reasons, email_status)
  SELECT
    nc.id, p.id,
    40
      + CASE WHEN 'Saudi Arabia' = ANY(p.preferred_destinations) THEN 25 ELSE 0 END
      + CASE WHEN p.profile_completed THEN 10 ELSE 0 END
      + CASE WHEN COALESCE(p.years_of_experience,0) >= 1 THEN 20 ELSE 0 END,
    jsonb_build_array(
      jsonb_build_object('criterion','specialty','detail', p.specialty),
      jsonb_build_object('criterion','role','detail','Nursing — Riyadh, Saudi Arabia')
    ),
    'pending'
  FROM nc CROSS JOIN globalhire.profiles p
  WHERE p.role = 'applicant'
    AND p.specialty ILIKE '%nurs%'
    AND COALESCE(p.availability_status, 'active') = 'active'
  RETURNING campaign_id
)
UPDATE globalhire.campaigns c
SET matched_count = (SELECT count(*) FROM ins), updated_at = now()
WHERE c.id = (SELECT id FROM nc)
RETURNING c.id, c.title, c.status, c.matched_count;
