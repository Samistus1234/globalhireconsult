import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
  chat — GlobalHire pair chat (eLab staff <-> recruiters / applicants)

  All reads/writes happen with the service-role client (RLS is defense-in-depth
  on the base tables; there is deliberately no client write path — see
  schema-v25-chat.sql). Caller identity is resolved from the JWT and enforced
  per action.

  POST body: { action, ... }
    - send:   { peer_id, body } or { thread_id, body }  → creates/finds the pair
              thread (canonical ordering participant_a < participant_b) and
              inserts the message. Optional attachment: { storage_path, name,
              mime, size } (path must live under chat-files/<caller-id>/).
              Returns { ok, thread_id, message }.
    - list:   {} → caller's threads, newest first, each with peer display info
              and unread count. Returns { threads: [...] }.
    - thread: { thread_id } → messages (chronological, latest 100) + peer info.
              Marks the caller's incoming messages as read. Returns
              { thread: {...}, messages: [...] }.
    - peers:  {} → admin only. All recruiters + applicants (id, full_name, role)
              for the "New Chat" picker.
    - upload-url:  { file_name, file_type, size } → signed upload URL for a new
              file in chat-files/<caller-id>/. Returns { storage_path, token }.
    - download-url: { message_id } → signed read URL for the message's
              attachment (participant-only). Returns { url }.

  Rules:
    - Caller must have a globalhire profile (any role).
    - Recruiters/applicants may only open chats with admin (eLab staff) users.
      Admins may chat with recruiters or applicants. No self-chat.
    - Attachments: max 10 MB; storage_path must live under the caller's own
      chat-files/<caller-id>/ folder; downloads require thread participation.
