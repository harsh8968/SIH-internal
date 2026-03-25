-- =====================================================
-- SUPABASE STORAGE SETUP
-- =====================================================
-- This file contains SQL commands to set up Supabase Storage
-- for storing damage photos and repair proof images

-- 1. Create storage bucket for report images
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-images', 'report-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Set up storage policies for report-images bucket

-- Allow anyone to view images (public read)
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'report-images');

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'report-images' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to update their own images
CREATE POLICY "Users can update own images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'report-images')
WITH CHECK (bucket_id = 'report-images');

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete images"
ON storage.objects FOR DELETE
USING (bucket_id = 'report-images');

-- =====================================================
-- FOLDER STRUCTURE IN BUCKET
-- =====================================================
-- The bucket will have the following structure:
-- report-images/
--   ├── damage-photos/
--   │   ├── {reportId}_{timestamp}.jpg
--   │   └── ...
--   └── repair-proofs/
--       ├── {reportId}_{timestamp}.jpg
--       └── ...

-- =====================================================
-- NOTES
-- =====================================================
-- 1. Images are publicly accessible (good for sharing)
-- 2. Only authenticated users can upload
-- 3. File naming: {reportId}_{timestamp}.{ext}
-- 4. Supported formats: jpg, jpeg, png, webp
-- 5. Max file size: 5MB (configurable in Supabase dashboard)
