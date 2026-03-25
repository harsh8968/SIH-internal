-- =====================================================
-- DELETE ALL REPORTS
-- =====================================================
-- This script will wipe all reports from the database.
-- Use with caution!

-- 1. Delete all reports
TRUNCATE TABLE reports CASCADE;

-- 2. Clear sync queue (optional, but good for cleanup)
TRUNCATE TABLE sync_queue;

-- 3. Reset points transactions related to reports (optional)
-- DELETE FROM points_transactions WHERE description LIKE '%Report%';

-- Note: This does NOT delete users.
