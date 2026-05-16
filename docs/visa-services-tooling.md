# Visa Services — Tooling

## Schema migrations

GlobalHire schema changes ship as `schema-vN.sql` files at the repo root. Run them by hand in the Supabase SQL Editor in numerical order. Each file ends with a `-- VERIFICATION` query you should execute after applying.

Visa-services additions:

- `schema-v15.sql` — enums + tables + indexes + state-change trigger
- `schema-v15-rls.sql` — row-level security policies
- `schema-v15-storage.sql` — `visa-documents` storage bucket + policies
- `schema-v15-wrapper-views.sql` — `public.gh_visa_*` views so frontend `ghFrom()` helper works

Apply order: v15 → v15-rls → v15-storage → v15-wrapper-views.

## Edge function tests

Edge functions live in `supabase/functions/`. Unit tests use Deno's built-in test runner.

```bash
# Install Deno (one-time)
brew install deno

# Run all tests
cd supabase/functions
deno task test

# Run one file
deno task test _shared/visa-eligibility-rules_test.ts
```

Tests are colocated with the file they test (`foo.ts` + `foo_test.ts`).

## Local function serving

```bash
supabase functions serve --env-file ./supabase/.env.local
# Then curl http://127.0.0.1:54321/functions/v1/<fn-name>
```

## Deploy

Deploy a single function:

```bash
supabase functions deploy <fn-name> --project-ref <ref>
```

The visa edge functions added by plans 2–4: `submit-visa-eligibility`, `check-visa-eligibility`, `start-visa-case`, `payment-webhook`, `submit-to-partner`, `partner-status-sync`, `notify-visa-status`.
