-- v26_chat_attachments
-- Document upload for the chat interface.
--   * chat_messages.attachment jsonb (null = text-only): {path, name, mime, size}
--   * 'chat-files' storage bucket (private, 10MB cap) — files are never public;
--     uploads use signed upload URLs and downloads use signed read URLs, both
--     issued by the `chat` edge function after participant checks.
begin;

alter table globalhire.chat_messages
  add column attachment jsonb;

-- Thread preview should surface attachments when the message has no text.
create or replace function globalhire.touch_chat_thread() returns trigger
language plpgsql as $$
begin
  update globalhire.chat_threads
     set last_message_at = new.created_at,
         last_message_preview = left(
           coalesce(
             nullif(btrim(new.body), ''),
             '📎 ' || coalesce(new.attachment->>'name', 'Attachment')
           ),
           120
         )
   where id = new.thread_id;
  return new;
end $$;

-- Private bucket; access only via edge-function signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-files', 'chat-files', false, 10485760, null)
on conflict (id) do nothing;

commit;
