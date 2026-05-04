-- ============================================
-- GLOBALHIRE@ELAB — Schema v11
-- Reschedule history for eLab Complete consultations
-- ============================================
--
-- Adds an audit trail for when an admin reschedules a booking from the
-- eLab Complete admin page. The previous date/time is preserved on the
-- same row so support can see the change without a separate history table.
--
-- Run once in the Supabase SQL editor.

ALTER TABLE public.elab_complete_consultations
  ADD COLUMN IF NOT EXISTS rescheduled_from_date  text,
  ADD COLUMN IF NOT EXISTS rescheduled_from_time  text,
  ADD COLUMN IF NOT EXISTS rescheduled_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rescheduled_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reschedule_note        text;

COMMENT ON COLUMN public.elab_complete_consultations.rescheduled_from_date IS 'Original consultation_date before the most recent reschedule';
COMMENT ON COLUMN public.elab_complete_consultations.rescheduled_from_time IS 'Original consultation_time before the most recent reschedule';
COMMENT ON COLUMN public.elab_complete_consultations.rescheduled_at        IS 'When the reschedule happened';
COMMENT ON COLUMN public.elab_complete_consultations.rescheduled_by        IS 'Admin user who performed the reschedule';
COMMENT ON COLUMN public.elab_complete_consultations.reschedule_note       IS 'Optional admin-supplied reason shown to candidate';

-- If a status CHECK constraint exists and excludes "rescheduled", relax it.
-- The block below is wrapped so it is a no-op when there is no such constraint.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT con.conname INTO cname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE ns.nspname = 'public'
    AND rel.relname = 'elab_complete_consultations'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%status%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.elab_complete_consultations DROP CONSTRAINT %I', cname);
    ALTER TABLE public.elab_complete_consultations
      ADD CONSTRAINT elab_complete_consultations_status_check
      CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled', 'rescheduled'));
  END IF;
END $$;
