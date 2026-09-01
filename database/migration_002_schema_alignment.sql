-- =====================================================
-- MIGRATION 002 - Schema alignment
-- =====================================================
-- The application had been extended well past supabase_schema.sql: the live
-- database was altered by hand, the schema file was not. A fresh clone of this
-- repository therefore could not run the app -- the first report submission
-- failed on missing columns.
--
-- This brings any database up to what the code actually writes. It is
-- idempotent and safe to run on the existing live database: every statement is
-- IF NOT EXISTS or drops-then-recreates a constraint, and no data is deleted.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- =====================================================


-- -----------------------------------------------------
-- 1. REPORTS: columns the app writes
-- -----------------------------------------------------
-- Complaint text, read by classification, priority scoring and duplicate
-- detection. (Also created by migration 001; repeated here so this file alone
-- is sufficient.)
ALTER TABLE reports ADD COLUMN IF NOT EXISTS description TEXT;

-- Department routing, set automatically at submission and overridable by an RSO.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS assigned_department TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS origin_department TEXT;

-- Verification metadata captured by the RSO.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS root_cause TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS utility_type TEXT;

-- Work-order assignment.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS contractor_id TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS work_order_generated_at TIMESTAMP WITH TIME ZONE;

-- Video evidence from live detection.
ALTER TABLE reports ADD COLUMN IF NOT EXISTS video_uri TEXT;


-- -----------------------------------------------------
-- 2. REPORTS: allow the status the app actually sets
-- -----------------------------------------------------
-- ReportStatus includes 'verification-pending' (contractor has submitted proof,
-- RSO has not yet approved it) but the original CHECK rejected it, so that
-- transition failed at the database.
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE reports ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'in-progress', 'verification-pending', 'completed'));


-- -----------------------------------------------------
-- 3. USERS: allow the roles that already exist
-- -----------------------------------------------------
-- UserRole grew to include contractors and compliance officers; the CHECK did
-- not. Accounts with those roles are already present in the live database.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('citizen', 'rso', 'admin', 'contractor', 'compliance_officer'));

-- Links a contractor login to the agency record it acts for.
ALTER TABLE users ADD COLUMN IF NOT EXISTS contractor_id TEXT;


-- -----------------------------------------------------
-- 4. CONTRACTORS (table was missing entirely)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  license_number TEXT,
  -- Ordered by rating when an RSO picks who to assign.
  rating NUMERIC(3, 2) DEFAULT 0,
  zone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_zone ON contractors(zone);


-- -----------------------------------------------------
-- 5. NOTIFICATIONS (table was missing entirely)
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  -- Free-form payload, e.g. the report id a notification refers to.
  data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);


-- -----------------------------------------------------
-- 6. RLS for the new tables
-- -----------------------------------------------------
-- Matching the permissive policy the existing tables use. Tighten before any
-- real deployment: these allow anonymous read and write.
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations on contractors" ON contractors;
CREATE POLICY "Allow all operations on contractors" ON contractors
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all operations on notifications" ON notifications;
CREATE POLICY "Allow all operations on notifications" ON notifications
  FOR ALL USING (true) WITH CHECK (true);


-- -----------------------------------------------------
-- 7. Indexes for the new query paths
-- -----------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reports_assigned_department ON reports(assigned_department);
CREATE INDEX IF NOT EXISTS idx_reports_contractor_id ON reports(contractor_id);


-- -----------------------------------------------------
-- 8. Backfill description from where the app stored it
-- -----------------------------------------------------
-- Before the column existed the app wrote complaint text into the ai_detection
-- JSONB blob. Lift it into the column so older complaints display their text.
UPDATE reports
SET description = ai_detection->'management'->>'description'
WHERE description IS NULL
  AND ai_detection->'management'->>'description' IS NOT NULL;
