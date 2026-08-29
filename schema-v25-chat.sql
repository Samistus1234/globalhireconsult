-- v25_chat
-- Pair chat between eLab staff (admin role) and recruiters / applicants.
-- Design notes (read before applying):
--   * All reads/writes go through the `chat` edge function (service-role client),
--     exactly like globalhire.messages today. No client-side INSERT/UPDATE exists,
--     so no write policies are granted to anon/authenticated.
--   * RLS is still enabled as defense-in-depth: participants (and admins) can
--     SELECT their own threads/messages; everyone else sees zero rows.
--   * Canonical pair ordering (participant_a < participant_b) is enforced by a
--     BEFORE INSERT trigger so the UNIQUE(participant_a, participant_b) pair
--     constraint is robust regardless of caller ordering.
--   * Realtime: chat_messages is added to supabase_realtime so the portal
--     surfaces can live-update on new messages (precedent: dashboard-live.js).
--   * No public.gh_* view in v1: the edge function returns peer display info
--     (names/roles) directly, avoiding security_invoker join grants on
--     globalhire.profiles (see v24b auth.users gotcha for the same class of issue).

begin;

-- ── chat_threads ────────────────────────────────────────────────────────────
create table globalhire.chat_threads (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references globalhire.profiles(id) on delete cascade,
  participant_b uuid not null references globalhire.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  constraint chat_threads_pair_unique unique (participant_a, participant_b),
  constraint chat_threads_distinct_participants check (participant_a <> participant_b)
);

create index chat_threads_a_last on globalhire.chat_threads (participant_a, last_message_at desc);
create index chat_threads_b_last on globalhire.chat_threads (participant_b, last_message_at desc);

-- Canonical pair ordering so UNIQUE(a,b) is robust to caller ordering.
create or replace function globalhire.chat_thread_canonical() returns trigger
language plpgsql as $$
declare
  _tmp uuid;
begin
  if new.participant_a > new.participant_b then
    _tmp := new.participant_a;
    new.participant_a := new.participant_b;
    new.participant_b := _tmp;
  end if;
  return new;
end $$;

create trigger trg_chat_thread_canonical
  before insert on globalhire.chat_threads
  for each row execute function globalhire.chat_thread_canonical();

-- ── chat_messages ───────────────────────────────────────────────────────────
create table globalhire.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references globalhire.chat_threads(id) on delete cascade,
  sender_id uuid not null references globalhire.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index chat_messages_thread_created on globalhire.chat_messages (thread_id, created_at);
create index chat_messages_unread on globalhire.chat_messages (thread_id, sender_id) where read_at is null;

-- Keep thread summary (last_message_at / preview) current.
create or replace function globalhire.touch_chat_thread() returns trigger
language plpgsql as $$
begin
  update globalhire.chat_threads
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 120)
   where id = new.thread_id;
  return new;
end $$;

create trigger trg_chat_thread_touch
  after insert on globalhire.chat_messages
  for each row execute function globalhire.touch_chat_thread();

-- ── RLS (defense-in-depth; no client write path exists) ─────────────────────
alter table globalhire.chat_threads enable row level security;
alter table globalhire.chat_messages enable row level security;

create policy chat_threads_participant_select
  on globalhire.chat_threads for select to authenticated
  using (participant_a = auth.uid() or participant_b = auth.uid());

create policy chat_threads_admin_select
  on globalhire.chat_threads for select to authenticated
  using (globalhire.is_admin());

create policy chat_messages_participant_select
  on globalhire.chat_messages for select to authenticated
  using (exists (
    select 1 from globalhire.chat_threads t
    where t.id = chat_messages.thread_id
      and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
  ));

create policy chat_messages_admin_select
  on globalhire.chat_messages for select to authenticated
  using (globalhire.is_admin());

-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'globalhire'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table globalhire.chat_messages;
  end if;
end $$;

-- ── VERIFICATION (run in SQL editor after apply) ────────────────────────────
-- select tablename from pg_publication_tables where pubname='supabase_realtime'
--   and schemaname='globalhire' and tablename='chat_messages';
-- \d globalhire.chat_threads

commit;
