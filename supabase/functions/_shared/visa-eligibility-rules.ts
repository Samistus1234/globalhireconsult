// supabase/functions/_shared/visa-eligibility-rules.ts
// Pure rule engine. Plan 2's check-visa-eligibility edge function wraps this.

import type { VisaType, DocKind } from './visa-types.ts';
import { V1_VISA_TYPES } from './visa-types.ts';

export interface EligibilityInput {
  visa_type: VisaType;
  nationality?: string;
  sponsor_iqama?: string;
  sponsor_relationship?: 'spouse' | 'child' | 'parent';
  travel_dates?: { arrival?: string; stay_days?: number };
}

export interface EligibilityResult {
  passed: boolean;
  missingDocs: DocKind[];
  reasons: string[];
}

const COMMON_DOCS_PER_VISA: Record<VisaType, DocKind[]> = {
  tourist:           ['passport_bio', 'passport_photo'],
  umrah:             ['passport_bio', 'passport_photo'],
  family_visit:      ['passport_bio', 'passport_photo', 'sponsor_iqama', 'salary_certificate'],
  family_residence:  ['passport_bio', 'passport_photo', 'sponsor_iqama', 'salary_certificate', 'marriage_certificate'],
  business:          ['passport_bio', 'invitation_letter', 'business_licence'],
  work_iqama:        ['passport_bio', 'salary_certificate'],
  domestic_worker:   ['passport_bio', 'sponsor_iqama', 'salary_certificate'],
  hajj:              ['passport_bio'],
  premium_residency: ['passport_bio'],
  investor_misa:     ['passport_bio', 'business_licence'],
  transit:           ['passport_bio'],
};

export function runEligibility(input: EligibilityInput): EligibilityResult {
  const reasons: string[] = [];
  const missingDocs = COMMON_DOCS_PER_VISA[input.visa_type] ?? [];

  // v1 cutoff
  if (!V1_VISA_TYPES.includes(input.visa_type)) {
    reasons.push('This visa type is not yet available — please contact us on WhatsApp.');
    return { passed: false, missingDocs, reasons };
  }

  // Per-visa rules
  switch (input.visa_type) {
    case 'tourist':
      if (!input.nationality) reasons.push('Nationality required for tourist eVisa eligibility check.');
      break;
    case 'umrah':
      if (!input.nationality) reasons.push('Nationality required for Umrah visa.');
      break;
    case 'family_visit':
      if (!input.nationality)   reasons.push('Nationality required for Family Visit visa.');
      if (!input.sponsor_iqama) reasons.push('Sponsor Iqama number required for Family Visit visa.');
      break;
    case 'family_residence':
      if (!input.nationality)          reasons.push('Nationality required for Family Residence.');
      if (!input.sponsor_iqama)        reasons.push('Sponsor Iqama number required for Family Residence.');
      if (!input.sponsor_relationship) reasons.push('Relationship to sponsor required for Family Residence.');
      break;
  }

  return { passed: reasons.length === 0, missingDocs, reasons };
}
