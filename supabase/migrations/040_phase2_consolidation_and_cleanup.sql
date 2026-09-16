-- Migration 040: Phase 2 Database, Function, Index & Storage Cleanup & Consolidation
-- Strategy: Forward-only migration history preservation.

-- ============================================================================
-- 1. DROP OBSOLETE COMPATIBILITY VIEW
-- ============================================================================
-- public.swap_attachments was a compatibility view pointing to public.swap_attachment_files.
-- Application consumers use public.swap_attachment_files directly.
DROP VIEW IF EXISTS public.swap_attachments CASCADE;

-- ============================================================================
-- 2. DROP OBSOLETE CHAT INFRASTRUCTURE & FUNCTIONS
-- ============================================================================
-- Ensure swap_chat_requests table and old permission functions are completely cleaned up.
DROP TABLE IF EXISTS public.swap_chat_requests CASCADE;
DROP FUNCTION IF EXISTS public.request_chat_access(uuid);
DROP FUNCTION IF EXISTS public.respond_chat_request(uuid, text);
DROP FUNCTION IF EXISTS public.get_chat_permission_status(uuid);

-- submit_credit_swap(uuid) was an early simple status change function superseded by submit_swap_work(uuid, text, jsonb).
DROP FUNCTION IF EXISTS public.submit_credit_swap(uuid);

-- Alias function for delete_swap_message_attachment mapping directly to canonical delete_chat_attachment_manual
CREATE OR REPLACE FUNCTION public.delete_swap_message_attachment(p_attachment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.delete_chat_attachment_manual(p_attachment_id);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_swap_message_attachment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_swap_message_attachment(uuid) TO authenticated, service_role;

-- ============================================================================
-- 3. DROP REDUNDANT INDEXES (COVERED BY COMPOSITE INDEXES / UNIQUE CONSTRAINTS)
-- ============================================================================
-- idx_swap_reviews_reviewee_id is redundant because idx_swap_reviews_reviewee_created(reviewee_id, created_at DESC) covers queries filtering on reviewee_id.
DROP INDEX IF EXISTS public.idx_swap_reviews_reviewee_id;

-- idx_password_reset_challenges_email is redundant because idx_password_reset_challenges_email_created(email, created_at) covers queries filtering on email.
DROP INDEX IF EXISTS public.idx_password_reset_challenges_email;

-- ============================================================================
-- 4. STORAGE CONFIGURATION & BUCKET VALIDATION
-- ============================================================================
-- Ensure canonical storage buckets are configured with proper size limits (25MB) and private access.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    UPDATE storage.buckets
    SET public = false,
        file_size_limit = 26214400
    WHERE id IN ('swap-attachments', 'swap-submissions', 'swap-chat-attachments');
  END IF;
END $$;

-- ============================================================================
-- 5. CRON & SCHEDULER AUDIT
-- ============================================================================
-- Unschedule any duplicate/legacy cron jobs if pg_cron extension is present
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('old_file_cleanup', 'legacy_timeout_checker');
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron schema/permissions not active in current session
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';
