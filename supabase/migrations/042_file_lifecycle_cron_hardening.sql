-- Migration 042: File Lifecycle Cron Hardening & Dynamic Settings Resolution
-- Strategy: Forward-only migration history preservation.

-- ============================================================================
-- 1. HARDEN CANONICAL FILE LIFECYCLE CRON SCHEDULING
-- ============================================================================
-- Ensures exactly ONE canonical cron job exists for physical file lifecycle cleanup.
-- Invokes the file-lifecycle-worker Edge Function via pg_net every 10 minutes when pg_cron is enabled.
-- Note: In hosted Supabase environments, configure app.settings.edge_function_base_url and app.settings.service_role_key
-- via secure environment variables or vault configuration without hardcoding secret values in SQL scripts.
DO $$
DECLARE
  v_has_cron boolean;
  v_has_net boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') INTO v_has_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') INTO v_has_net;

  IF v_has_cron AND v_has_net THEN
    -- Safely unschedule existing duplicate or legacy file cleanup jobs
    EXECUTE 'SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN (''old_file_cleanup'', ''legacy_timeout_checker'', ''file_lifecycle_cleanup_job'')';

    -- Schedule canonical single file lifecycle cleanup cron job every 10 minutes to trigger file-lifecycle-worker
    EXECUTE 'SELECT cron.schedule('
      || quote_literal('file_lifecycle_cleanup_job') || ', '
      || quote_literal('*/10 * * * *') || ', '
      || quote_literal('SELECT net.http_post(url := COALESCE(NULLIF(current_setting(''app.settings.edge_function_base_url'', true), ''''), ''http://127.0.0.1:54321/functions/v1'') || ''/file-lifecycle-worker'', headers := jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || COALESCE(NULLIF(current_setting(''app.settings.service_role_key'', true), ''''), '''')), body := jsonb_build_object(''batch_size'', 500));')
      || ')';
    RAISE NOTICE 'file_lifecycle_cleanup_job successfully scheduled in pg_cron.';
  ELSE
    IF NOT v_has_cron THEN
      RAISE NOTICE 'pg_cron extension is not active in this environment; skipping cron scheduling.';
    END IF;
    IF NOT v_has_net THEN
      RAISE NOTICE 'pg_net extension is not active in this environment; skipping pg_net HTTP hook setup.';
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
