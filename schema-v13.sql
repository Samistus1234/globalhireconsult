-- ============================================
-- GLOBALHIRE@ELAB — Schema v13
-- Per-consultation document counts (admin RPC)
-- ============================================
--
-- Adds a SECURITY DEFINER function that lets the eLab Complete admin
-- page show, for each consultation row, how many documents the
-- candidate has uploaded into their GlobalHire portal — joined by
-- email since elab_complete_consultations does not store the
-- candidate's auth.users id.
--
-- Run once in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.gh_admin_consultation_doc_counts()
RETURNS TABLE (
  consultation_id uuid,
  document_count  integer,
  last_upload_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, globalhire
AS $$
BEGIN
  -- Admin gate: only admins can call this RPC
  IF NOT EXISTS (
    SELECT 1 FROM public.gh_profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  RETURN QUERY
    SELECT
      c.id              AS consultation_id,
      COUNT(d.id)::int  AS document_count,
      MAX(d.uploaded_at) AS last_upload_at
    FROM public.elab_complete_consultations c
    LEFT JOIN auth.users u
      ON LOWER(u.email) = LOWER(c.email)
    LEFT JOIN globalhire.documents d
      ON d.applicant_id = u.id
    GROUP BY c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gh_admin_consultation_doc_counts() TO authenticated;

COMMENT ON FUNCTION public.gh_admin_consultation_doc_counts IS
  'Admin-only. Returns one row per eLab Complete consultation with how many documents the candidate has uploaded into the portal (joined by email).';
