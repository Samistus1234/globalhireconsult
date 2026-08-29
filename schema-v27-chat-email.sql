-- v27_chat_email
-- Email-from-chat: recruiters/applicants can be emailed from inside a chat
-- thread. chat_messages gains a `kind` column ('message' default, 'email' for
-- email-sent entries) plus email_meta jsonb {subject, to_email, body} so the
-- email appears in the thread timeline alongside regular messages.
begin;

alter table globalhire.chat_messages add column kind text not null default 'message';
alter table globalhire.chat_messages add column email_meta jsonb;

-- Email entries have no bubble text (body = ''), so exempt kind='email' rows
-- from the body-presence check (schema-v25 defined the original constraint).
alter table globalhire.chat_messages drop constraint if exists chat_messages_body_check;
alter table globalhire.chat_messages add constraint chat_messages_body_check check (
  kind = 'email' or char_length(btrim(body)) > 0
);

-- Thread preview: email entries show "[📧] subject" instead of an empty line.
create or replace function globalhire.touch_chat_thread() returns trigger
language plpgsql as $$
begin
  update globalhire.chat_threads
     set last_message_at = new.created_at,
         last_message_preview = case
           when new.kind = 'email' then '[📧] ' || coalesce(new.email_meta->>'subject', 'Email')
           else left(new.body, 120)
         end
   where id = new.thread_id;
  return new;
end $$;

commit;
