-- Migration 016: Chat RLS Policy Polish and Message Delivery Reliability
-- Description: Ensure swap messages RLS policy permits bidirectional message retrieval for participants, requesters, and open swap chat applicants

ALTER TABLE public.swap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swap_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Swap participants can read swap messages" ON public.swap_messages;
DROP POLICY IF EXISTS "Users can read their own swap messages" ON public.swap_messages;

CREATE POLICY "Users can read their own swap messages" ON public.swap_messages
  FOR SELECT TO authenticated
  USING (
    sender_id = auth.uid() OR recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "Participants can send swap messages" ON public.swap_messages;

CREATE POLICY "Participants can send swap messages" ON public.swap_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    sender_id <> recipient_id AND
    EXISTS (
      SELECT 1 FROM public.swaps s
      WHERE s.id = swap_id
        AND (
          (s.requester_id = auth.uid() AND s.participant_id = recipient_id) OR
          (s.participant_id = auth.uid() AND s.requester_id = recipient_id) OR
          (s.requester_id = recipient_id AND (s.participant_id IS NULL OR s.participant_id <> auth.uid()))
        )
        AND (
          s.status IN ('accepted', 'submitted', 'completed') OR
          (s.chat_permission = 'anyone') OR
          (s.chat_permission = 'requester' AND s.requester_id = auth.uid()) OR
          (s.chat_permission = 'participant' AND s.participant_id = auth.uid())
        )
    )
  );

GRANT SELECT, INSERT ON public.swap_messages TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
