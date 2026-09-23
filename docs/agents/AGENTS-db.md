# Skillswap Database Agent Instructions — Specialized Supabase & PostgreSQL Operating Rules

This instruction file is the authoritative database operating guide for AI coding agents working on Skillswap's database layer (Supabase, PostgreSQL, migrations, RLS, RPCs, triggers, storage policies, Edge Functions, and data integrity).

It complements the root `AGENTS.md` (which covers overall frontend architecture and UI design system rules) and must be followed for **all database-related tasks**.

---

## 1. Core Operating Principles for Database Agents

When executing database tasks on Skillswap, follow these non-negotiable operating rules:

1. **Inspect Before Modifying**: Never guess schema structures, column names, constraints, RPC parameter types, or RLS policies. Inspect `supabase/migrations/`, `src/lib/supabase/`, and `src/types/database.types.ts` first.
2. **Understand the Full Stack Impact**: Trace every database modification through the entire application hierarchy before making a change:
   $$\text{Database Schema} \longrightarrow \text{RLS / RPCs / Triggers} \longrightarrow \text{Supabase Client Calls} \longrightarrow \text{React Hooks / Services} \longrightarrow \text{UI Behavior} \longrightarrow \text{Automated Tests}$$
3. **Search for All Callers**: Before modifying a table, column, RPC signature, or trigger, run repository searches across `src/`, `supabase/functions/`, and `e2e/` to locate all dependent code.
4. **Never Rewrite Historical Migrations**: Skillswap's database migration history is append-only (`001_...sql` through `050_...sql`). Never modify or re-order existing historical migration files. Always create a new, sequentially numbered migration file (e.g. `051_description.sql`).
5. **Preserve Backwards Compatibility**: Additive schema changes (new tables, new nullable/default columns, new RPCs) are preferred. If a breaking schema change is required, update all application callers, RPC definitions, and tests simultaneously.
6. **Prefer Minimal, Targeted Changes**: Implement the simplest schema change that satisfies the requirement without unnecessary refactoring or collateral schema rewrites.
7. **Verify Database Behavior After Every Change**: All schema changes and RPCs must be verified using Skillswap's in-memory PGLite test runner (`npm test`) which executes all migrations sequentially.
8. **Differentiate Access Contexts**: Evaluate all database operations across three distinct security boundaries:
   - **Unauthenticated (`anon`)**: Public marketplace read-only discovery, public user profiles, pre-login auth utilities.
   - **Authenticated (`authenticated`)**: Row-scoped user reads/writes governed by RLS `auth.uid()`.
   - **Privileged / Server-Side (`service_role` / `SECURITY DEFINER`)**: Admin workflows, Edge Functions, system reconciliation, and atomic stored procedures.
9. **Never Weaken Security to Fix Queries**: If a client query fails due to RLS or missing permissions, diagnose and fix the policy predicate or client query path. Never disable RLS, grant broad `USING (true)` write access, or bypass RLS to make frontend queries pass.
10. **Never Expose Service-Role Credentials**: Service-role keys and elevated database connection strings must remain exclusively in server-side Edge Functions or environment configurations. They must NEVER be referenced in `src/` or bundled into client code.

---

## 2. Skillswap-Specific Database Architecture & Invariants

Skillswap is a digital skill exchange platform powered by an internal credit currency (**SkillCredits**). The actual implementation in PostgreSQL is authoritative.

### 2.1 User Profiles & Identity System
- **Core Tables**: `auth.users`, `public.profiles`, `public.user_private_contacts`, `public.skills`, `public.user_skills`, `public.user_custom_skills`.
- **`auth.users` $\leftrightarrow$ `public.profiles`**: 1:1 foreign key relationship (`profiles.id` references `auth.users(id) ON DELETE CASCADE`).
- **Username Immutability**: `@username` is case-insensitive, normalized via lower-case unique index `idx_profiles_username_lower`, and enforced as permanently immutable once set via trigger `trg_handle_username_rules`.
- **Profile Completion**: Mandatory onboarding completes profile status via the `complete_profile()` `SECURITY DEFINER` stored procedure. Direct client updates to `profile_completed` are blocked by trigger `trg_prevent_profile_completed_direct_update`.
- **Private Contact Isolation**: Phone numbers and sensitive contact details are strictly stored in `public.user_private_contacts`, accessible solely by the account owner (`auth.uid() = user_id`).

