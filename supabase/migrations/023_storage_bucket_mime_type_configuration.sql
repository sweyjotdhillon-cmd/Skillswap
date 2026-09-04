-- Migration 023: Storage Bucket Configuration Alignment

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    -- Ensure swap-attachments bucket exists
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('swap-attachments', 'swap-attachments', false, 26214400)
    ON CONFLICT (id) DO NOTHING;

    -- Ensure swap-submissions bucket exists
    INSERT INTO storage.buckets (id, name, public, file_size_limit)
    VALUES ('swap-submissions', 'swap-submissions', false, 26214400)
    ON CONFLICT (id) DO NOTHING;

    -- Update allowed_mime_types on storage.buckets for both buckets to NULL to allow arbitrary file uploads
    UPDATE storage.buckets
    SET
      allowed_mime_types = NULL,
      file_size_limit = 26214400,
      public = false
    WHERE id IN ('swap-attachments', 'swap-submissions');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
