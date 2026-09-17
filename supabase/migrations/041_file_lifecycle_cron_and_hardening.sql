-- Migration 041: File Lifecycle Canonical Cron & System Hardening
-- Strategy: Forward-only migration history preservation.

-- ============================================================================
-- 1. CANONICAL FILE LIFECYCLE CRON SCHEDULING
-- ============================================================================
-- Ensures exactly ONE canonical cron job exists for physical file lifecycle cleanup.
-- Invokes the file-lifecycle-worker Edge Function via pg_net every 10 minutes when pg_cron is enabled,
-- ensuring physical Storage API removals and database finalization occur end-to-end.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule duplicate or legacy file cleanup jobs
    PERFORM cron.unschedule(jobid)
    FROM cron.job
    WHERE jobname IN ('old_file_cleanup', 'legacy_timeout_checker', 'file_lifecycle_cleanup_job');

    -- Schedule canonical single file lifecycle cleanup cron job every 10 minutes to trigger the file-lifecycle-worker worker
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
      PERFORM cron.schedule(
        'file_lifecycle_cleanup_job',
        '*/10 * * * *',
        $$SELECT net.http_post(
            url := COALESCE(current_setting('app.settings.edge_function_base_url', true), 'http://127.0.0.1:54321/functions/v1') || '/file-lifecycle-worker',
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(current_setting('app.settings.service_role_key', true), '')
            ),
            body := jsonb_build_object('batch_size', 500)
          );$$
      );
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron/pg_net schema or permissions not active in current session
  NULL;
END $$;

-- ============================================================================
-- 2. SECURITY HARDENING FOR LIFECYCLE RPCS
-- ============================================================================
REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) TO service_role;

NOTIFY pgrst, 'reload schema';
