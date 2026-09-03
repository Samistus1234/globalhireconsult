-- schema-v32-mp-ai-runs.sql
BEGIN;

CREATE TABLE globalhire.mp_ai_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature            text NOT NULL CHECK (feature IN ('parse','match','screen','draft','dedupe_tiebreak')),
  context_id         text,
  agency_id          uuid,
  model              text,
  prompt_tokens      int,
  completion_tokens  int,
  cost_usd           numeric(10,5),
  latency_ms         int,
  status             text NOT NULL CHECK (status IN ('ok','error')),
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mp_ai_runs_feature_created_idx ON globalhire.mp_ai_runs (feature, created_at DESC);

ALTER TABLE globalhire.mp_ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY mp_ai_runs_admin_only ON globalhire.mp_ai_runs
  FOR SELECT TO authenticated USING (globalhire.is_admin());
-- Inserts are service-role only (mp-ai.ts) → no authenticated INSERT policy.

CREATE VIEW public.gh_mp_ai_runs WITH (security_invoker = true) AS
  SELECT * FROM globalhire.mp_ai_runs;
GRANT SELECT ON globalhire.mp_ai_runs TO authenticated;
GRANT SELECT ON public.gh_mp_ai_runs TO authenticated;

COMMIT;
