-- v49: keep what the visa start form collects.
-- start-visa-case used to drop the applicant's passport number, nationality and WhatsApp,
-- the sponsor relationship and the travellers. These columns hold them; the CC sync
-- (gh-visa-sync-push -> CC visa-sync-receive) carries them to case_visa_details.
alter table globalhire.visa_cases
  add column if not exists applicant_details    jsonb,
  add column if not exists sponsor_relationship text[],
  add column if not exists travellers           jsonb;

comment on column globalhire.visa_cases.applicant_details is
  '{passport_number, nationality, whatsapp} from visa-start; checked in start-visa-case (case-row.ts sanitizeApplicant).';
comment on column globalhire.visa_cases.sponsor_relationship is
  'Any of spouse, child, parent (family visas).';
comment on column globalhire.visa_cases.travellers is
  '{people, currency, total, counts, lines}: the price check the applicant saw on visa.html.';