*/

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Caller profile (role gate)
    const { data: caller } = await sb
      .from("gh_profiles")
      .select("id, role, full_name")
      .eq("id", user.id)
      .single();
    if (!caller) return json({ error: "Profile not found" }, 404);

    const isAdmin = caller.role === "admin";
    const ME = user.id;

    const body = await req.json();
    const { action } = body;

    // ── peers: directory for the New Chat picker ──
    //    admin → all recruiters + applicants; non-admin → admins (eLab staff) only.
    if (action === "peers") {
      const { data: peers, error: peersErr } = await sb
        .from("gh_profiles")
        .select("id, full_name, role, avatar_initials, avatar_color_index")
        .in("role", isAdmin ? ["recruiter", "applicant"] : ["admin"])
        .order("full_name", { ascending: true })
        .limit(500);
      if (peersErr) return json({ error: "Failed to load peers: " + peersErr.message }, 500);
      return json({ peers: peers || [] });
    }

    // ── upload-url: signed upload URL for a chat attachment ──
    if (action === "upload-url") {
      const file_name = typeof body.file_name === "string" ? body.file_name.trim() : "";
      const file_type = typeof body.file_type === "string" ? body.file_type.trim() : "";
      const size = Number(body.size);
      if (!file_name) return json({ error: "file_name required" }, 400);
      if (!file_type) return json({ error: "file_type required" }, 400);
      if (!Number.isFinite(size) || size <= 0) return json({ error: "size required" }, 400);
      if (size > 10 * 1024 * 1024) return json({ error: "File too large (max 10 MB)" }, 400);

      // Basename + sanitize (strip path separators, control chars; cap length).
      // Path is bucket-relative: createSignedUploadUrl already scopes to
      // chat-files via .from("chat-files").
      const base = file_name.split(/[\\/]/).pop() || "file";
      const safe = base.replace(/[^\w.\- ]+/g, "_").slice(0, 150).trim() || "file";
      const storage_path = `${ME}/${crypto.randomUUID()}_${safe}`;

      const { data, error } = await sb.storage
        .from("chat-files")
        .createSignedUploadUrl(storage_path);
      if (error) return json({ error: "Failed to issue upload URL: " + error.message }, 500);

      return json({ storage_path, token: data?.token });
    }

    // ── download-url: signed read URL (participant-only) ──
    if (action === "download-url") {
      const mid = body.message_id;
      if (!mid) return json({ error: "message_id required" }, 400);

      const { data: msg } = await sb
        .schema("globalhire").from("chat_messages")
        .select("thread_id, attachment")
        .eq("id", mid)
        .maybeSingle();
      if (!msg) return json({ error: "Message not found" }, 404);

      const { data: thr } = await sb
        .schema("globalhire").from("chat_threads")
        .select("participant_a, participant_b")
        .eq("id", msg.thread_id)
        .maybeSingle();
      if (!thr || (thr.participant_a !== ME && thr.participant_b !== ME)) {
        return json({ error: "Not a participant of this thread" }, 403);
      }
      const att = msg.attachment as { path?: string } | null;
      if (!att || !att.path) return json({ error: "Message has no attachment" }, 400);

      const { data, error } = await sb.storage
        .from("chat-files")
        .createSignedUrl(att.path, 600);
      if (error) return json({ error: "Failed to issue download URL: " + error.message }, 500);

      return json({ url: data?.signedUrl });
    }

    // ── send ──
    if (action === "send") {
      const peerId = body.peer_id || null;
      const threadId = body.thread_id || null;
      const rawBody = typeof body.body === "string" ? body.body.trim() : "";
      const attachment = body.attachment || null;
      if (rawBody.length > 4000) return json({ error: "Message too long (max 4000 chars)" }, 400);
      if (!rawBody && !attachment) return json({ error: "Message body or attachment required" }, 400);
      if (!peerId && !threadId) return json({ error: "peer_id or thread_id required" }, 400);

      let attPayload: Record<string, unknown> | null = null;
      if (attachment) {
        const { storage_path, name, mime, size } = attachment as Record<string, unknown>;
        if (typeof storage_path !== "string" || typeof name !== "string" ||
            typeof mime !== "string" || typeof size !== "number") {
          return json({ error: "Invalid attachment payload" }, 400);
        }
        if (!storage_path.startsWith(`${ME}/`)) {
          return json({ error: "Attachment path must be in your own folder" }, 400);
        }
        if (size <= 0 || size > 10 * 1024 * 1024) return json({ error: "Invalid attachment size" }, 400);
        attPayload = { path: storage_path, name: name.slice(0, 150), mime, size };
      }

      let tid = threadId;

      if (tid) {
        // Existing thread — verify caller is a participant
        const { data: thr, error: thrErr } = await sb
          .schema("globalhire").from("chat_threads")
          .select("id, participant_a, participant_b")
          .eq("id", tid)
          .maybeSingle();
        if (thrErr) return json({ error: "Failed to load thread: " + thrErr.message }, 500);
        if (!thr) return json({ error: "Thread not found" }, 404);
        if (thr.participant_a !== ME && thr.participant_b !== ME) {
          return json({ error: "Not a participant of this thread" }, 403);
        }
      } else {
        // New thread — resolve peer + role rules
        if (peerId === ME) return json({ error: "Cannot message yourself" }, 400);
        const { data: peer, error: peerErr } = await sb
          .from("gh_profiles")
          .select("id, role")
          .eq("id", peerId)
          .maybeSingle();
        if (peerErr) return json({ error: "Failed to load peer: " + peerErr.message }, 500);
        if (!peer) return json({ error: "Peer not found" }, 404);
        if (!isAdmin && peer.role !== "admin") {
          return json({ error: "Recruiters and applicants can only message eLab staff" }, 403);
        }
        if (isAdmin && !["recruiter", "applicant"].includes(peer.role)) {
          return json({ error: "Admins can only message recruiters or applicants" }, 400);
        }

        // Canonical pair ordering (participant_a < participant_b)
        const a = ME < peerId ? ME : peerId;
        const b = ME < peerId ? peerId : ME;
        const { data: existing } = await sb
          .schema("globalhire").from("chat_threads")
          .select("id")
          .eq("participant_a", a)
          .eq("participant_b", b)
          .maybeSingle();
        if (existing) {
          tid = existing.id;
        } else {
          const { data: created, error: createErr } = await sb
            .schema("globalhire").from("chat_threads")
            .insert({ participant_a: a, participant_b: b })
            .select("id")
            .single();
          if (createErr) return json({ error: "Failed to create thread: " + createErr.message }, 500);
          tid = created.id;
        }
      }

      const { data: message, error: msgErr } = await sb
        .schema("globalhire").from("chat_messages")
        .insert({ thread_id: tid, sender_id: ME, body: rawBody, attachment: attPayload })
        .select("id, thread_id, sender_id, body, attachment, created_at, read_at")
        .single();
      if (msgErr) return json({ error: "Failed to send: " + msgErr.message }, 500);

      return json({ ok: true, thread_id: tid, message });
    }

    // ── list ──
    if (action === "list") {
      const { data: threads, error: listErr } = await sb
        .schema("globalhire").from("chat_threads")
        .select("id, participant_a, participant_b, created_at, last_message_at, last_message_preview")
        .or(`participant_a.eq.${ME},participant_b.eq.${ME}`)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (listErr) return json({ error: "Failed to list threads: " + listErr.message }, 500);

      if (!threads || threads.length === 0) return json({ threads: [] });

      const peerIds = threads.map((t) => (t.participant_a === ME ? t.participant_b : t.participant_a));
      const { data: peers } = await sb
        .from("gh_profiles")
        .select("id, full_name, role, avatar_initials, avatar_color_index")
        .in("id", peerIds);
      const peerMap: Record<string, any> = {};
      (peers || []).forEach((p) => { peerMap[p.id] = p; });

      const threadIds = threads.map((t) => t.id);
      const { data: unreadRows } = await sb
        .schema("globalhire").from("chat_messages")
        .select("thread_id")
        .in("thread_id", threadIds)
        .neq("sender_id", ME)
        .is("read_at", null);
      const unreadMap: Record<string, number> = {};
      (unreadRows || []).forEach((r) => { unreadMap[r.thread_id] = (unreadMap[r.thread_id] || 0) + 1; });

      return json({
        threads: threads.map((t) => {
          const peerId = t.participant_a === ME ? t.participant_b : t.participant_a;
          const peer = peerMap[peerId] || { id: peerId, full_name: "Unknown", role: null };
          return {
            thread_id: t.id,
            peer: {
              id: peer.id,
              full_name: peer.full_name || "Unknown",
              role: peer.role || null,
              avatar_initials: peer.avatar_initials || null,
              avatar_color_index: peer.avatar_color_index || null,
            },
            last_message_at: t.last_message_at,
            last_message_preview: t.last_message_preview,
            unread: unreadMap[t.id] || 0,
            created_at: t.created_at,
          };
        }),
      });
    }

    // ── thread ──
    if (action === "thread") {
      const tid = body.thread_id;
      if (!tid) return json({ error: "thread_id required" }, 400);

      const { data: thr, error: thrErr } = await sb
        .schema("globalhire").from("chat_threads")
        .select("id, participant_a, participant_b, created_at")
        .eq("id", tid)
        .maybeSingle();
      if (thrErr) return json({ error: "Failed to load thread: " + thrErr.message }, 500);
      if (!thr) return json({ error: "Thread not found" }, 404);
      if (thr.participant_a !== ME && thr.participant_b !== ME) {
        return json({ error: "Not a participant of this thread" }, 403);
      }

      const peerId = thr.participant_a === ME ? thr.participant_b : thr.participant_a;
      const { data: peer } = await sb
        .from("gh_profiles")
        .select("id, full_name, role, avatar_initials, avatar_color_index")
        .eq("id", peerId)
        .maybeSingle();

      // Mark incoming as read FIRST so the response reflects the read state
      // (best-effort; never blocks the response)
      await sb
        .schema("globalhire").from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("thread_id", tid)
        .neq("sender_id", ME)
        .is("read_at", null);

      // Latest 100, returned chronologically
      const { data: rows } = await sb
        .schema("globalhire").from("chat_messages")
        .select("id, sender_id, body, attachment, created_at, read_at")
        .eq("thread_id", tid)
        .order("created_at", { ascending: false })
        .limit(100);
      const messages = (rows || []).reverse();

      return json({
        thread: {
          id: thr.id,
          peer: peer || { id: peerId, full_name: "Unknown", role: null },
        },
        messages,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: "Unexpected error: " + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
