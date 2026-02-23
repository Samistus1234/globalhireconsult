/* ============================================
   GLOBALHIRE@ELAB — Country Detail Page
   Loads country data from URL param, populates DOM
   ============================================ */

(function() {
  'use strict';

  /* ── Country Data ── */
  var COUNTRIES = {
    gb: {
      code: 'gb', name: 'United Kingdom', flag: '\ud83c\uddec\ud83c\udde7', region: 'Europe',
      avgSalary: '\u00a328,000 \u2013 \u00a345,000', processingTime: '3\u20136 months', language: 'English',
      healthcareSystem: 'National Health Service (NHS)',
      glance: {
        healthcare: 'Universal public healthcare through the NHS, the largest single-payer system in the world. Funded through taxation, it provides free-at-point-of-use care to all UK residents. The NHS employs over 1.5 million staff and is the largest employer in Europe.',
        language: 'English (IELTS 7.0+ overall or OET B required for NMC registration). All four components must meet the minimum score. Some trusts may require higher scores for specialist roles.',
        costOfLiving: 'Medium-High. London is significantly more expensive (30\u201350% above national average). Cities like Manchester, Birmingham, and Leeds offer more affordable living with excellent quality of life.',
        workLife: '37.5 hours/week standard. 27\u201333 days annual leave (increases with service). Generous NHS pension scheme. Access to NHS discounts and wellbeing programs.'
      },
      licensingSteps: [
        { title: 'Apply to NMC', desc: 'Submit your online application to the Nursing and Midwifery Council (NMC) with all required documentation and pay the application fee.' },
        { title: 'CBT Exam', desc: 'Pass the Computer Based Test covering numeracy, clinical knowledge, and UK-specific healthcare legislation and guidelines.' },
        { title: 'OSCE Exam', desc: 'Pass the Objective Structured Clinical Examination \u2014 a practical skills assessment conducted at an NMC-approved test centre.' },
        { title: 'Registration', desc: 'Receive your NMC PIN number and register on the NMC register. You can now legally practise as a nurse or midwife in the UK.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing degree certificate', 'Transcript of training', 'English language test results (IELTS/OET)', 'Character reference', 'Certificate of good standing'],
      jobs: [
        { title: 'ICU Nurse \u2014 Band 5/6', employer: 'NHS Manchester University Foundation Trust', logo: 'NH', logoStyle: 'background:linear-gradient(135deg,#1a5276,#2e86c1);color:#fff', salary: '\u00a334,500', period: 'year', match: 95, accent: 'var(--primary)', tags: ['Critical Care', 'ICU', 'NMC Registration'] },
        { title: 'Theatre Nurse', employer: 'Guy\u2019s and St Thomas\u2019 NHS Foundation Trust', logo: 'GS', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: '\u00a332,000', period: 'year', match: 88, accent: 'var(--secondary)', tags: ['Perioperative', 'Surgical', 'Band 5'] },
        { title: 'Mental Health Nurse', employer: 'South London and Maudsley NHS Trust', logo: 'SL', logoStyle: 'background:linear-gradient(135deg,#6c3483,#a569bd);color:#fff', salary: '\u00a335,000', period: 'year', match: 82, accent: 'var(--accent-cyan)', tags: ['Psychiatry', 'Community', 'Band 6'] }
      ],
      guides: [
        { title: 'Complete Guide to NMC Registration for International Nurses', tag: 'Licensing', readTime: '12 min' },
        { title: 'Living and Working in the UK: What Healthcare Professionals Need to Know', tag: 'Relocation', readTime: '8 min' },
        { title: 'NHS Pay Bands Explained: Salary Guide 2026', tag: 'Salary', readTime: '6 min' }
      ],
      stories: [
        { quote: 'Moving from Nigeria to Manchester was the best decision I ever made. The NHS supported my transition with a dedicated preceptorship programme, and GlobalHire made the credentialing process seamless.', name: 'Amara Okafor', role: 'ICU Nurse, NHS Manchester', initials: 'AO', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'I was nervous about the OSCE exam, but the preparation resources and mentoring connected through GlobalHire gave me the confidence I needed. I passed on my first attempt.', name: 'Priya Sharma', role: 'Staff Nurse, Royal London Hospital', initials: 'PS', color: '#7c5cff', textColor: '#fff' }
      ]
    },

    us: {
      code: 'us', name: 'United States', flag: '\ud83c\uddfa\ud83c\uddf8', region: 'North America',
      avgSalary: '$65,000 \u2013 $120,000', processingTime: '6\u201312 months', language: 'English',
      healthcareSystem: 'Mixed Private & Public (Medicare/Medicaid)',
      glance: {
        healthcare: 'A mixed healthcare system combining private insurance, employer-sponsored plans, and government programs (Medicare for seniors, Medicaid for low-income). The US has the highest healthcare spending per capita globally with world-renowned research hospitals and medical centres.',
        language: 'English (TOEFL iBT 83+ or IELTS 6.5+ for most state boards). Some states accept alternative English proficiency evidence for nurses educated in English-speaking countries.',
        costOfLiving: 'Varies significantly by region. Major metros (NYC, San Francisco, Boston) are very high. Midwest and Southern states offer much lower costs with competitive salaries.',
        workLife: '36\u201340 hours/week. 10\u201320 days PTO (varies by employer). Many hospitals offer shift differentials, sign-on bonuses, and tuition reimbursement programs.'
      },
      licensingSteps: [
        { title: 'CGFNS Evaluation', desc: 'Submit credentials to the Commission on Graduates of Foreign Nursing Schools (CGFNS) for a credentials evaluation report (CES).' },
        { title: 'NCLEX-RN Exam', desc: 'Register and pass the National Council Licensure Examination for Registered Nurses. This is the standardised licensing exam for all US states.' },
        { title: 'State Licensure', desc: 'Apply for RN licensure in your target state\u2019s Board of Nursing. Requirements vary by state; some require additional documentation.' },
        { title: 'VisaScreen Certificate', desc: 'Obtain a VisaScreen certificate from CGFNS, required for occupational visas. Verifies education, licensing, and English proficiency.' },
        { title: 'Visa & Immigration', desc: 'Secure an employment-based visa (typically EB-3 or H-1B for nurses) through your sponsoring employer. Green card pathway available.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing degree with transcripts', 'CGFNS credentials evaluation', 'NCLEX-RN pass confirmation', 'English proficiency scores', 'State license verification', 'VisaScreen certificate', 'Background check clearance'],
      jobs: [
        { title: 'Registered Nurse \u2014 Medical-Surgical', employer: 'Mayo Clinic, Rochester MN', logo: 'MC', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2e86c1);color:#fff', salary: '$78,000', period: 'year', match: 92, accent: 'var(--primary)', tags: ['Med-Surg', 'Visa Sponsored', 'Benefits'] },
        { title: 'Emergency Department RN', employer: 'Johns Hopkins Hospital, Baltimore', logo: 'JH', logoStyle: 'background:linear-gradient(135deg,#1a237e,#3f51b5);color:#fff', salary: '$85,000', period: 'year', match: 89, accent: 'var(--accent-amber)', tags: ['Emergency', 'Level I Trauma', 'Sign-on Bonus'] },
        { title: 'Pediatric Nurse Practitioner', employer: 'Boston Children\u2019s Hospital', logo: 'BC', logoStyle: 'background:linear-gradient(135deg,#b71c1c,#e53935);color:#fff', salary: '$105,000', period: 'year', match: 85, accent: 'var(--secondary)', tags: ['Pediatrics', 'NP License', 'Research'] }
      ],
      guides: [
        { title: 'NCLEX-RN Preparation Guide for International Nurses', tag: 'Licensing', readTime: '15 min' },
        { title: 'US Visa Options for Healthcare Professionals: EB-3 vs H-1B', tag: 'Immigration', readTime: '10 min' },
        { title: 'State-by-State Nursing License Requirements', tag: 'Licensing', readTime: '12 min' }
      ],
      stories: [
        { quote: 'After 8 months of preparation, I landed my dream job at Mayo Clinic. The salary is incredible compared to home, and the professional development opportunities are endless. GlobalHire guided me through every step.', name: 'Carlos Mendoza', role: 'RN, Mayo Clinic Rochester', initials: 'CM', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'The NCLEX was challenging but the structured preparation plan from GlobalHire made it manageable. Now I work at one of the best hospitals in the world and I\u2019m on the path to a Green Card.', name: 'Fatima Al-Hassan', role: 'ER Nurse, Johns Hopkins', initials: 'FA', color: '#ffb020', textColor: '#080a0d' }
      ]
    },

    ae: {
      code: 'ae', name: 'United Arab Emirates', flag: '\ud83c\udde6\ud83c\uddea', region: 'Middle East',
      avgSalary: 'AED 180,000 \u2013 AED 420,000', processingTime: '2\u20134 months', language: 'English / Arabic',
      healthcareSystem: 'Mixed Public & Private (DHA/HAAD/MOH)',
      glance: {
        healthcare: 'Rapidly expanding healthcare system with world-class private hospitals alongside government facilities. Regulated by DHA (Dubai), DOH (Abu Dhabi), and MOH (other emirates). Significant investment in medical tourism and healthcare infrastructure.',
        language: 'English is the primary working language in most hospitals. Arabic is an advantage but not required for most clinical roles. Some facilities prefer bilingual candidates.',
        costOfLiving: 'Medium-High. Housing is the largest expense. Many employers provide housing allowance or accommodation. No income tax, which significantly boosts take-home pay.',
        workLife: '40\u201348 hours/week. 30 days annual leave. Tax-free salary with comprehensive benefits packages typically including housing, flights, and medical insurance.'
      },
      licensingSteps: [
        { title: 'Dataflow Verification', desc: 'Complete Primary Source Verification (PSV) through Dataflow Group. All credentials and employment history are verified at source.' },
        { title: 'Authority Exam', desc: 'Pass the licensing exam administered by DHA (Dubai), DOH (Abu Dhabi), or MOH depending on your emirate of employment.' },
        { title: 'License Application', desc: 'Submit your application to the relevant health authority with all verified documents, exam results, and employer sponsorship letter.' },
        { title: 'Visa & Licensing', desc: 'Employer processes your work visa and residence permit. Professional license is issued once visa formalities are completed.' }
      ],
      requiredDocs: ['Valid passport (6+ months validity)', 'Nursing degree certificate', 'Dataflow verification report', 'Good standing certificate', 'Experience certificates', 'Passport photos', 'Medical fitness certificate'],
      jobs: [
        { title: 'Emergency Medicine Physician', employer: 'Cleveland Clinic Abu Dhabi', logo: 'CC', logoStyle: 'background:linear-gradient(135deg,#8e44ad,#bb8fce);color:#fff', salary: '$185,000', period: 'year', match: 91, accent: 'var(--secondary)', tags: ['Emergency', 'Board Certified', 'Tax-Free'] },
        { title: 'NICU Nurse', employer: 'King\u2019s College Hospital Dubai', logo: 'KC', logoStyle: 'background:linear-gradient(135deg,#d4a017,#f1c40f);color:#080a0d', salary: 'AED 22,000', period: 'month', match: 87, accent: 'var(--accent-amber)', tags: ['Neonatal', 'Housing Provided', 'Visa Sponsored'] },
        { title: 'Operating Room Nurse', employer: 'Mediclinic City Hospital, Dubai', logo: 'MC', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2e86c1);color:#fff', salary: 'AED 18,000', period: 'month', match: 84, accent: 'var(--primary)', tags: ['Perioperative', 'DHA License', 'Benefits'] }
      ],
      guides: [
        { title: 'DHA vs DOH vs MOH: Understanding UAE Healthcare Licensing', tag: 'Licensing', readTime: '10 min' },
        { title: 'Living in Dubai as a Healthcare Professional', tag: 'Relocation', readTime: '8 min' }
      ],
      stories: [
        { quote: 'The tax-free salary in Dubai allowed me to save more in 2 years than I did in 5 years back home. The hospital provided housing and my family joined me within 3 months. GlobalHire made the Dataflow process painless.', name: 'Florence Okafor', role: 'ICU Nurse, Cleveland Clinic Abu Dhabi', initials: 'FO', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'Working at a world-class facility in Abu Dhabi has elevated my career. The multicultural team environment is incredible \u2014 I work alongside professionals from over 40 nationalities.', name: 'James Mwangi', role: 'ER Nurse, Sheikh Khalifa Medical City', initials: 'JM', color: '#7c5cff', textColor: '#fff' }
      ]
    },

    sa: {
      code: 'sa', name: 'Saudi Arabia', flag: '\ud83c\uddf8\ud83c\udde6', region: 'Middle East',
      avgSalary: 'SAR 150,000 \u2013 SAR 360,000', processingTime: '2\u20135 months', language: 'Arabic / English',
      healthcareSystem: 'Ministry of Health (MOH) & Private Sector',
      glance: {
        healthcare: 'Saudi Arabia has the largest healthcare system in the Middle East, with ambitious Vision 2030 goals to expand medical tourism and privatize some services. Major employers include MOH hospitals, National Guard hospitals, and leading private groups like Dr. Sulaiman Al Habib.',
        language: 'Arabic is the official language, but English is the primary clinical language in most international hospitals. Basic Arabic phrases are helpful for patient interaction.',
        costOfLiving: 'Low to Medium. Accommodation is often employer-provided. No income tax. Groceries and dining are affordable. Major cities (Riyadh, Jeddah) have all modern amenities.',
        workLife: '40\u201348 hours/week. 30 days annual leave. End-of-service benefits (gratuity). Tax-free salary with housing, transport, and annual flight allowances common.'
      },
      licensingSteps: [
        { title: 'Dataflow PSV', desc: 'Complete Primary Source Verification through Dataflow. All qualifications and employment records are verified directly at the issuing institutions.' },
        { title: 'SCFHS Classification', desc: 'Apply to the Saudi Commission for Health Specialties (SCFHS) for professional classification. Submit verified documents and complete any required exams.' },
        { title: 'Prometric Exam', desc: 'Pass the Prometric exam for your specialty. The exam covers clinical knowledge and Saudi healthcare regulations relevant to your field.' },
        { title: 'License & Visa', desc: 'Receive your SCFHS professional license. Your employer processes the work visa (Iqama) and arranges travel and accommodation.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing/medical degree certificate', 'Dataflow verification report', 'SCFHS classification letter', 'Prometric exam results', 'Good standing certificate', 'Experience letters', 'Medical fitness report'],
      jobs: [
        { title: 'Senior Midwife', employer: 'King Faisal Specialist Hospital, Riyadh', logo: 'KF', logoStyle: 'background:linear-gradient(135deg,#1e8449,#2ecc71);color:#fff', salary: 'SAR 18,000', period: 'month', match: 89, accent: 'var(--accent-amber)', tags: ['Midwifery', 'Labour & Delivery', 'Tax-Free'] },
        { title: 'Cardiac Nurse Specialist', employer: 'Prince Sultan Cardiac Centre', logo: 'PS', logoStyle: 'background:linear-gradient(135deg,#c0392b,#e74c3c);color:#fff', salary: 'SAR 20,000', period: 'month', match: 86, accent: 'var(--accent-coral)', tags: ['Cardiology', 'SCFHS License', 'Housing'] },
        { title: 'Oncology Nurse', employer: 'King Abdulaziz Medical City, Jeddah', logo: 'KA', logoStyle: 'background:linear-gradient(135deg,#1a5276,#2980b9);color:#fff', salary: 'SAR 16,000', period: 'month', match: 83, accent: 'var(--primary)', tags: ['Oncology', 'Chemotherapy', 'Benefits'] }
      ],
      guides: [
        { title: 'SCFHS Registration Guide for International Healthcare Workers', tag: 'Licensing', readTime: '11 min' },
        { title: 'Working in Saudi Arabia: Cultural Guide for Healthcare Professionals', tag: 'Culture', readTime: '9 min' }
      ],
      stories: [
        { quote: 'Saudi Arabia offered me a salary package I could not refuse \u2014 housing, annual flights home, and a tax-free salary. After 3 years, I\u2019ve built significant savings and gained incredible experience at King Faisal.', name: 'Grace Njoku', role: 'Senior Midwife, KFSH Riyadh', initials: 'GN', color: '#ffb020', textColor: '#080a0d' },
        { quote: 'The Prometric exam preparation resources from GlobalHire were spot on. I passed on my first try and was working in Jeddah within 3 months of applying.', name: 'Rajesh Kumar', role: 'Cardiac Nurse, PSCC Riyadh', initials: 'RK', color: '#00d4ff', textColor: '#080a0d' }
      ]
    },

    ca: {
      code: 'ca', name: 'Canada', flag: '\ud83c\udde8\ud83c\udde6', region: 'North America',
      avgSalary: 'CAD $70,000 \u2013 CAD $105,000', processingTime: '4\u20138 months', language: 'English / French',
      healthcareSystem: 'Universal Public Healthcare (Medicare)',
      glance: {
        healthcare: 'Canada\u2019s Medicare system provides universal coverage funded through taxation. Each province and territory manages its own health insurance plan. Public hospitals deliver most acute care, with growing private sector involvement in some provinces.',
        language: 'English and/or French depending on province. Most provinces accept IELTS (7.0+ overall) or CELBAN. Quebec requires French proficiency (TEF/TCF) for registration.',
        costOfLiving: 'Medium to High. Vancouver and Toronto are the most expensive. Prairie provinces (Alberta, Saskatchewan, Manitoba) offer lower costs with strong healthcare demand.',
        workLife: '37.5\u201340 hours/week. 15\u201325 days vacation. Excellent work-life balance with generous parental leave policies. Universal healthcare coverage as a resident.'
      },
      licensingSteps: [
        { title: 'NNAS Assessment', desc: 'Apply to the National Nursing Assessment Service (NNAS) for credentials advisory report. Submit all education and practice documentation.' },
        { title: 'Provincial Application', desc: 'Apply to your target province\u2019s nursing regulatory body (e.g., CNO for Ontario, BCCNM for BC). They review the NNAS report and determine additional requirements.' },
        { title: 'NCLEX-RN (Canada)', desc: 'Register and pass the NCLEX-RN examination, which Canada adopted as its national licensing exam. Prepare with Canadian-specific practice questions.' },
        { title: 'Registration & PR Pathway', desc: 'Receive provincial nursing registration. Apply for permanent residency through Express Entry, Provincial Nominee Programs, or other immigration pathways.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing degree and transcripts', 'NNAS advisory report', 'English/French language scores', 'Registration/license from home country', 'Practice hours verification', 'Criminal record check', 'Immigration documents'],
      jobs: [
        { title: 'Diagnostic Radiographer', employer: 'Toronto General Hospital \u2014 UHN', logo: 'TG', logoStyle: 'background:linear-gradient(135deg,#c0392b,#e74c3c);color:#fff', salary: 'CAD $82,000', period: 'year', match: 87, accent: 'var(--accent-cyan)', tags: ['Radiology', 'CT/MRI', 'PR Pathway'] },
        { title: 'Registered Nurse \u2014 ICU', employer: 'Vancouver General Hospital', logo: 'VG', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2196f3);color:#fff', salary: 'CAD $88,000', period: 'year', match: 91, accent: 'var(--primary)', tags: ['Critical Care', 'BCCNM License', 'Benefits'] },
        { title: 'Community Health Nurse', employer: 'Alberta Health Services', logo: 'AH', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: 'CAD $78,000', period: 'year', match: 84, accent: 'var(--accent-amber)', tags: ['Public Health', 'Rural', 'LMIA Support'] }
      ],
      guides: [
        { title: 'NNAS Process Explained: Step-by-Step for International Nurses', tag: 'Licensing', readTime: '14 min' },
        { title: 'Permanent Residency Through Healthcare: Express Entry Guide', tag: 'Immigration', readTime: '10 min' }
      ],
      stories: [
        { quote: 'Canada welcomed me and my family with open arms. The PR pathway through Express Entry was surprisingly smooth, and my nursing experience in the Philippines was fully recognized.', name: 'Maria Santos', role: 'ICU Nurse, Vancouver General Hospital', initials: 'MS', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'Working in Alberta gave me the perfect balance \u2014 excellent salary, affordable housing, and stunning nature. GlobalHire connected me with the right employer and handled the LMIA process.', name: 'David Okonkwo', role: 'Community Nurse, AHS Edmonton', initials: 'DO', color: '#ff5c5c', textColor: '#fff' }
      ]
    },

    au: {
      code: 'au', name: 'Australia', flag: '\ud83c\udde6\ud83c\uddfa', region: 'Oceania',
      avgSalary: 'AUD $72,000 \u2013 AUD $110,000', processingTime: '3\u20136 months', language: 'English',
      healthcareSystem: 'Universal Public (Medicare) + Private',
      glance: {
        healthcare: 'Australia\u2019s Medicare system provides universal access to public hospital care and subsidised medical services. The system is complemented by a strong private healthcare sector. Australia is known for excellent working conditions for healthcare staff.',
        language: 'English (IELTS 7.0 in each band or OET B in each component for AHPRA registration). Academic IELTS or OET are both accepted by the Nursing and Midwifery Board of Australia.',
        costOfLiving: 'Medium-High. Sydney and Melbourne are most expensive. Regional areas offer lower costs, and some employers provide relocation packages for rural/remote placements.',
        workLife: '38 hours/week standard. 20 days annual leave plus 10 days personal/sick leave. Penalty rates for weekends, nights, and public holidays. Excellent superannuation (pension) contributions.'
      },
      licensingSteps: [
        { title: 'AHPRA Application', desc: 'Apply to the Australian Health Practitioner Regulation Agency (AHPRA) and the Nursing and Midwifery Board. Submit all qualifications and meet English requirements.' },
        { title: 'Skills Assessment', desc: 'Complete the ANMAC (Australian Nursing and Midwifery Accreditation Council) skills assessment. Your qualifications and experience are evaluated against Australian standards.' },
        { title: 'NCLEX-AU or Bridging', desc: 'Depending on your assessment outcome, you may need to complete a bridging program or additional examinations to meet Australian practice standards.' },
        { title: 'Registration & Visa', desc: 'Receive AHPRA registration and apply for a skilled migration visa (subclass 482 or 186). Nursing is on the priority skilled occupation list.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing qualification with transcripts', 'IELTS/OET results', 'ANMAC assessment outcome', 'Registration from home country', 'Police clearance (national and international)', 'Immunisation records', 'Working with Children Check'],
      jobs: [
        { title: 'Paediatric Nurse Specialist', employer: 'Royal Adelaide Hospital', logo: 'RA', logoStyle: 'background:linear-gradient(135deg,#2c3e50,#34495e);color:#fff', salary: 'AUD $95,000', period: 'year', match: 93, accent: 'var(--primary)', tags: ['Paediatrics', 'AHPRA', 'Relocation'] },
        { title: 'Emergency Department RN', employer: 'Royal Melbourne Hospital', logo: 'RM', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2196f3);color:#fff', salary: 'AUD $88,000', period: 'year', match: 90, accent: 'var(--accent-cyan)', tags: ['Emergency', 'Triage', 'Visa Sponsored'] },
        { title: 'Rural & Remote Nurse', employer: 'Queensland Health', logo: 'QH', logoStyle: 'background:linear-gradient(135deg,#6c3483,#a569bd);color:#fff', salary: 'AUD $105,000', period: 'year', match: 86, accent: 'var(--accent-amber)', tags: ['Remote', 'Incentive Package', 'Housing'] }
      ],
      guides: [
        { title: 'AHPRA Registration: Complete Guide for International Nurses', tag: 'Licensing', readTime: '13 min' },
        { title: 'Skilled Migration to Australia: Visa Options for Nurses', tag: 'Immigration', readTime: '9 min' }
      ],
      stories: [
        { quote: 'Australia\u2019s work-life balance is unmatched. I earn great money, have time for family, and the natural beauty is a bonus. AHPRA registration was straightforward with GlobalHire\u2019s support.', name: 'Angela Mensah', role: 'Paediatric Nurse, Royal Adelaide', initials: 'AM', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'Taking a rural placement in Queensland was the best career move. The incentive package included free housing and I gained experience across multiple specialties. PR was fast-tracked.', name: 'Tom Nguyen', role: 'Remote Nurse, QLD Health', initials: 'TN', color: '#ffb020', textColor: '#080a0d' }
      ]
    },

    de: {
      code: 'de', name: 'Germany', flag: '\ud83c\udde9\ud83c\uddea', region: 'Europe',
      avgSalary: '\u20ac35,000 \u2013 \u20ac55,000', processingTime: '6\u201312 months', language: 'German',
      healthcareSystem: 'Universal Multi-Payer (Statutory & Private Insurance)',
      glance: {
        healthcare: 'Germany has a dual public-private healthcare system with statutory health insurance (GKV) covering about 87% of the population. Known for excellent infrastructure, advanced medical technology, and a strong emphasis on preventive care. Severe nursing shortage creates high demand.',
        language: 'German B2 level (Goethe-Zertifikat or telc Deutsch) is required for professional recognition. B1 may be accepted initially with a commitment to reach B2. Some international hospitals accept English for physicians.',
        costOfLiving: 'Medium. Munich and Frankfurt are most expensive. Eastern German cities (Leipzig, Dresden) and smaller cities offer very affordable living with good salaries.',
        workLife: '38.5\u201340 hours/week. 24\u201330 days annual leave. Strong worker protections. Excellent social security system including pension, unemployment, and disability insurance.'
      },
      licensingSteps: [
        { title: 'Credential Recognition', desc: 'Apply to the relevant state authority (Landesamt) for recognition of your foreign nursing qualification. This is called the Anerkennungsverfahren (recognition procedure).' },
        { title: 'German Language B2', desc: 'Achieve German language proficiency at B2 level. Many employers offer free language courses and accommodation during the learning period.' },
        { title: 'Knowledge Exam or Adaptation', desc: 'Depending on your qualification assessment, complete either a knowledge exam (Kenntnisprufung) or an adaptation period (Anpassungslehrgang) at an approved facility.' },
        { title: 'Full License (Berufserlaubnis)', desc: 'Receive your full professional recognition (Anerkennung) and Berufserlaubnis. This permits you to work as a fully recognized nurse in Germany.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing diploma with apostille', 'Curriculum/syllabus of training', 'German language certificate (B2)', 'Certificate of good conduct', 'Health certificate', 'CV in German format (Lebenslauf)', 'Employment contract'],
      jobs: [
        { title: 'Krankenpfleger (General Nurse)', employer: 'Charit\u00e9 \u2014 Universit\u00e4tsmedizin Berlin', logo: 'CH', logoStyle: 'background:linear-gradient(135deg,#1a237e,#3f51b5);color:#fff', salary: '\u20ac42,000', period: 'year', match: 88, accent: 'var(--primary)', tags: ['General Ward', 'Visa Sponsored', 'Language Support'] },
        { title: 'Intensivpfleger (ICU Nurse)', employer: 'Universit\u00e4tsklinikum M\u00fcnchen', logo: 'UM', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2196f3);color:#fff', salary: '\u20ac48,000', period: 'year', match: 85, accent: 'var(--accent-cyan)', tags: ['Intensive Care', 'Specialist', 'Benefits'] },
        { title: 'Altenpfleger (Geriatric Nurse)', employer: 'Asklepios Kliniken Hamburg', logo: 'AK', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: '\u20ac38,000', period: 'year', match: 82, accent: 'var(--accent-amber)', tags: ['Elderly Care', 'B2 Required', 'Accommodation'] }
      ],
      guides: [
        { title: 'Nursing in Germany: Recognition Process for International Qualifications', tag: 'Licensing', readTime: '14 min' },
        { title: 'Learning German for Healthcare: Best Resources and Timeline', tag: 'Language', readTime: '8 min' }
      ],
      stories: [
        { quote: 'Germany\u2019s free language courses made the transition much easier. Within a year, I was communicating confidently with patients in German. The job security and benefits here are exceptional.', name: 'Sarah Kimani', role: 'Nurse, Charit\u00e9 Berlin', initials: 'SK', color: '#7c5cff', textColor: '#fff' },
        { quote: 'GlobalHire connected me with an employer who sponsored my language training and provided accommodation during the adaptation period. I\u2019m now a fully recognized nurse in Germany.', name: 'Emmanuel Adeyemi', role: 'ICU Nurse, Universit\u00e4tsklinikum M\u00fcnchen', initials: 'EA', color: '#00e89d', textColor: '#080a0d' }
      ]
    },

    qa: {
      code: 'qa', name: 'Qatar', flag: '\ud83c\uddf6\ud83c\udde6', region: 'Middle East',
      avgSalary: 'QAR 144,000 \u2013 QAR 360,000', processingTime: '2\u20134 months', language: 'English / Arabic',
      healthcareSystem: 'Hamad Medical Corporation & Private',
      glance: {
        healthcare: 'Qatar\u2019s healthcare is dominated by Hamad Medical Corporation (HMC), the main public provider, alongside growing private sector facilities. Massive investment in healthcare infrastructure with world-class facilities. The country aims to become a regional healthcare hub.',
        language: 'English is the primary clinical language in most hospitals. Arabic is beneficial for patient communication but not mandatory for most roles.',
        costOfLiving: 'Medium. Housing is the biggest expense but often employer-provided. No income tax. Modern infrastructure with high quality of life in Doha.',
        workLife: '40\u201348 hours/week. 30 days annual leave. Tax-free salary with housing allowance, annual flights, and comprehensive medical insurance typically included.'
      },
      licensingSteps: [
        { title: 'Dataflow Verification', desc: 'Complete Primary Source Verification through Dataflow Group. All qualifications and employment records are authenticated at source.' },
        { title: 'QCHP Evaluation', desc: 'Submit application to the Qatar Council for Healthcare Practitioners (QCHP) for professional evaluation and classification.' },
        { title: 'Prometric/QCHP Exam', desc: 'Pass the QCHP licensing examination. The exam covers clinical competency and Qatar-specific healthcare regulations.' },
        { title: 'License & Residency', desc: 'Receive QCHP professional license. Employer arranges work visa (RP) and residency permit. Process is typically fast-tracked for healthcare workers.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing/medical qualification', 'Dataflow report', 'Good standing certificate', 'Experience certificates', 'Medical fitness report', 'Police clearance', 'Passport photos'],
      jobs: [
        { title: 'Cardiac Cath Lab Nurse', employer: 'Hamad Medical Corporation, Doha', logo: 'HM', logoStyle: 'background:linear-gradient(135deg,#800020,#c0392b);color:#fff', salary: 'QAR 20,000', period: 'month', match: 90, accent: 'var(--primary)', tags: ['Cardiology', 'Tax-Free', 'Housing'] },
        { title: 'Labour & Delivery Nurse', employer: 'Sidra Medicine, Doha', logo: 'SM', logoStyle: 'background:linear-gradient(135deg,#6c3483,#a569bd);color:#fff', salary: 'QAR 18,000', period: 'month', match: 87, accent: 'var(--secondary)', tags: ['Obstetrics', 'Women\u2019s Health', 'Benefits'] },
        { title: 'Dialysis Nurse', employer: 'Al Ahli Hospital, Doha', logo: 'AA', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: 'QAR 15,000', period: 'month', match: 83, accent: 'var(--accent-amber)', tags: ['Nephrology', 'Visa Sponsored', 'Training'] }
      ],
      guides: [
        { title: 'QCHP Licensing Guide: Everything You Need to Know', tag: 'Licensing', readTime: '10 min' },
        { title: 'Living in Qatar: A Healthcare Professional\u2019s Guide', tag: 'Relocation', readTime: '7 min' }
      ],
      stories: [
        { quote: 'Qatar\u2019s healthcare system is truly world-class. At Hamad Medical Corporation, I have access to the latest equipment and training. The benefits package is phenomenal \u2014 housing, flights, and tax-free income.', name: 'Ruth Abiodun', role: 'Cardiac Nurse, HMC Doha', initials: 'RA', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'Sidra Medicine is an incredible workplace. The focus on women\u2019s and children\u2019s health matched my passion perfectly. GlobalHire fast-tracked my QCHP process in just 8 weeks.', name: 'Jenny Liu', role: 'L&D Nurse, Sidra Medicine', initials: 'JL', color: '#ff5c5c', textColor: '#fff' }
      ]
    },

    ie: {
      code: 'ie', name: 'Ireland', flag: '\ud83c\uddee\ud83c\uddea', region: 'Europe',
      avgSalary: '\u20ac32,000 \u2013 \u20ac55,000', processingTime: '3\u20136 months', language: 'English',
      healthcareSystem: 'Health Service Executive (HSE)',
      glance: {
        healthcare: 'Ireland\u2019s public health system is managed by the HSE, with a growing private sector. The system is undergoing major reform through the Sl\u00e1intecare programme aiming for universal healthcare. Strong demand for nurses and midwives across all specialties.',
        language: 'English (IELTS 7.0 overall with minimum 7.0 in speaking and listening, 6.5 in reading and writing, or OET B). Ireland is an English-speaking EU country, attractive for non-EU nurses.',
        costOfLiving: 'High, especially Dublin (housing crisis). Cities like Cork, Galway, and Limerick offer more affordable options with excellent quality of life and cultural richness.',
        workLife: '37.5\u201339 hours/week. 20\u201326 days annual leave. EU working time directive protections. Access to public sector pension and benefits.'
      },
      licensingSteps: [
        { title: 'NMBI Application', desc: 'Apply to the Nursing and Midwifery Board of Ireland (NMBI) for registration. Submit qualifications, English language evidence, and all supporting documents.' },
        { title: 'Qualification Assessment', desc: 'NMBI assesses your nursing qualification against Irish standards. They may require a clinical aptitude test or adaptation programme.' },
        { title: 'Aptitude Test/Adaptation', desc: 'If required, complete the NMBI aptitude test or a supervised adaptation programme at an approved healthcare facility in Ireland.' },
        { title: 'NMBI Registration', desc: 'Receive your NMBI PIN and register as a nurse/midwife. Apply for a work permit through the Critical Skills Employment Permit scheme.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing qualification certificate', 'Training syllabus/curriculum', 'English proficiency results', 'Certificate of current professional status', 'Two character references', 'Garda vetting (police check)', 'Evidence of clinical hours'],
      jobs: [
        { title: 'Staff Nurse \u2014 General', employer: 'St. James\u2019s Hospital, Dublin', logo: 'SJ', logoStyle: 'background:linear-gradient(135deg,#1a5276,#2e86c1);color:#fff', salary: '\u20ac37,000', period: 'year', match: 88, accent: 'var(--primary)', tags: ['General Ward', 'HSE', 'Visa Sponsored'] },
        { title: 'Oncology Nurse', employer: 'Cork University Hospital', logo: 'CU', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: '\u20ac40,000', period: 'year', match: 85, accent: 'var(--accent-cyan)', tags: ['Oncology', 'Specialist', 'CPD Support'] },
        { title: 'Midwife', employer: 'National Maternity Hospital, Dublin', logo: 'NM', logoStyle: 'background:linear-gradient(135deg,#6c3483,#a569bd);color:#fff', salary: '\u20ac38,000', period: 'year', match: 82, accent: 'var(--secondary)', tags: ['Midwifery', 'NMBI', 'EU Pathway'] }
      ],
      guides: [
        { title: 'NMBI Registration for Non-EU Nurses: Complete Walkthrough', tag: 'Licensing', readTime: '11 min' },
        { title: 'Living in Ireland: Costs, Culture and Community', tag: 'Relocation', readTime: '8 min' }
      ],
      stories: [
        { quote: 'Ireland feels like home. The people are incredibly welcoming, and my colleagues at St. James\u2019s have been so supportive. The NMBI process was smoother than expected with GlobalHire guiding me.', name: 'Blessing Eze', role: 'Staff Nurse, St. James\u2019s Hospital Dublin', initials: 'BE', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'As an EU citizen after 5 years, I now have the freedom to work anywhere in Europe. Ireland gave me the springboard for an incredible international career.', name: 'Nina Fernandez', role: 'Midwife, National Maternity Hospital', initials: 'NF', color: '#7c5cff', textColor: '#fff' }
      ]
    },

    nz: {
      code: 'nz', name: 'New Zealand', flag: '\ud83c\uddf3\ud83c\uddff', region: 'Oceania',
      avgSalary: 'NZD $65,000 \u2013 NZD $95,000', processingTime: '3\u20136 months', language: 'English',
      healthcareSystem: 'Public Healthcare (District Health Boards)',
      glance: {
        healthcare: 'New Zealand\u2019s public healthcare system is funded through taxation and managed by Health NZ (Te Whatu Ora). The system provides free or subsidized care for residents. Known for excellent primary care and a strong nursing culture with supportive work environments.',
        language: 'English (IELTS 7.0 in each band or OET B in each component). New Zealand Nursing Council has specific language requirements. English is the primary clinical language.',
        costOfLiving: 'Medium. Auckland and Wellington are most expensive. Smaller cities and regional areas offer affordable living with stunning natural surroundings.',
        workLife: '40 hours/week standard. 20 days annual leave increasing with service. Excellent work-life balance. Kiwi culture values quality of life and outdoor activities.'
      },
      licensingSteps: [
        { title: 'NCNZ Application', desc: 'Apply to the Nursing Council of New Zealand (NCNZ) for registration. Submit all qualifications, practice evidence, and English language results.' },
        { title: 'Competence Assessment', desc: 'NCNZ assesses your qualifications and experience against NZ nursing competencies. Additional evidence of practice may be requested.' },
        { title: 'CAP Programme', desc: 'If required, complete a Competence Assessment Programme (CAP) at an approved tertiary education provider. This bridges any gaps in qualification recognition.' },
        { title: 'Registration & Visa', desc: 'Receive NCNZ registration as a Registered Nurse. Apply for a skilled worker visa \u2014 nursing is on the Green List for fast-tracked residency.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing qualification', 'Detailed curriculum/syllabus', 'IELTS/OET results', 'Current practicing certificate', 'Verified CV/resume', 'Police clearance', 'Health declaration'],
      jobs: [
        { title: 'Registered Nurse \u2014 Emergency', employer: 'Auckland City Hospital', logo: 'AC', logoStyle: 'background:linear-gradient(135deg,#1a237e,#3f51b5);color:#fff', salary: 'NZD $80,000', period: 'year', match: 90, accent: 'var(--primary)', tags: ['Emergency', 'Triage', 'Visa Sponsored'] },
        { title: 'Mental Health Nurse', employer: 'Capital & Coast DHB, Wellington', logo: 'CC', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: 'NZD $75,000', period: 'year', match: 86, accent: 'var(--accent-cyan)', tags: ['Psychiatry', 'Community', 'Green List'] },
        { title: 'District Nurse', employer: 'Waikato DHB, Hamilton', logo: 'WD', logoStyle: 'background:linear-gradient(135deg,#b71c1c,#e53935);color:#fff', salary: 'NZD $72,000', period: 'year', match: 83, accent: 'var(--accent-amber)', tags: ['Primary Care', 'Rural', 'PR Pathway'] }
      ],
      guides: [
        { title: 'NCNZ Registration Guide for Overseas Nurses', tag: 'Licensing', readTime: '10 min' },
        { title: 'Green List Visa: Fast-Track Residency for Nurses in NZ', tag: 'Immigration', readTime: '7 min' }
      ],
      stories: [
        { quote: 'New Zealand is paradise for work-life balance. I finish my shifts and go hiking in stunning landscapes. The nursing team is like family, and the Green List visa meant I got residency within months.', name: 'Aisha Patel', role: 'ER Nurse, Auckland City Hospital', initials: 'AP', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'Coming from a stressful healthcare environment, NZ was a breath of fresh air. The supportive culture and manageable workloads let me actually enjoy nursing again.', name: 'Peter Owusu', role: 'Mental Health Nurse, Wellington', initials: 'PO', color: '#00d4ff', textColor: '#080a0d' }
      ]
    },

    sg: {
      code: 'sg', name: 'Singapore', flag: '\ud83c\uddf8\ud83c\uddec', region: 'Asia-Pacific',
      avgSalary: 'SGD $45,000 \u2013 SGD $85,000', processingTime: '2\u20134 months', language: 'English',
      healthcareSystem: 'Mixed Public-Private (3M Framework)',
      glance: {
        healthcare: 'Singapore\u2019s healthcare system consistently ranks among the world\u2019s best. The 3M framework (Medisave, MediShield, Medifund) ensures universal coverage. Public restructured hospitals (e.g., SGH, NUH) deliver world-class care alongside a thriving private sector.',
        language: 'English is the primary working and clinical language. Singapore is a multilingual society; Mandarin, Malay, or Tamil can be advantageous for patient communication.',
        costOfLiving: 'High. Housing and transportation are major expenses. However, Singapore offers excellent public transport, safety, and infrastructure. Employer housing allowances are common.',
        workLife: '40\u201344 hours/week. 14\u201318 days annual leave. Public holidays are generous. Efficient healthcare system means good nurse-to-patient ratios by regional standards.'
      },
      licensingSteps: [
        { title: 'SNB Application', desc: 'Apply to the Singapore Nursing Board (SNB) for registration. Submit qualifications, practice evidence, and reference letters from previous employers.' },
        { title: 'Credential Review', desc: 'SNB evaluates your nursing qualification against Singapore standards. Graduates from recognized programmes may receive expedited processing.' },
        { title: 'SNB Exam (if required)', desc: 'Depending on your qualification, you may need to pass the SNB licensing examination covering nursing fundamentals and Singapore healthcare regulations.' },
        { title: 'Registration & Work Pass', desc: 'Receive SNB registration. Employer applies for Employment Pass or S Pass through the Ministry of Manpower (MOM). Process is efficient for healthcare workers.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing degree certificate', 'Detailed transcripts', 'Current nursing license', 'Employment reference letters', 'English proficiency evidence', 'Medical examination report', 'Police clearance'],
      jobs: [
        { title: 'Registered Nurse \u2014 Oncology', employer: 'Singapore General Hospital', logo: 'SG', logoStyle: 'background:linear-gradient(135deg,#c0392b,#e74c3c);color:#fff', salary: 'SGD $5,500', period: 'month', match: 89, accent: 'var(--primary)', tags: ['Oncology', 'Research', 'CPD'] },
        { title: 'Operating Theatre Nurse', employer: 'National University Hospital', logo: 'NU', logoStyle: 'background:linear-gradient(135deg,#0d4ea6,#2196f3);color:#fff', salary: 'SGD $5,000', period: 'month', match: 86, accent: 'var(--accent-cyan)', tags: ['Perioperative', 'Specialist', 'Benefits'] },
        { title: 'Community Nurse', employer: 'NTUC Health', logo: 'NT', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: 'SGD $4,200', period: 'month', match: 81, accent: 'var(--accent-amber)', tags: ['Community', 'Elderly Care', 'Work Pass'] }
      ],
      guides: [
        { title: 'Singapore Nursing Board Registration: Complete Process', tag: 'Licensing', readTime: '9 min' },
        { title: 'Living in Singapore: Healthcare Worker\u2019s Essential Guide', tag: 'Relocation', readTime: '7 min' }
      ],
      stories: [
        { quote: 'Singapore is incredibly efficient \u2014 from the licensing process to daily hospital operations. SGH is a phenomenal learning environment and the city offers an amazing lifestyle.', name: 'Anna Reyes', role: 'Oncology Nurse, SGH', initials: 'AR', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'The transition to Singapore was seamless. GlobalHire handled the SNB application and my employer sorted the Employment Pass in record time. I love the safety and cleanliness here.', name: 'Michael Obi', role: 'Theatre Nurse, NUH', initials: 'MO', color: '#7c5cff', textColor: '#fff' }
      ]
    },

    kw: {
      code: 'kw', name: 'Kuwait', flag: '\ud83c\uddf0\ud83c\uddfc', region: 'Middle East',
      avgSalary: 'KWD 6,000 \u2013 KWD 14,400', processingTime: '2\u20134 months', language: 'English / Arabic',
      healthcareSystem: 'Ministry of Health (MOH) & Private',
      glance: {
        healthcare: 'Kuwait\u2019s healthcare is primarily government-funded through the Ministry of Health, providing free or heavily subsidized care to citizens. Private hospitals are expanding rapidly. The country has invested heavily in healthcare infrastructure and seeks international talent to staff its facilities.',
        language: 'Arabic is the official language, but English is widely used in clinical settings, especially in private and international hospitals. Arabic proficiency is beneficial for government facilities.',
        costOfLiving: 'Low to Medium. No income tax. Accommodation is often provided or subsidized by employers. Groceries and utilities are affordable.',
        workLife: '40\u201348 hours/week. 30 days annual leave. Tax-free salary with end-of-service indemnity. Many employers provide housing, transport, and annual flights.'
      },
      licensingSteps: [
        { title: 'Dataflow Verification', desc: 'Complete Primary Source Verification through Dataflow. Qualifications and employment history are verified at the issuing institutions.' },
        { title: 'MOH Evaluation', desc: 'Submit credentials to Kuwait\u2019s Ministry of Health for professional evaluation and classification. Ensure all documents are attested.' },
        { title: 'MOH/KIMS Exam', desc: 'Pass the Kuwait Institute for Medical Specializations (KIMS) licensing exam or MOH assessment for your specialty.' },
        { title: 'License & Residency', desc: 'Receive professional license from Kuwait MOH. Employer processes work visa and civil ID. Typically includes housing and benefits package.' }
      ],
      requiredDocs: ['Valid passport', 'Nursing qualification (attested)', 'Dataflow report', 'Good standing certificate', 'Experience certificates (attested)', 'Medical fitness report', 'Police clearance', 'Passport photos'],
      jobs: [
        { title: 'ICU Nurse', employer: 'Jaber Al-Ahmad Hospital, Kuwait City', logo: 'JA', logoStyle: 'background:linear-gradient(135deg,#1a5276,#2e86c1);color:#fff', salary: 'KWD 800', period: 'month', match: 87, accent: 'var(--primary)', tags: ['Critical Care', 'Tax-Free', 'Housing'] },
        { title: 'Operating Room Nurse', employer: 'Dar Al Shifa Hospital', logo: 'DS', logoStyle: 'background:linear-gradient(135deg,#1e8449,#27ae60);color:#fff', salary: 'KWD 700', period: 'month', match: 84, accent: 'var(--accent-amber)', tags: ['Perioperative', 'Private', 'Benefits'] },
        { title: 'Emergency Nurse', employer: 'Al-Razi Hospital', logo: 'AR', logoStyle: 'background:linear-gradient(135deg,#800020,#c0392b);color:#fff', salary: 'KWD 750', period: 'month', match: 81, accent: 'var(--accent-cyan)', tags: ['Emergency', 'Government', 'Visa Sponsored'] }
      ],
      guides: [
        { title: 'Kuwait MOH Licensing Process for International Nurses', tag: 'Licensing', readTime: '9 min' },
        { title: 'Life in Kuwait: What Healthcare Workers Should Expect', tag: 'Relocation', readTime: '7 min' }
      ],
      stories: [
        { quote: 'Kuwait was my gateway to the Gulf. The savings potential is excellent with tax-free salary and provided housing. After 2 years, I\u2019ve been able to support my family back home significantly.', name: 'Joy Nwosu', role: 'ICU Nurse, Jaber Al-Ahmad Hospital', initials: 'JN', color: '#00e89d', textColor: '#080a0d' },
        { quote: 'The private hospital I work at in Kuwait has a wonderful international team. GlobalHire helped me navigate the MOH exam and I started working within 10 weeks of my initial application.', name: 'Deepak Sharma', role: 'OR Nurse, Dar Al Shifa Hospital', initials: 'DS', color: '#ffb020', textColor: '#080a0d' }
      ]
    }
  };

  /* ── Utility Functions ── */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function getParam(name) {
    var url = new URL(window.location.href);
    return url.searchParams.get(name);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ── Populate Page ── */
  function populatePage(country) {
    // Hero
    var flagEl = $('#country-flag');
    var nameEl = $('#country-name');
    var regionEl = $('#country-region');

    if (flagEl) flagEl.textContent = country.flag;
    if (nameEl) nameEl.textContent = country.name;
    if (regionEl) regionEl.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' + escapeHtml(country.region);

    // Key stats
    var statSalary = $('#stat-salary');
    var statTime = $('#stat-time');
    var statLang = $('#stat-language');
    var statSystem = $('#stat-system');
    if (statSalary) statSalary.textContent = country.avgSalary;
    if (statTime) statTime.textContent = country.processingTime;
    if (statLang) statLang.textContent = country.language;
    if (statSystem) statSystem.textContent = country.healthcareSystem;

    // Page title
    document.title = country.name + ' \u2014 Country Guide \u2014 GlobalHire@eLab';

    // Glance
    var glanceHealth = $('#glance-healthcare');
    var glanceLang = $('#glance-language');
    var glanceCost = $('#glance-cost');
    var glanceWork = $('#glance-worklife');
    if (glanceHealth) glanceHealth.textContent = country.glance.healthcare;
    if (glanceLang) glanceLang.textContent = country.glance.language;
    if (glanceCost) glanceCost.textContent = country.glance.costOfLiving;
    if (glanceWork) glanceWork.textContent = country.glance.workLife;

    // Licensing Steps
    var stepsContainer = $('#licensing-steps');
    if (stepsContainer && country.licensingSteps) {
      var stepsHtml = '';
      country.licensingSteps.forEach(function(step, i) {
        stepsHtml +=
          '<div class="licensing-step">' +
            '<div class="step-number-wrap">' +
              '<div class="step-number">' + (i + 1) + '</div>' +
              '<div class="step-line"></div>' +
            '</div>' +
            '<div class="step-content">' +
              '<div class="step-title">' + escapeHtml(step.title) + '</div>' +
              '<div class="step-desc">' + escapeHtml(step.desc) + '</div>' +
            '</div>' +
          '</div>';
      });
      stepsContainer.innerHTML = stepsHtml;
    }

    // Required Docs
    var docsContainer = $('#required-docs');
    if (docsContainer && country.requiredDocs) {
      var docsHtml = '';
      country.requiredDocs.forEach(function(doc) {
        docsHtml +=
          '<div class="doc-item">' +
            '<div class="doc-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="m5 12 5 5L20 7"/></svg></div>' +
            '<span>' + escapeHtml(doc) + '</span>' +
          '</div>';
      });
      docsContainer.innerHTML = docsHtml;
    }

    // Processing Time Badge
    var processingBadge = $('#processing-time');
    if (processingBadge) {
      processingBadge.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
        'Estimated processing: ' + escapeHtml(country.processingTime);
    }

    // Jobs
    var jobsContainer = $('#country-jobs');
    if (jobsContainer && country.jobs) {
      var jobsHtml = '';
      country.jobs.forEach(function(job, i) {
        var tagsHtml = '';
        job.tags.forEach(function(tag) {
          tagsHtml += '<span class="tag">' + escapeHtml(tag) + '</span>';
        });

        jobsHtml +=
          '<div class="cd-job-card reveal' + (i > 0 ? ' reveal-delay-' + i : '') + '" style="--card-accent:' + job.accent + '">' +
            '<div class="cd-job-body">' +
              '<div class="cd-job-header">' +
                '<div class="cd-job-logo" style="' + job.logoStyle + '">' + escapeHtml(job.logo) + '</div>' +
                '<div>' +
                  '<div class="cd-job-title">' + escapeHtml(job.title) + '</div>' +
                  '<div class="cd-job-employer">' + escapeHtml(job.employer) + '</div>' +
                '</div>' +
              '</div>' +
              '<div class="cd-job-tags">' + tagsHtml + '</div>' +
            '</div>' +
            '<div class="cd-job-aside">' +
              '<div class="cd-job-salary">' + escapeHtml(job.salary) + ' <span>/ ' + escapeHtml(job.period) + '</span></div>' +
              '<div class="cd-job-match">' +
                '<div class="cd-job-match-bar"><div class="cd-job-match-fill" style="width:' + job.match + '%;background:' + job.accent + '"></div></div>' +
                '<span class="cd-job-match-label" style="color:' + job.accent + '">' + job.match + '% match</span>' +
              '</div>' +
              '<div class="cd-job-actions">' +
                '<button class="btn btn-primary btn-sm">Apply Now</button>' +
                '<button class="btn btn-ghost btn-sm">Save</button>' +
              '</div>' +
            '</div>' +
          '</div>';
      });
      jobsContainer.innerHTML = jobsHtml;
    }

    // Guides
    var guidesContainer = $('#related-guides');
    if (guidesContainer && country.guides) {
      var guidesHtml = '';
      country.guides.forEach(function(guide) {
        guidesHtml +=
          '<div class="guide-card">' +
            '<div class="guide-card-tag">' + escapeHtml(guide.tag) + '</div>' +
            '<div class="guide-card-title">' + escapeHtml(guide.title) + '</div>' +
            '<div class="guide-card-meta">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>' +
              '<span>' + escapeHtml(guide.readTime) + ' read</span>' +
            '</div>' +
          '</div>';
      });
      guidesContainer.innerHTML = guidesHtml;
    }

    // Success Stories
    var storiesContainer = $('#success-stories');
    if (storiesContainer && country.stories) {
      var storiesHtml = '';
      country.stories.forEach(function(story, i) {
        storiesHtml +=
          '<div class="story-card reveal' + (i > 0 ? ' reveal-delay-' + i : '') + '">' +
            '<div class="story-quote-mark">\u201c</div>' +
            '<div class="story-text">' + escapeHtml(story.quote) + '</div>' +
            '<div class="story-author">' +
              '<div class="avatar" style="background:' + story.color + ';color:' + story.textColor + '">' + escapeHtml(story.initials) + '</div>' +
              '<div>' +
                '<div class="story-author-name">' + escapeHtml(story.name) + '</div>' +
                '<div class="story-author-role">' + escapeHtml(story.role) + '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      });
      storiesContainer.innerHTML = storiesHtml;
    }

    // Show the page content
    var pageContent = $('#country-page-content');
    if (pageContent) pageContent.style.display = 'block';

    // Re-init reveal animations after populating
    if (typeof GHE !== 'undefined' && GHE.initReveal) {
      GHE.initReveal();
    }
  }

  /* ── Show Not Found ── */
  function showNotFound(code) {
    var pageContent = $('#country-page-content');
    var notFound = $('#country-not-found');
    if (pageContent) pageContent.style.display = 'none';
    if (notFound) {
      notFound.style.display = 'block';
      var codeSpan = $('#not-found-code');
      if (codeSpan && code) codeSpan.textContent = '"' + code + '"';
    }
    document.title = 'Country Not Found \u2014 GlobalHire@eLab';
  }

  /* ── Apply / Save Toast ── */
  function initJobActions() {
    var toast = $('#apply-toast');
    var toastMsg = $('#apply-toast-msg');

    function showToast(msg) {
      if (toast && toastMsg) {
        toastMsg.textContent = msg;
        toast.style.display = 'block';
        setTimeout(function() { toast.style.display = 'none'; }, 3500);
      }
    }

    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.cd-job-actions .btn');
      if (!btn) return;

      if (btn.textContent.trim() === 'Apply Now') {
        var card = btn.closest('.cd-job-card');
        var title = card ? card.querySelector('.cd-job-title').textContent : 'this position';

        if (window.ghSupabase) {
          window.ghSupabase.auth.getSession().then(function(r) {
            if (!r.data.session) {
              window.location.href = 'signup.html';
              return;
            }
            btn.disabled = true;
            btn.textContent = 'Applied!';
            btn.style.opacity = '0.7';
            showToast('Application for "' + title + '" submitted. We\u2019ll be in touch!');
          });
        } else {
          window.location.href = 'signup.html';
        }
      }

      if (btn.textContent.trim() === 'Save') {
        if (window.ghSupabase) {
          window.ghSupabase.auth.getSession().then(function(r) {
            if (!r.data.session) {
              window.location.href = 'signup.html';
              return;
            }
            btn.textContent = 'Saved';
            btn.style.color = 'var(--primary)';
            showToast('Job saved to your profile.');
          });
        } else {
          window.location.href = 'signup.html';
        }
      }
    });
  }

  /* ── Init ── */
  function init() {
    // Init navigation
    if (typeof GHNav !== 'undefined' && GHNav.init) {
      GHNav.init('guides');
    }

    var code = getParam('code');

    if (code && COUNTRIES[code.toLowerCase()]) {
      populatePage(COUNTRIES[code.toLowerCase()]);
      initJobActions();
    } else {
      showNotFound(code || '');
    }
  }

  // Run on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
