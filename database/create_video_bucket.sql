-- =====================================================
-- SUPABASE STORAGE SETUP FOR VIDEOS
-- =====================================================

-- 1. Create storage bucket for report videos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('report-videos', 'report-videos', true, 52428800, ARRAY['video/mp4', 'video/quicktime']) -- 50MB limit
ON CONFLICT (id) DO NOTHING;

-- 2. Set up storage policies for report-videos bucket

-- Allow anyone to view videos (public read)
CREATE POLICY "Public Video Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'report-videos');

-- Allow authenticated users to upload videos
CREATE POLICY "Authenticated users can upload videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'report-videos' 
  AND auth.role() = 'authenticated'
);

-- Allow authenticated users to delete videos
CREATE POLICY "Authenticated users can delete videos"
ON storage.objects FOR DELETE
USING (bucket_id = 'report-videos');
