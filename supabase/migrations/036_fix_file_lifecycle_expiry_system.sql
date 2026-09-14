-- Migration 036: Fix File Lifecycle Expiry System (Chat Attachments Claiming, Legacy Creator Attachment Backfill & Security)

-- 1. Correct claim_expired_file_cleanup RPC
-- Fixes chat attachments claiming to claim active, failed, and pending_deletion rows past delete_after
CREATE OR REPLACE FUNCTION public.claim_expired_file_cleanup(p_batch_size integer DEFAULT 500)
RETURNS TABLE (
  file_id uuid,
  table_name text,
  bucket_name text,
  storage_path text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- 1. Claim expired or manually pending submission files
  RETURN QUERY
  WITH claimed_sub AS (
    SELECT f.id
    FROM public.swap_submission_files f
    WHERE (f.storage_expires_at <= now() OR f.storage_delete_status = 'pending_deletion')
      AND (f.storage_deleted_at IS NULL AND f.storage_delete_status NOT IN ('deleted', 'in_progress'))
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_sub AS (
    UPDATE public.swap_submission_files f
    SET storage_delete_status = 'in_progress'
    FROM claimed_sub
    WHERE f.id = claimed_sub.id
    RETURNING f.id, 'swap_submission_files'::text AS tbl, 'swap-submissions'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_sub;

  -- 2. Claim expired or manually pending creator attachments
  RETURN QUERY
  WITH claimed_att AS (
    SELECT f.id
    FROM public.swap_attachment_files f
    WHERE ((f.storage_expires_at IS NOT NULL AND f.storage_expires_at <= now()) OR f.storage_delete_status = 'pending_deletion')
      AND (f.storage_deleted_at IS NULL AND f.storage_delete_status NOT IN ('deleted', 'in_progress'))
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_att AS (
    UPDATE public.swap_attachment_files f
    SET storage_delete_status = 'in_progress'
    FROM claimed_att
    WHERE f.id = claimed_att.id
    RETURNING f.id, 'swap_attachment_files'::text AS tbl, 'swap-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_att;

  -- 3. Claim expired (active/failed) or manually pending chat attachments
  RETURN QUERY
  WITH claimed_msg AS (
    SELECT f.id
    FROM public.swap_message_attachments f
    WHERE (f.delete_after <= now() OR f.delete_status = 'pending_deletion')
      AND f.deleted_at IS NULL
      AND f.delete_status IN ('active', 'failed', 'pending_deletion')
      AND f.delete_status <> 'in_progress'
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  ),
  upd_msg AS (
    UPDATE public.swap_message_attachments f
    SET delete_status = 'in_progress'
    FROM claimed_msg
    WHERE f.id = claimed_msg.id
    RETURNING f.id, 'swap_message_attachments'::text AS tbl, 'swap-attachments'::text AS bucket, f.storage_path
  )
  SELECT * FROM upd_msg;

END;
$$;

-- Enforce strict SECURITY: Revoke execute from public, anon, and authenticated; grant strictly to service_role
REVOKE ALL ON FUNCTION public.claim_expired_file_cleanup(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_expired_file_cleanup(integer) TO service_role;

REVOKE ALL ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_file_cleanup(uuid, text, boolean, text) TO service_role;

-- 2. Backfill legacy creator attachments for accepted/submitted/completed/cancelled swaps
-- Sets storage_expires_at = authoritative acceptance timestamp + 24 hours
-- Swap acceptance timestamp is derived from authoritative swap lifecycle data (submitted_at, completed_at, updated_at, or created_at)
UPDATE public.swap_attachment_files f
SET storage_expires_at = COALESCE(f.storage_expires_at, COALESCE(s.submitted_at, s.completed_at, s.updated_at, s.created_at) + interval '24 hours')
FROM public.swaps s
WHERE f.swap_id = s.id
  AND s.status <> 'open'
  AND f.storage_expires_at IS NULL
  AND f.storage_deleted_at IS NULL;