### 2.2 SkillCredits Ledger & Dual-Balance Accounting
- **Core Tables**: `public.accounts`, `public.credit_transactions`, `public.credit_operations`.
- **Dual-Balance Equation**: Every account maintains:
  $$\text{credits\_balance} + \text{credits\_reserved} = \text{credits\_earned} - \text{credits\_spent}$$
  Non-negative constraints (`chk_min_balance`, `chk_min_earned`, `chk_min_spent`) prevent negative balances.
- **100 SkillCredits Welcome Grant**: Granted exactly once per user via `ensure_credit_account(p_user_id)` with idempotency key `initial_grant_<user_id>`.
- **Direct Table Mutation Protection**: Clients are granted `SELECT` access strictly on their own row in `public.accounts` and `public.credit_transactions`. Direct client `INSERT`, `UPDATE`, or `DELETE` on `accounts`, `credit_transactions`, or `credit_operations` is **strictly revoked**.
- **Double-Entry Ledger**: All credit deductions, additions, escrow holds, releases, and completion transfers write immutable double-entry rows to `public.credit_transactions`.
- **Balance Reconciliation**: Diagnostic stored procedure `reconcile_credit_balances()` validates ledger history against active commitments.

### 2.3 Swap Lifecycle & Escrow State Machine
- **Core Table**: `public.swaps`.
- **Status Machine**: Valid statuses are `open`, `accepted`, `submitted`, `completed`, `cancelled`, `declined`, `withdrawn`, `expired`.
- **State Transition RPCs**: State changes are executed exclusively through `SECURITY DEFINER` procedures:
  - `create_credit_swap`: Reserves credits in escrow (`credits_balance` $\downarrow$, `credits_reserved` $\uparrow$) and creates swap in `open` state using business idempotency key (`swap_create:<uuid>`).
  - `accept_credit_swap`: Transitions `open` $\rightarrow$ `accepted`, locks participant, and records `accepted_at`. Sets creator attachment `storage_expires_at = accepted_at + 48h`.
  - `submit_credit_swap`: Fulfiller submits work (`accepted` $\rightarrow$ `submitted`), creates record in `public.swap_submissions`, and sets `auto_release_at`.
  - `complete_credit_swap`: Creator approves work (`submitted` $\rightarrow$ `completed`), transfers reserved credits from creator to fulfiller, and updates completed swap metrics.
  - `cancel_credit_swap`: Cancels swap (`open` $\rightarrow$ `cancelled`), releasing reserved credits back to available balance.
- **Direct Lifecycle Alterations Prohibited**: Frontend code must never issue direct `UPDATE public.swaps SET status = ...`. All transitions must invoke the corresponding database procedure.

### 2.4 Submissions, Chat & Deliverable Protection
- **Core Tables**: `public.swap_submissions`, `public.swap_submission_files`, `public.swap_messages`, `public.swap_message_attachments`.
- **Immutable Relationship Protection**: Mutation RPCs and client helpers (`updateSwapSubmissionMetadata`, `updateSwapMessageAttachmentMetadata`) strip immutable identity fields (`swap_id`, `submitted_by`, `message_id`, `uploaded_by`) to prevent cross-resource IDOR/BOLA tampering.
- **Realtime P2P Chat**: Messaging is conducted via `send_chat_message_with_attachments` RPC and Realtime topic subscription `skillswap-chat:<swap_id>`. Recipient routing is strictly computed using `deriveSwapRecipientId` (open swaps target requester; active swaps target counterpart participant).
- **Pre-Upload Validation**: File uploads enforce 25MB max size limit, filename sanitization, and 11 canonical MIME types (PDF, TXT, CSV, ZIP, DOCX, XLSX, PPTX, JPEG, PNG, WEBP, GIF).

### 2.5 Storage Buckets & File Lifecycle Retention Contracts
- **Storage Buckets**: `swap-submissions`, `swap-attachments`, `swap-chat-attachments`.
- **Retention Lifecycles**:
  - **Chat Attachments**: 6 hours retention (`delete_after = created_at + 6h`).
  - **Submission Files**: 24 hours retention (`storage_expires_at = submitted_at + 24h`).
  - **Creator Attachments**: 48 hours post-acceptance retention (`storage_expires_at = accepted_at + 48h`). Unaccepted open swap creator attachments remain unexpiring (`storage_expires_at = NULL`) while in open pre-acceptance state.
