-- Migration 037: Drop redundant idx_swap_submissions_swap_id index
-- Reconcile migration history with live Supabase database state where swap_submissions_one_per_swap_idx / swap_id unique constraint serves swap_id lookups.

DROP INDEX IF EXISTS public.idx_swap_submissions_swap_id;
