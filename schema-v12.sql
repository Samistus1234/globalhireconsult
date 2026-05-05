-- ============================================
-- GLOBALHIRE@ELAB — Schema v12
-- Outbound messages log for eLab Complete consultations
-- ============================================
--
-- Adds a per-message history table so the admin page can show every
-- email an admin has fired at a candidate from a consultation row
-- (e.g. document requests for International Passport, CV, etc).
--
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.elab_complete_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id uuid NOT NULL REFERENCES public.elab_complete_consultations(id) ON DELETE CASCADE,
  sent_to         text NOT NULL,
  subject         text NOT NULL,
  body            text NOT NULL,
  template_key    text,
  sent_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS elab_complete_messages_consultation_idx
  ON public.elab_complete_messages (consultation_id, sent_at DESC);

COMMENT ON TABLE  public.elab_complete_messages              IS 'Log of every admin → candidate email sent from the eLab Complete admin page';
COMMENT ON COLUMN public.elab_complete_messages.template_key IS 'Preset key the admin picked (passport, cv, education_cert, reference_letter, custom)';
COMMENT ON COLUMN public.elab_complete_messages.sent_by      IS 'Admin user who sent the message';

ALTER TABLE public.elab_complete_messages ENABLE ROW LEVEL SECURITY;

-- Admins can read all messages
DROP POLICY IF EXISTS "elab_complete_messages_admin_read" ON public.elab_complete_messages;
CREATE POLICY "elab_complete_messages_admin_read"
  ON public.elab_complete_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.gh_profiles
      WHERE gh_profiles.id = auth.uid()
        AND gh_profiles.role = 'admin'
    )
  );

-- Inserts come from the edge function (service role bypasses RLS), so
-- no INSERT policy is needed. Updates / deletes are not allowed from
-- the client.
