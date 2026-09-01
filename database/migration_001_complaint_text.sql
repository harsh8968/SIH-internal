-- =====================================================
-- MIGRATION 001 - Complaint text
-- =====================================================
-- Adds the free-text complaint body that the classification,
-- priority-scoring and semantic-duplicate features read.
--
-- Safe to run more than once. Safe to run on a live database:
-- the column is nullable, so every existing report stays valid.
--
-- Run in: Supabase Dashboard -> SQL Editor -> New Query
-- =====================================================

ALTER TABLE reports ADD COLUMN IF NOT EXISTS description TEXT;

-- Backfill from the JSONB blob the app writes to, so reports filed
-- before this column existed still show their text.
UPDATE reports
SET description = ai_detection->'management'->>'description'
WHERE description IS NULL
  AND ai_detection->'management'->>'description' IS NOT NULL;
