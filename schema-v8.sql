-- schema-v8.sql — Job alert subscribers
-- Run this in the Supabase SQL editor for project evzhnsugmvtqgmvzwyix

CREATE TABLE IF NOT EXISTS globalhire.job_alert_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  specialty_interest TEXT,
  is_active BOOLEAN DEFAULT true,
  subscribed_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT job_alert_subscribers_email_unique UNIQUE (email)
);

-- Allow anonymous inserts (public signup form)
ALTER TABLE globalhire.job_alert_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to job alerts"
  ON globalhire.job_alert_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read subscribers
CREATE POLICY "Admins can read subscribers"
  ON globalhire.job_alert_subscribers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM globalhire.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE globalhire.job_alert_subscribers IS 'Public signup for job opportunity email alerts';
