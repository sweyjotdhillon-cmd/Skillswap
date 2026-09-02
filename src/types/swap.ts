import type { SwapRecord } from '../lib/supabase/credits';

export type SwapStatus =
  | 'open'
  | 'accepted'
  | 'submitted'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'withdrawn'
  | 'expired';

export type ChatPermission = 'requester' | 'participant' | 'anyone';

export interface SwapProfile {
  fullName: string;
  username: string;
  avatarUrl?: string;
}

export interface Swap {
  id: string;
  requesterId: string;
  participantId: string | null;
  topic: string;
  description: string;
  requirements: string;
  additionalMessage: string | null;
  chatPermission: ChatPermission;
  creditAmount: number;
  status: SwapStatus;
  idempotencyKey?: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  requesterProfile?: SwapProfile | null;
  participantProfile?: SwapProfile | null;
}

/**
  * Deterministically maps a database SwapRecord into the canonical application Swap model.
  * Contains no fabricated business values (no rating, category, offerSkill, isReal, etc.).
  */
export function mapSwapRecordToSwap(record: SwapRecord): Swap {
  return {
    id: record.id,
    requesterId: record.requester_id,
    participantId: record.participant_id,
    topic: record.topic,
    description: record.description,
    requirements: record.requirements,
    additionalMessage: record.additional_message,
    chatPermission: record.chat_permission,
    creditAmount: record.credit_amount,
    status: record.status,
    idempotencyKey: record.idempotency_key ?? null,
    submittedAt: record.submitted_at,
    completedAt: record.completed_at,
    cancelledAt: record.cancelled_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    requesterProfile: record.requester_profile
      ? {
          fullName: record.requester_profile.full_name,
          username: record.requester_profile.username,
          avatarUrl: record.requester_profile.avatar_url,
        }
      : null,
    participantProfile: record.participant_profile
      ? {
          fullName: record.participant_profile.full_name,
          username: record.participant_profile.username,
          avatarUrl: record.participant_profile.avatar_url,
        }
      : null,
  };
}
