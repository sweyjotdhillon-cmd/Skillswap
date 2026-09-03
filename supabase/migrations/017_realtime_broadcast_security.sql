-- Migration 017: Realtime Broadcast Channel Security for Swap Chat
-- Description: Enforce RLS on realtime.messages so only authenticated swap participants or requesters can subscribe/broadcast to chat channels

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'realtime' AND table_name = 'messages') THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Swap members can listen and broadcast chat realtime" ON realtime.messages;
    CREATE POLICY "Swap members can listen and broadcast chat realtime" ON realtime.messages
      FOR ALL TO authenticated
      USING (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND (
                  s.requester_id = auth.uid() OR
                  s.participant_id = auth.uid() OR
                  (s.participant_id IS NULL AND (s.chat_permission = 'anyone' OR (s.chat_permission = 'requester' AND s.requester_id = auth.uid())))
                )
            )
          ELSE true
        END
      )
      WITH CHECK (
        CASE
          WHEN realtime.topic() LIKE 'skillswap-chat:%' THEN
            EXISTS (
              SELECT 1 FROM public.swaps s
              WHERE s.id::text = substring(realtime.topic() from 'skillswap-chat:(.*)')
                AND (
                  s.requester_id = auth.uid() OR
                  s.participant_id = auth.uid() OR
                  (s.participant_id IS NULL AND (s.chat_permission = 'anyone' OR (s.chat_permission = 'requester' AND s.requester_id = auth.uid())))
                )
            )
          ELSE true
        END
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
