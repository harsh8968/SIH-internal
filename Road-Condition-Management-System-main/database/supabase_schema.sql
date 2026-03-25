-- =====================================================
-- SUPABASE DATABASE SCHEMA FOR CRACKX (RCMS)
-- =====================================================
-- Run this SQL in your Supabase SQL Editor
-- Dashboard -> SQL Editor -> New Query -> Paste and Run
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
  role TEXT NOT NULL CHECK (role IN ('citizen', 'rso', 'admin')),
  zone TEXT,
  is_approved BOOLEAN DEFAULT true,
  points INTEGER DEFAULT 0,
  admin_points_pool INTEGER DEFAULT 0,
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
  ai_detection JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending', 'in-progress', 'completed')),
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
  user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid(), -- Ownership for RLS
  FOREIGN KEY (citizen_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (rso_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_reports_citizen_id ON reports(citizen_id);
CREATE INDEX IF NOT EXISTS idx_reports_rso_id ON reports(rso_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_location_zone ON reports((location->>'zone'));

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
  user_id_auth UUID REFERENCES auth.users(id) DEFAULT auth.uid(), -- Auth link for security
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
-- CONTRACTORS TABLE (New secure table)
-- =====================================================
CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  name TEXT NOT NULL,
  agency_name TEXT NOT NULL,
  license_number TEXT,
  rating FLOAT DEFAULT 4.5,
  zone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_contractors_user_id ON contractors(user_id);
CREATE INDEX IF NOT EXISTS idx_contractors_zone ON contractors(zone);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------
-- USERS Table Policies
-- -----------------------------------------------------
-- Allow users to see their own profile
DROP POLICY IF EXISTS "Allow all operations on users" ON users;
CREATE POLICY "Users can see their own profile" ON users
  FOR SELECT USING (auth.uid()::text = id OR auth.jwt()->>'role' = 'service_role');

-- Allow admins to see all users
CREATE POLICY "Admins see all users" ON users
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()::text) = 'admin'
  );

-- -----------------------------------------------------
-- REPORTS Table Policies
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on reports" ON reports;

-- SELECT/READ: Users see only their own data (Citizens) OR assigned data (RSOs) OR all data (Admins)
CREATE POLICY "Citizens see only their own reports" ON reports
  FOR SELECT USING (auth.uid()::text = citizen_id);

CREATE POLICY "RSOs see reports in their zone" ON reports
  FOR SELECT USING (
    (SELECT zone FROM users WHERE id = auth.uid()::text) = (location->>'zone')
  );

CREATE POLICY "Admins see all reports" ON reports
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()::text) = 'admin'
  );

-- INSERT: Only authenticated users can insert their own data
CREATE POLICY "Authenticated users can insert reports" ON reports
  FOR INSERT WITH CHECK (auth.uid()::text = citizen_id);

-- UPDATE/DELETE: Only owner or admin
CREATE POLICY "Owners can update reports" ON reports
  FOR UPDATE USING (auth.uid()::text = citizen_id OR (SELECT role FROM users WHERE id = auth.uid()::text) = 'admin');

CREATE POLICY "Owners can delete reports" ON reports
  FOR DELETE USING (auth.uid()::text = citizen_id OR (SELECT role FROM users WHERE id = auth.uid()::text) = 'admin');

-- -----------------------------------------------------
-- CONTRACTORS Table Policies
-- -----------------------------------------------------
CREATE POLICY "Contractors can work with their own profile" ON contractors
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "RSOs can see contractors for assignment" ON contractors
  FOR SELECT USING (
    (SELECT role FROM users WHERE id = auth.uid()::text) IN ('rso', 'admin')
  );

-- -----------------------------------------------------
-- Sync Queue: Keep restricted to authenticated user's own items
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on sync_queue" ON sync_queue;
CREATE POLICY "Users see own sync queue" ON sync_queue
  FOR ALL USING (
    EXISTS (SELECT 1 FROM reports WHERE reports.id = report_id AND reports.citizen_id = auth.uid()::text)
  );

-- -----------------------------------------------------
-- Points Transactions: Restricted
-- -----------------------------------------------------
DROP POLICY IF EXISTS "Allow all operations on points_transactions" ON points_transactions;
CREATE POLICY "Users see own points transactions" ON points_transactions
  FOR SELECT USING (auth.uid()::text = user_id);

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
