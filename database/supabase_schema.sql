-- =====================================================
-- SUPABASE DATABASE SCHEMA FOR CRACKX (RCMS)
-- =====================================================
-- Run this SQL in your Supabase SQL Editor
-- Dashboard -> SQL Editor -> New Query -> Paste and Run
--
-- This file describes a FRESH database. For a database that already exists,
-- run the migrations instead -- they are additive and safe to re-run:
--   migration_001_complaint_text.sql
--   migration_002_schema_alignment.sql
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- USERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL, -- In production, use proper password hashing
  role TEXT NOT NULL CHECK (role IN ('citizen', 'rso', 'admin', 'contractor', 'compliance_officer')),
  zone TEXT,
  is_approved BOOLEAN DEFAULT true,
  points INTEGER DEFAULT 0,
  admin_points_pool INTEGER DEFAULT 0,
  -- Links a contractor login to the agency record it acts for.
  contractor_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_zone ON users(zone);

-- =====================================================
-- REPORTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  citizen_id TEXT NOT NULL,
  reporting_mode TEXT NOT NULL CHECK (reporting_mode IN ('on-site', 'from-elsewhere')),
  location JSONB NOT NULL,
  photo_uri TEXT NOT NULL,
  video_uri TEXT,
  -- The citizen's own words. Read by classification, priority scoring and
  -- duplicate detection, so it is the input the AI features depend on.
  description TEXT,
  ai_detection JSONB,
  -- 'verification-pending' is set when a contractor has submitted repair proof
  -- and the RSO has not yet approved it.
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'verification-pending', 'completed')),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('pending', 'synced', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  repair_proof_uri TEXT,
  repair_completed_at TIMESTAMP WITH TIME ZONE,
  materials_used JSONB,
  report_approved_for_points BOOLEAN DEFAULT false,
  repair_approved_for_points BOOLEAN DEFAULT false,
  rso_id TEXT,
  citizen_rating INTEGER CHECK (citizen_rating >= 1 AND citizen_rating <= 5),
  citizen_feedback TEXT,

  -- Department routing: assigned automatically at submission from the
  -- complaint text, and overridable by an RSO during verification.
  assigned_department TEXT,
  origin_department TEXT,

  -- Verification metadata captured by the RSO.
  root_cause TEXT,
  utility_type TEXT,

  -- Work-order assignment.
  contractor_id TEXT,
  work_order_generated_at TIMESTAMP WITH TIME ZONE,
  FOREIGN KEY (citizen_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (rso_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_reports_citizen_id ON reports(citizen_id);
CREATE INDEX IF NOT EXISTS idx_reports_rso_id ON reports(rso_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_location_zone ON reports((location->>'zone'));
CREATE INDEX IF NOT EXISTS idx_reports_assigned_department ON reports(assigned_department);
CREATE INDEX IF NOT EXISTS idx_reports_contractor_id ON reports(contractor_id);

-- =====================================================
-- CONTRACTORS TABLE
-- =====================================================
-- Repair agencies an RSO can assign a verified complaint to.
CREATE TABLE IF NOT EXISTS contractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  license_number TEXT,
  -- Contractors are offered to the RSO best-rated first.
  rating NUMERIC(3, 2) DEFAULT 0,
  zone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contractors_zone ON contractors(zone);

-- =====================================================
-- NOTIFICATIONS TABLE
-- =====================================================
-- In-app notifications, also streamed to clients over Supabase Realtime.
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  -- Free-form payload, e.g. the report id the notification refers to.
  data JSONB,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- =====================================================
-- SYNC QUEUE TABLE (for offline sync tracking)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_queue (
  id SERIAL PRIMARY KEY,
  report_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  payload JSONB,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_report_id ON sync_queue(report_id);

-- =====================================================
-- POINTS TRANSACTIONS TABLE (for audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS points_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('award', 'deduct', 'transfer')),
  description TEXT,
  report_id TEXT,
  admin_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_points_transactions_user_id ON points_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_points_transactions_created_at ON points_transactions(created_at DESC);

-- =====================================================
-- UPDATED_AT TRIGGER FUNCTION
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to reports table
DROP TRIGGER IF EXISTS update_reports_updated_at ON reports;
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;

-- Users: Allow all operations for now (you can refine this later)
CREATE POLICY "Allow all operations on users" ON users
  FOR ALL USING (true) WITH CHECK (true);

-- Reports: Allow all operations for now
CREATE POLICY "Allow all operations on reports" ON reports
  FOR ALL USING (true) WITH CHECK (true);

-- Contractors: Allow all operations
CREATE POLICY "Allow all operations on contractors" ON contractors
  FOR ALL USING (true) WITH CHECK (true);

-- Notifications: Allow all operations
CREATE POLICY "Allow all operations on notifications" ON notifications
  FOR ALL USING (true) WITH CHECK (true);

-- Sync Queue: Allow all operations
CREATE POLICY "Allow all operations on sync_queue" ON sync_queue
  FOR ALL USING (true) WITH CHECK (true);

-- Points Transactions: Allow all operations
CREATE POLICY "Allow all operations on points_transactions" ON points_transactions
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- SEED DEMO DATA (All Demo Users from Constants)
-- =====================================================
-- Insert all demo users with proper roles, zones, and points
INSERT INTO users (id, username, password, role, zone, is_approved, points, admin_points_pool)
VALUES
  -- ADMIN (1 user)
  ('admin_master', 'admin', 'admin123', 'admin', NULL, true, 0, 100000),
  
  -- RSO OFFICERS (3 users)
  ('rso_rugved', 'rugved', 'rugved', 'rso', 'zone1', true, 0, 0),
  ('rso_deep', 'deep', 'deep', 'rso', 'zone4', true, 0, 0),
  ('rso_atharva', 'atharva', 'atharva', 'rso', 'zone8', true, 0, 0),
  
  -- CITIZENS (2 users)
  ('cit_arav', 'arav', 'arav', 'citizen', NULL, true, 0, 0),
  ('cit_abbas', 'abbas', 'abbas', 'citizen', NULL, true, 0, 0),
  
  -- GENERIC DEMO USER (works with any role)
  ('demo_user', 'demo', 'demo1234', 'citizen', NULL, true, 0, 0)
ON CONFLICT (username) DO NOTHING;

-- =====================================================
-- USEFUL QUERIES FOR TESTING
-- =====================================================
-- View all users
-- SELECT * FROM users ORDER BY created_at DESC;

-- View all reports
-- SELECT * FROM reports ORDER BY created_at DESC;

-- View points transactions
-- SELECT * FROM points_transactions ORDER BY created_at DESC;

-- Get reports by zone
-- SELECT * FROM reports WHERE location->>'zone' = 'zone8';

-- Get user with points
-- SELECT username, role, points, admin_points_pool FROM users WHERE username = 'arav';

-- =====================================================
-- CLEANUP (Use with caution!)
-- =====================================================
-- DROP TABLE IF EXISTS points_transactions CASCADE;
-- DROP TABLE IF EXISTS sync_queue CASCADE;
-- DROP TABLE IF EXISTS reports CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
