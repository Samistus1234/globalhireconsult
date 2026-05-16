# Saudi Visa Services v1 — Post-Implementation Checklist

Generated 2026-05-16 at the end of the `feat/saudi-visa-services-v1` branch implementation. The code is in; this is what's needed before the line goes live.

## Already done ✓

- All 4 SQL migrations applied to live Supabase (`evzhnsugmvtqgmvzwyix`):
  - `schema-v15.sql` — 2 enums, 6 tables, 15 indexes, 1 trigger
  - `schema-v15-rls.sql` — 8 RLS policies + `globalhire.is_admin()` helper (reads `profiles.role='admin'`)
  - `schema-v15-storage.sql` — `visa-documents` bucket + 4 storage policies
  - `schema-v15-wrapper-views.sql` — 6 `public.gh_visa_*` wrapper views
- All 8 edge functions deployed:
  - `submit-visa-eligibility` (anon)
  - `check-visa-eligibility` (anon)
  - `start-visa-case` (auth)
  - `payment-webhook` (no-jwt; Paystack + Stripe)
  - `notify-visa-status` (no-jwt; internal)
  - `submit-to-partner` (admin)
  - `partner-status-sync` (no-jwt; admin + partner-token)
  - `visa-admin-action` (admin)
- 28 Deno unit tests pass
- Smoke tests: `submit-visa-eligibility` and `check-visa-eligibility` return correct responses
- 6 visa/admin HTML pages load Supabase SDK + `js/supabase-client.js`

## User-side actions (before soft launch)

### Secrets to add

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  META_WHATSAPP_PHONE_ID=... \
  META_WHATSAPP_TOKEN=... \
  PARTNER_INBOX=submissions@partner.example \
  PARTNER_WEBHOOK_TOKEN=$(openssl rand -hex 32) \
  GH_SITE_URL=https://globalhire-elab.vercel.app
```

Note: `SMTP_USER`/`SMTP_PASS` are used by `notify-visa-status` and `submit-to-partner`. Existing `GMAIL_USER`/`GMAIL_APP_PASSWORD` secrets play the same role on other functions. Either rename the existing secrets, or also add `SMTP_USER`/`SMTP_PASS` aliases pointing at the same values.

### Webhook URLs to register

- **Paystack Dashboard → Webhooks:** set URL to `https://evzhnsugmvtqgmvzwyix.functions.supabase.co/payment-webhook` and enable `charge.success`.
- **Stripe Dashboard → Webhooks:** set URL to the same; enable `checkout.session.completed`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
- **Partner status webhook (optional, when partner can push):** give them the URL `https://evzhnsugmvtqgmvzwyix.functions.supabase.co/partner-status-sync` plus the `PARTNER_WEBHOOK_TOKEN` you generated (sent in header `x-partner-token`).

### Meta WhatsApp templates

`notify-visa-status` falls back to a freeform text send. For 24h-rule compliance and Meta delivery quality, register 7 templates corresponding to `TEMPLATE_KINDS` in `supabase/functions/_shared/visa-templates.ts`:

1. `deposit-received`
2. `intake-passed`
3. `intake-needs-revision`
4. `submitted-to-partner`
5. `approved-balance-due`
6. `issued-pdf-available`
7. `rejected-with-refund`

Template content is also defined in `visa-templates.ts` (`whatsapp_text` field). Submit each via Meta Business Manager and wait for approval (typically 24h).

### Partner data to fill in

Search-and-replace these placeholders across `visa*.html` and `visa-about.html`:

| Placeholder | Where it appears |
|---|---|
| `[Partner Name]` | Hub hero subtitle, /visa/about, receipt copy, email footer |
| `MoFA Licence #[XXXX]` | /visa/about, "What's included" bullets on visa pages, receipt copy |
| Partner logo `[Logo]` placeholder | /visa/about |
| Partner bio paragraph | /visa/about |
| Wholesale prices behind "From $X" anchors | `js/visa-intake.js` ESTIMATES + each visa-detail HTML "From $X" + breakdown |

### Trust strip placeholder

`visa.html` trust strip has `[N+ candidates placed across GCC]`. Either verify a real number from GlobalHire's records and substitute, or remove that tile entirely. **Do not ship the fabricated 10,000+ figure.**

### Per-visa content review

The 4 visa-detail pages (`visa-tourist-evisa`, `visa-umrah`, `visa-family-visit`, `visa-family-residence`) ship with default copy that the partner should sign off on — particularly:

- Required documents lists
- Processing time estimates
- Eligibility nuances (e.g., Umrah Mahram declaration note)
- Refund policy wording

### Legal review

- Visa-specific T&Cs (currently only inline footnotes)
- Refund policy page (referenced from each visa detail page)
- Hajj quota disclaimer (not in v1 catalog but mentioned in spec)
- VAT / tax treatment (Nigeria + Saudi)

## Deferred e2e tests (run after first Vercel deploy of the branch)

- `tests/visa-funnel.spec.js` (in spec, not written) — Playwright happy path: hub → wizard → visa detail
- `tests/visa-intake-payment.spec.js` (in spec, not written) — login → /visa-start → form validation
- `tests/visa-admin.spec.js` (in spec, not written) — admin queue → case → action buttons

These were marked DEFERRED in the implementation plan because they need a deployed preview URL + seeded test users (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD` env vars). Write + run after Vercel deploys.

## Known v1 limitations (intentional, deferred to v2 / v3)

- **Hajj, Business, Work & Iqama, Premium Residency, Investor, Transit, Domestic Worker** — visible as "Coming soon" with WhatsApp deflection. v2 adds Business + Domestic Worker + Work & Iqama.
- **Bank transfer** for high-ticket visas — manual via admin only. v2 adds self-serve.
- **Partner submission via API** — v1 uses email channel. v3 if/when partner exposes an API.
- **Iqama-holder dashboard cross-sell module** — surfaces Family Visit / Residence / Domestic Worker to existing healthcare candidates. Deferred to v2.
- **`partner-status-sync` Stripe verification** — currently delegates to the configured webhook secret existence rather than re-verifying the HMAC-SHA256 signature locally. Harden in v2 if Stripe volume grows.
- **`passport_number` field on `visa_cases`** — not stored; partner reads from `passport_bio` doc. Add a column in v2.

## Architectural notes for future maintainers

- `globalhire.is_admin()` reads `profiles.role='admin'`. If admin checks change to a separate `is_admin` boolean column later, update both this function AND the three edge functions (`visa-admin-action`, `submit-to-partner`, `partner-status-sync`).
- Frontend JS queries hit PostgREST with `Accept-Profile: globalhire` header. The `public.gh_visa_*` wrapper views also exist for the `ghFrom()` helper convention but aren't used by the visa pages yet — migrate to `ghFrom()` in a v2 refactor if you want one source of truth.
- All visa-status transitions go through edge functions (no direct client writes to `visa_cases`). Service-role-only INSERT/UPDATE is enforced by the absence of RLS policies.