- **Storage Cleanup**: Automated hourly background procedure `claim_expired_file_cleanup()` identifies expired files and invokes Edge Function `cleanup-storage-files` via Vault setting `app.settings.edge_function_base_url`.

### 2.6 Trust Metrics, Peer Reviews & Reputation
- **Core Table**: `public.swap_reviews`.
- **Trust Metric Protection**: `public.profiles` contains reputation fields (`is_verified`, `completed_swaps_count`, `average_rating`, `review_count`). Direct client mutations on these columns are rejected by trigger `prevent_client_trust_metric_changes()`.
- **Reputation Refresh Procedure**: `refresh_profile_trust_metrics(p_user_id)` is a `SECURITY DEFINER` function with `SET search_path = public, pg_temp`, strictly granted to `service_role`. Reviews are submitted directly into `public.swap_reviews` (protected by RLS and trigger `protect_profile_reputation_metrics`).

### 2.7 Password Reset & Auth Edge Functions
- **Core Table**: `public.password_reset_challenges`.
- **Edge Functions**: `request-password-reset`, `verify-password-reset-otp`, `complete-password-reset`, `cleanup-storage-files`.
- **Rate-Limiting & Locking**: Max 3 OTP challenges per 15 min per email, max 5 failed attempts per challenge. Token consumption claims use `FOR UPDATE` row locking inside `claim_password_reset_recovery_token()`.

---

## 3. Migration Safety Guidelines

All database schema, function, or policy changes must be codified as sequential SQL migration files in `supabase/migrations/`.

### 3.1 Migration File Naming Convention
Files must follow strict prefix ordering:
```text
supabase/migrations/051_descriptive_action_name.sql
```

### 3.2 Additive Changes (Preferred Pattern)
- Adding new tables: Always include `IF NOT EXISTS` and `ENABLE ROW LEVEL SECURITY`.
- Adding new columns: Always make new columns `NULL` or provide an explicit `DEFAULT` value.
- Adding new indexes: Always use `CREATE INDEX IF NOT EXISTS`.
- Adding new functions/RPCs: Use `CREATE OR REPLACE FUNCTION`.

### 3.3 Destructive Changes & Safety Protocol
Destructive operations (dropping tables, dropping columns, altering column types, deleting data, removing constraints) are **high risk**. Before proposing any destructive migration, the agent MUST explicitly identify:
1. **Affected Data**: Impact on existing production records.
2. **Affected Code Consumers**: Every query, service call, and type in `src/` or `supabase/functions/`.
3. **Affected RPCs & Triggers**: Stored procedures or triggers referencing the modified column/table.
4. **Affected RLS Policies & Indexes**: Security policies or query indexes relying on the column.
5. **Rollback Strategy**: How data can be restored if issues arise.

*Rule: Never casually execute `DROP TABLE`, `DROP COLUMN`, or `TRUNCATE` without verifying zero application code dependencies.*

---

## 4. Row Level Security (RLS) Requirements

Every table in Skillswap's `public` schema **MUST** have Row Level Security enabled.

### 4.1 RLS Rules
1. **Default Deny**: Enabling RLS automatically blocks all unauthenticated and unauthorized access.
2. **Explicit Action Scoping**: Write separate policies for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
3. **`USING` vs `WITH CHECK`**:
   - `USING (predicate)`: Controls which existing rows are visible for `SELECT`, `UPDATE`, or `DELETE`.
   - `WITH CHECK (predicate)`: Controls what new or modified row values are allowed during `INSERT` or `UPDATE`.
4. **Owner Scoping**: Standard user-data scoping must use `auth.uid()`:
   ```sql
   CREATE POLICY "Users can update their own profile"
     ON public.profiles FOR UPDATE TO authenticated
     USING (auth.uid() = id)
     WITH CHECK (auth.uid() = id);
   ```
