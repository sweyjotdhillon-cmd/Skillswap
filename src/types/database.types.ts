export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      accounts: {
        Row: {
          user_id: string;
          credits_balance: number;
          credits_reserved: number;
          credits_earned: number;
          credits_spent: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          credits_balance?: number;
          credits_reserved?: number;
          credits_earned?: number;
          credits_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          credits_balance?: number;
          credits_reserved?: number;
          credits_earned?: number;
          credits_spent?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      credit_operations: {
        Row: {
          id: string;
          idempotency_key: string;
          operation_type: string;
          requester_id: string;
          target_user_id: string | null;
          swap_id: string | null;
          amount: number;
          status: string;
          result_payload: Json | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          idempotency_key: string;
          operation_type: string;
          requester_id: string;
          target_user_id?: string | null;
          swap_id?: string | null;
          amount: number;
          status?: string;
          result_payload?: Json | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          idempotency_key?: string;
          operation_type?: string;
          requester_id?: string;
          target_user_id?: string | null;
          swap_id?: string | null;
          amount?: number;
          status?: string;
          result_payload?: Json | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_operations_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_operations_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          }
        ];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          balance_after: number;
          transaction_type: string;
          reason: string;
          related_swap_id: string | null;
          related_operation_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          balance_after: number;
          transaction_type: string;
          reason: string;
          related_swap_id?: string | null;
          related_operation_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          balance_after?: number;
          transaction_type?: string;
          reason?: string;
          related_swap_id?: string | null;
          related_operation_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "credit_transactions_related_swap_id_fkey";
            columns: ["related_swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      password_reset_challenges: {
        Row: {
          id: string;
          user_id: string;
          email: string;
          otp_hash: string;
          recovery_token_hash: string | null;
          otp_attempts: number;
          expires_at: string;
          used_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          email: string;
          otp_hash: string;
          recovery_token_hash?: string | null;
          otp_attempts?: number;
          expires_at: string;
          used_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          email?: string;
          otp_hash?: string;
          recovery_token_hash?: string | null;
          otp_attempts?: number;
          expires_at?: string;
          used_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      password_reset_request_rate_limits: {
        Row: {
          ip_address: string;
          request_count: number;
          window_start: string;
        };
        Insert: {
          ip_address: string;
          request_count?: number;
          window_start?: string;
        };
        Update: {
          ip_address?: string;
          request_count?: number;
          window_start?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          username: string;
          full_name: string;
          avatar_url: string | null;
          bio: string | null;
          location: string | null;
          website: string | null;
          github_url: string | null;
          linkedin_url: string | null;
          twitter_url: string | null;
          profile_completed: boolean;
          is_verified: boolean;
          average_rating: number | null;
          review_count: number;
          completed_swaps_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username: string;
          full_name: string;
          avatar_url?: string | null;
          bio?: string | null;
          location?: string | null;
          website?: string | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          twitter_url?: string | null;
          profile_completed?: boolean;
          is_verified?: boolean;
          average_rating?: number | null;
          review_count?: number;
          completed_swaps_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string;
          full_name?: string;
          avatar_url?: string | null;
          bio?: string | null;
          location?: string | null;
          website?: string | null;
          github_url?: string | null;
          linkedin_url?: string | null;
          twitter_url?: string | null;
          profile_completed?: boolean;
          is_verified?: boolean;
          average_rating?: number | null;
          review_count?: number;
          completed_swaps_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      skills: {
        Row: {
          id: string;
          name: string;
          category: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      swaps: {
        Row: {
          id: string;
          requester_id: string;
          participant_id: string | null;
          topic: string;
          description: string;
          requirements: string;
          additional_message: string | null;
          credit_amount: number;
          status: 'open' | 'accepted' | 'submitted' | 'completed' | 'cancelled' | 'declined' | 'withdrawn' | 'expired';
          idempotency_key: string | null;
          accepted_at: string | null;
          submitted_at: string | null;
          auto_release_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          requester_id: string;
          participant_id?: string | null;
          topic: string;
          description: string;
          requirements: string;
          additional_message?: string | null;
          credit_amount: number;
          status?: 'open' | 'accepted' | 'submitted' | 'completed' | 'cancelled' | 'declined' | 'withdrawn' | 'expired';
          idempotency_key?: string | null;
          accepted_at?: string | null;
          submitted_at?: string | null;
          auto_release_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          requester_id?: string;
          participant_id?: string | null;
          topic?: string;
          description?: string;
          requirements?: string;
          additional_message?: string | null;
          credit_amount?: number;
          status?: 'open' | 'accepted' | 'submitted' | 'completed' | 'cancelled' | 'declined' | 'withdrawn' | 'expired';
          idempotency_key?: string | null;
          accepted_at?: string | null;
          submitted_at?: string | null;
          auto_release_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swaps_participant_id_fkey";
            columns: ["participant_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swaps_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_attachment_files: {
        Row: {
          id: string;
          swap_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          file_size: number | null;
          available_from: string | null;
          storage_expires_at: string | null;
          storage_deleted_at: string | null;
          storage_delete_status: string | null;
          storage_delete_error: string | null;
          storage_delete_claimed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          swap_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          file_size?: number | null;
          available_from?: string | null;
          storage_expires_at?: string | null;
          storage_deleted_at?: string | null;
          storage_delete_status?: string | null;
          storage_delete_error?: string | null;
          storage_delete_claimed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          swap_id?: string;
          uploaded_by?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          file_size?: number | null;
          available_from?: string | null;
          storage_expires_at?: string | null;
          storage_deleted_at?: string | null;
          storage_delete_status?: string | null;
          storage_delete_error?: string | null;
          storage_delete_claimed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_attachment_files_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_attachment_files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_message_attachments: {
        Row: {
          id: string;
          message_id: string;
          swap_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          file_size: number | null;
          delete_after: string;
          deleted_at: string | null;
          delete_status: string;
          delete_error: string | null;
          delete_claimed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          message_id: string;
          swap_id: string;
          uploaded_by: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          file_size?: number | null;
          delete_after?: string;
          deleted_at?: string | null;
          delete_status?: string;
          delete_error?: string | null;
          delete_claimed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          message_id?: string;
          swap_id?: string;
          uploaded_by?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          file_size?: number | null;
          delete_after?: string;
          deleted_at?: string | null;
          delete_status?: string;
          delete_error?: string | null;
          delete_claimed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_message_attachments_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "swap_messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_message_attachments_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_messages: {
        Row: {
          id: string;
          swap_id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read_at: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          swap_id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
          read_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Update: {
          id?: string;
          swap_id?: string;
          sender_id?: string;
          recipient_id?: string;
          body?: string;
          read_at?: string | null;
          created_at?: string;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_messages_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_messages_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_reviews: {
        Row: {
          id: string;
          swap_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          review_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          swap_id: string;
          reviewer_id: string;
          reviewee_id: string;
          rating: number;
          review_text?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          swap_id?: string;
          reviewer_id?: string;
          reviewee_id?: string;
          rating?: number;
          review_text?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_reviews_reviewee_id_fkey";
            columns: ["reviewee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_reviews_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_submission_files: {
        Row: {
          id: string;
          submission_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string | null;
          file_size: number | null;
          storage_expires_at: string | null;
          storage_deleted_at: string | null;
          storage_delete_status: string | null;
          storage_delete_error: string | null;
          storage_delete_claimed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          submission_id: string;
          storage_path: string;
          file_name: string;
          mime_type?: string | null;
          file_size?: number | null;
          storage_expires_at?: string | null;
          storage_deleted_at?: string | null;
          storage_delete_status?: string | null;
          storage_delete_error?: string | null;
          storage_delete_claimed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          submission_id?: string;
          storage_path?: string;
          file_name?: string;
          mime_type?: string | null;
          file_size?: number | null;
          storage_expires_at?: string | null;
          storage_deleted_at?: string | null;
          storage_delete_status?: string | null;
          storage_delete_error?: string | null;
          storage_delete_claimed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_submission_files_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "swap_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_submissions: {
        Row: {
          id: string;
          swap_id: string;
          submitted_by: string;
          notes: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          swap_id: string;
          submitted_by: string;
          notes: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          swap_id?: string;
          submitted_by?: string;
          notes?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_submissions_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: true;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_tag_links: {
        Row: {
          swap_id: string;
          tag_id: string;
        };
        Insert: {
          swap_id: string;
          tag_id: string;
        };
        Update: {
          swap_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "swap_tag_links_swap_id_fkey";
            columns: ["swap_id"];
            isOneToOne: false;
            referencedRelation: "swaps";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "swap_tag_links_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "swap_tags";
            referencedColumns: ["id"];
          }
        ];
      };
      swap_tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      user_custom_skills: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          skill_type: 'offered' | 'wanted';
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          skill_type: 'offered' | 'wanted';
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          skill_type?: 'offered' | 'wanted';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_custom_skills_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_private_contacts: {
        Row: {
          user_id: string;
          email: string;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          email?: string;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_private_contacts_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      user_skills: {
        Row: {
          user_id: string;
          skill_id: string;
          skill_type: 'offered' | 'wanted';
          created_at: string;
        };
        Insert: {
          user_id: string;
          skill_id: string;
          skill_type: 'offered' | 'wanted';
          created_at?: string;
        };
        Update: {
          user_id?: string;
          skill_id?: string;
          skill_type?: 'offered' | 'wanted';
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_skills_skill_id_fkey";
            columns: ["skill_id"];
            isOneToOne: false;
            referencedRelation: "skills";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_skills_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      accept_credit_swap: {
        Args: { p_swap_id: string };
        Returns: Json;
      };
      add_user_skill: {
        Args: { p_skill_name: string; p_skill_type: string };
        Returns: Json;
      };
      cancel_credit_swap: {
        Args: { p_swap_id: string };
        Returns: Json;
      };
      check_password_reset_rate_limit: {
        Args: { p_ip_address: string };
        Returns: boolean;
      };
      check_username_available: {
        Args: { p_username: string };
        Returns: boolean;
      };
      complete_credit_swap: {
        Args: { p_swap_id: string };
        Returns: Json;
      };
      complete_profile: {
        Args: { p_user_id?: string };
        Returns: Json;
      };
      create_credit_swap: {
        Args: {
          p_topic: string;
          p_description: string;
          p_requirements: string;
          p_credit_amount: number;
          p_tags: string[];
          p_additional_message?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: string;
      };
      credit_add_for_user: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_transaction_type?: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      credit_transfer: {
        Args: {
          p_payer_id: string;
          p_recipient_id: string;
          p_amount: number;
          p_reason: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      delete_swap_message_attachment: {
        Args: { p_attachment_id: string };
        Returns: Json;
      };
      delete_chat_attachment_manual: {
        Args: { p_attachment_id: string };
        Returns: Json;
      };
      ensure_credit_account: {
        Args: { p_user_id: string };
        Returns: Json;
      };
      expire_abandoned_swaps: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_user_account: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      get_user_by_email: {
        Args: { p_email: string };
        Returns: Json;
      };
      get_user_credit_transactions: {
        Args: { p_limit?: number; p_offset?: number };
        Returns: Json;
      };
      has_user_password: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      mark_file_storage_deleted: {
        Args: { p_source: string; p_file_id: string };
        Returns: boolean;
      };
      mark_file_storage_failed: {
        Args: { p_source: string; p_file_id: string; p_error: string };
        Returns: boolean;
      };
      process_submitted_swap_timeouts: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      reconcile_credit_balances: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      refresh_profile_review_metrics: {
        Args: { p_user_id: string };
        Returns: void;
      };
      refresh_profile_trust_metrics: {
        Args: { p_user_id: string };
        Returns: void;
      };
      register_swap_attachment: {
        Args: {
          p_swap_id: string;
          p_storage_path: string;
          p_file_name: string;
          p_mime_type?: string | null;
          p_file_size?: number | null;
        };
        Returns: Json;
      };
      register_swap_message_attachment: {
        Args: {
          p_message_id: string;
          p_swap_id: string;
          p_storage_path: string;
          p_file_name: string;
          p_mime_type?: string | null;
          p_file_size?: number | null;
        };
        Returns: Json;
      };
      release_reserved_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_reason: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      reserve_my_credits: {
        Args: {
          p_amount: number;
          p_reason: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      send_chat_message_with_attachments: {
        Args: {
          p_swap_id: string;
          p_recipient_id: string;
          p_body: string;
          p_attachments?: Json;
          p_message_id?: string;
        };
        Returns: Json;
      };
      settle_reserved_credit_transfer: {
        Args: {
          p_payer_id: string;
          p_recipient_id: string;
          p_amount: number;
          p_reason: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      spend_my_credits: {
        Args: {
          p_amount: number;
          p_reason: string;
          p_related_swap_id?: string | null;
        };
        Returns: Json;
      };
      submit_swap_review: {
        Args: {
          p_swap_id: string;
          p_rating: number;
          p_review_text?: string | null;
        };
        Returns: Json;
      };
      submit_swap_work: {
        Args: {
          p_swap_id: string;
          p_notes?: string;
          p_files?: Json;
        };
        Returns: Json;
      };
      unregister_swap_attachment: {
        Args: { p_attachment_id: string };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
  };
}
