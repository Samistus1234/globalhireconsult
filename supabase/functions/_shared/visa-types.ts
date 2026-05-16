// supabase/functions/_shared/visa-types.ts
// TypeScript mirror of globalhire visa enums + table row shapes.
// Imported by all visa-related edge functions.

export type VisaType =
  | 'tourist'
  | 'umrah'
  | 'hajj'
  | 'family_visit'
  | 'family_residence'
  | 'business'
  | 'work_iqama'
  | 'premium_residency'
  | 'investor_misa'
  | 'transit'
  | 'domestic_worker';

export const V1_VISA_TYPES: VisaType[] = [
  'tourist', 'umrah', 'family_visit', 'family_residence',
];

export type VisaCaseStatus =
  | 'lead'
  | 'eligibility_passed'
  | 'deposit_pending'
  | 'intake_in_review'
  | 'docs_revision'
  | 'submitted_to_partner'
  | 'partner_processing'
  | 'approved'
  | 'issued'
  | 'rejected_intake'
  | 'rejected_partner'
  | 'refunded'
  | 'stale'
  | 'on_hold';

export interface VisaLead {
  id: string;
  created_at: string;
  outcome: string;
  suggested_visa: VisaType | null;
  nationality: string | null;
  sponsor_iqama: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  session_id: string | null;
  passed_eligibility: boolean;
}

export interface VisaCase {
  id: string;
  created_at: string;
  candidate_id: string;
  lead_id: string | null;
  visa_type: VisaType;
  status: VisaCaseStatus;
  current_state_changed_at: string;
  sponsor_iqama: string | null;
  sponsor_name: string | null;
  travel_dates: { arrival?: string; stay_days?: number } | null;
  estimated_total_usd: number | null;
  deposit_paid_at: string | null;
  balance_invoiced_at: string | null;
  partner_reference: string | null;
  partner_submitted_at: string | null;
  issued_at: string | null;
  visa_pdf_path: string | null;
  refund_reason: string | null;
}

export type DocKind =
  | 'passport_bio'
  | 'passport_photo'
  | 'sponsor_iqama'
  | 'salary_certificate'
  | 'marriage_certificate'
  | 'birth_certificate'
  | 'invitation_letter'
  | 'business_licence'
  | 'other';

export interface VisaCaseDocument {
  id: string;
  case_id: string;
  doc_kind: DocKind;
  storage_path: string;
  uploaded_at: string;
  review_status: 'pending' | 'accepted' | 'rejected';
  reviewer_note: string | null;
}

// Wizard outcome chip → suggested visa mapping (used by the wizard handler).
// Outcomes that map to v2/v3 visas point to those types but the UI shows a
// "coming soon" deflection for v1.
export const OUTCOME_TO_VISA: Record<string, VisaType> = {
  'visit-saudi':         'tourist',
  'go-for-umrah':        'umrah',
  'perform-hajj':        'hajj',
  'bring-my-family':     'family_visit',
  'work-in-ksa':         'work_iqama',
  'hire-a-helper':       'domestic_worker',
  'do-business':         'business',
  'live-permanently':    'premium_residency',
};