5. **Avoid Recursive Policies**: Never write policy predicates that query the same table recursively, as this causes infinite loops and database performance degradation.
6. **Index Policy Predicates**: Every column referenced in an RLS `USING` or `WITH CHECK` clause (e.g. `user_id`, `requester_id`, `participant_id`, `swap_id`) **MUST** be indexed.

---

## 5. RPC & Database Function Rules

Skillswap uses PostgreSQL stored procedures (RPCs) to enforce financial, state, and security invariants.

### 5.1 RPC Execution & Security Boundary Standards
- **`SECURITY DEFINER` Usage**: Use `SECURITY DEFINER` when a procedure needs to perform elevated operations (e.g., deducting credits, updating escrow, modifying profiles) that clients cannot perform directly.
- **Explicit `search_path`**: ALL `SECURITY DEFINER` functions MUST include `SET search_path = public, pg_temp` to prevent search_path hijacking vulnerabilities.
- **Explicit Grants**: Explicitly `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` and `GRANT EXECUTE` strictly to required roles (`authenticated`, `service_role`).
- **Authorization Verification**: Inside every user-facing RPC, derive the acting user ID directly from `auth.uid()`. Never trust a client-supplied `p_user_id` parameter for authorization:
  ```sql
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated.';
  END IF;
  ```

### 5.2 Concurrency & Idempotency Rules
- **Row Locking**: Use `FOR UPDATE` row locking when reading accounts or swap records before performing balance updates or status transitions to prevent race conditions.
- **Advisory Locks**: Use `pg_advisory_xact_lock(...)` for high-concurrency user operations (e.g. `add_user_skill`).
- **Deterministic Lock Ordering**: When transferring resources between two users (e.g., `transfer_credits`), always lock accounts in deterministic UUID order (`IF v_from_user_id < p_to_user_id`) to prevent database deadlocks.
- **Business Idempotency Keys**: Accept `p_idempotency_key` parameters in financial/mutation RPCs and check `public.credit_operations` or `public.credit_transactions` before executing duplicate mutations.

---

## 6. Full Stack Connection Tracing Procedure

When making any database change, the AI agent must trace and update the entire dependency chain:

```text
1. Database Schema (supabase/migrations/0XX_....sql)
       ↓
2. RLS Policies, Functions & Triggers (PL/pgSQL)
       ↓
3. Supabase TypeScript Client Helpers (src/lib/supabase/credits.ts, profile.ts, client.ts)
       ↓
4. React Context / Hooks (src/context/AuthContext.tsx, src/hooks/)
       ↓
5. UI Components & Page Views (src/pages/, src/components/)
       ↓
6. Automated Integration Tests & E2E Verification (src/lib/supabase/*.test.ts, e2e/*.spec.ts)
```

Before declaring a database task complete, verify that all steps in this chain have been inspected and aligned.

---

## 7. Database Verification Checklist

Use this checklist to verify any database work in Skillswap before submission:

- [ ] **Sequential Migration**: Created a new sequentially numbered migration file under `supabase/migrations/`.
- [ ] **PGLite Migration Test**: Ran `npm test` and confirmed all migrations apply cleanly in sequence without syntax or contract errors.
- [ ] **RLS Enabled**: Verified `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all new or modified tables.
- [ ] **Least Privilege Grants**: Verified explicit `REVOKE` and `GRANT` statements on tables and RPCs.
- [ ] **`search_path` Security**: Confirmed all `SECURITY DEFINER` functions include `SET search_path = public, pg_temp`.
- [ ] **Index Coverage**: Verified indexes exist for foreign keys, RLS policy predicates, and query sort columns.
- [ ] **No Secrets Exposed**: Confirmed zero API keys, service-role tokens, or unredacted credentials exist in migrations or client files.
- [ ] **Caller Alignment**: Confirmed TypeScript types in `src/types/` and helper calls in `src/lib/supabase/` match updated RPC signatures and column names.
- [ ] **Credit/Swap Invariants**: Verified dual-balance equation (`credits_balance + credits_reserved === credits_earned - credits_spent`) remains unbroken.
- [ ] **Automated Test Suite**: Passed all unit/integration tests via `npm test`.
- [ ] **Linter Check**: Passed `npm run lint`.
- [ ] **Type Check**: Passed `npx tsc --noEmit`.
