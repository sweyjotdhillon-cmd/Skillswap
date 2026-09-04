-- Migration 023: Explicit Storage Bucket Allowed MIME Types Configuration

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

    -- Update allowed_mime_types on storage.buckets for both buckets to explicitly allow canonical supported file types
    UPDATE storage.buckets
    SET allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown', 'application/rtf',
      'text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip', 'application/x-tar', 'application/gzip', 'application/x-7z-compressed',
      'text/x-python', 'text/javascript', 'text/typescript', 'text/html', 'text/css', 'text/x-scss', 'text/x-java-source', 'text/x-c', 'text/x-c++', 'text/x-h', 'text/x-h++', 'application/x-httpd-php', 'text/x-ruby', 'application/sql', 'application/x-sh', 'application/json', 'application/xml', 'text/yaml',
      'audio/mpeg', 'audio/wav', 'video/mp4', 'video/webm', 'video/quicktime',
      'application/octet-stream', 'image/vnd.adobe.photoshop', 'application/postscript'
    ]
    WHERE id IN ('swap-attachments', 'swap-submissions');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
