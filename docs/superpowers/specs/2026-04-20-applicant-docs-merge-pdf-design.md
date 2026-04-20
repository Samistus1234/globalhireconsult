# Applicant Documents — Merge to Single PDF (Admin Feature)

**Date:** 2026-04-20
**Scope:** `GLOBALHIRE@ELAB` admin panel — `candidates.html`

## Problem

Admins reviewing applicants currently download each uploaded document one at a time from the candidate drawer. Employers and licensing bodies expect a single consolidated PDF. Admins also receive a mix of file types (PDF, Word, image scans), and there is no built-in way to convert Word files or combine everything into one document.

## Goal

Let an admin, from the candidate drawer, select any subset of an applicant's uploaded documents, reorder them, and produce a single merged PDF. Word documents and images are converted to PDF pages automatically. The merged file is saved back to Supabase Storage (one per applicant, overwritten on re-merge) and also downloaded to the admin's computer immediately.

## Non-goals

- No bulk merging across multiple applicants.
- No applicant-facing download of the merged file.
- No searchable-text preservation for Word files (the pure-JS conversion rasterizes). Acceptable trade-off for the first version.
- No OCR.
- No template/branding on the cover page beyond applicant name, date, and doc list.
- No automatic regeneration when the applicant uploads new docs — admin triggers explicitly.

## Design decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Trigger | Button in admin candidate drawer |
| Output | Save to Supabase Storage **and** browser download |
| Scope | Admin picks docs via checkboxes |
| Ordering | Drag-to-reorder |
| File types handled | PDF, Word (.doc/.docx), images (JPG/PNG) |
| Word → PDF method | Pure client-side JS (`mammoth` → HTML → `jsPDF.html()` → PDF) |
| Re-merge behaviour | Overwrite previous merged file |
| Structure | Cover page + concatenated docs |
| Access | Admin only |

## Architecture

Everything runs in the admin's browser. No new edge function, no new backend service. Fits the project's existing vanilla-JS + Supabase pattern.

```
Admin clicks "Merge documents"
          │
          ▼
  merge-documents.js (lazy-loaded)
          │
          ├── fetch signed URLs for selected docs
          │
          ├── For each doc, by mime_type:
          │     • PDF   → pdf-lib load + copyPages
          │     • image → pdf-lib embedJpg/embedPng, one page
          │     • Word  → mammoth → HTML → jsPDF.html() → PDF → pdf-lib copyPages
          │
          ├── build cover page (pdf-lib)
          ├── concatenate: cover + docs in chosen order
          │
          ▼
  Upload to gh-applicant-documents/{applicantId}/merged/merged.pdf (upsert)
  Upsert row in globalhire.merged_documents
  Trigger browser download
  Refresh drawer
```

## Components

### 1. Candidate drawer (existing `candidates.html` + `js/candidates.js`)

- Add **Merge documents** button near the existing per-doc Download buttons.
- If a merged PDF already exists for this applicant, show **Download merged PDF (generated YYYY-MM-DD HH:mm)** under the button.

### 2. New module: `js/merge-documents.js`

Lazy-loaded (dynamic `<script>` insertion) only when the admin clicks **Merge documents**. Owns:

- The merge modal (doc list with checkboxes + drag handles + Generate button).
- The full pipeline (fetch → convert → assemble → upload).
- The post-run UI update (toast + drawer refresh).

### 3. Libraries (CDN-loaded alongside the module)

| Library | Purpose | Approx size |
|---|---|---|
| `pdf-lib` | Final PDF assembly, cover page, image → page embedding, page copying | ~230 KB |
| `mammoth` | `.docx` → HTML | ~120 KB |
| `jspdf` + `html2canvas` | Render mammoth HTML into a paginated PDF | ~400 KB |
| `sortablejs` | Drag-to-reorder rows in the modal | ~40 KB |

All lazy-loaded; unaffected admins never pay the bytes.

### 4. Storage

Merged file written to:

```
gh-applicant-documents/merged/{applicantId}/merged.pdf
```

The top-level `merged/` segment isolates these files from applicant-uploaded docs. Critically, the existing applicant SELECT policy on this bucket is `foldername[1] = auth.uid()`, which does not match `"merged"` — so applicants cannot read merged files via that policy. Only the admin read/write policies apply, which matches the admin-only access requirement.

### 5. DB — new table `globalhire.merged_documents`

```sql
CREATE TABLE globalhire.merged_documents (
  applicant_id   UUID PRIMARY KEY REFERENCES globalhire.profiles(id) ON DELETE CASCADE,
  file_path      TEXT NOT NULL,
  source_doc_ids UUID[] NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by   UUID NOT NULL REFERENCES globalhire.profiles(id)
);
ALTER TABLE globalhire.merged_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gh_admins_all_merged_docs"
  ON globalhire.merged_documents
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM globalhire.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));
```

Primary key on `applicant_id` so re-merge naturally overwrites. Admins only via RLS.

Storage RLS: extend existing admin read/write policies on `gh-applicant-documents` to cover paths under `{applicantId}/merged/` (same admin-only rule as the rest of the bucket).

## Data flow

1. Admin opens applicant drawer → clicks **Merge documents**.
2. Module loads, fetches the applicant's doc list from `globalhire.documents`, shows checkbox + drag-handle rows.
3. Admin checks/reorders → clicks **Generate**.
4. For each selected doc:
   - `createSignedUrl('gh-applicant-documents', file_path, 3600)` → `fetch` → `ArrayBuffer`.
   - Branch on `mime_type`:
     - `application/pdf` — `PDFDocument.load(bytes)`, `copyPages` into the output.
     - `image/jpeg` / `image/png` — pdf-lib `embedJpg` / `embedPng`; add one page sized to image (capped to 2000 px on longest side; rescaled to fit Letter if larger).
     - `application/msword` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` — `mammoth.convertToHtml({arrayBuffer})` → render HTML into a hidden `<div>` with fixed Letter-width styling → `jsPDF.html()` → PDF ArrayBuffer → `PDFDocument.load` → `copyPages` into the output.
     - Any other mime type → abort before this step (see Error handling).
5. Build cover page: pdf-lib draws
   - "Applicant Documents — {full_name}" (title)
   - "Generated: {YYYY-MM-DD HH:mm} UTC"
   - Numbered list of included docs: "1. Passport (passport.pdf)", "2. CV (resume.docx)", etc.
6. Assemble final `PDFDocument`: cover page → docs in selected order.
7. `sb.storage.from('gh-applicant-documents').upload('merged/{applicantId}/merged.pdf', bytes, { upsert: true, contentType: 'application/pdf' })`.
8. Upsert into `globalhire.merged_documents` on conflict `(applicant_id)` — replace `file_path`, `source_doc_ids`, `generated_at`, `generated_by`.
9. Trigger browser download via `URL.createObjectURL(blob)` + anchor click.
10. Close modal, refresh drawer so the **Download merged PDF** link appears/updates.

## UI details

**Merge modal:**

```
┌─────────────────────────────────────────────┐
│  Merge documents — Jane Doe              ✕  │
├─────────────────────────────────────────────┤
│  Drag to reorder. Uncheck to exclude.       │
│                                             │
│  ≡ ☑  [CV]        resume.docx      [docx]   │
│  ≡ ☑  [Passport]  passport.pdf     [pdf]    │
│  ≡ ☑  [License]   license.jpg      [image]  │
│  ≡ ☐  [Degree]    degree.xlsx      ✗ unsup. │
│                                             │
│                    [Cancel]   [Generate]    │
└─────────────────────────────────────────────┘
```

- Unsupported rows display the red "unsupported" badge and cannot be checked.
- **Generate** is disabled when no rows are checked.
- While running, **Generate** becomes a progress indicator (e.g., "Converting 2/4…").

## Error handling

| Condition | Behaviour |
|---|---|
| Unsupported mime type in selection | Row disabled with red "unsupported" badge; Generate does not proceed with it. |
| Signed-URL fetch fails (network / expired / deleted file) | Toast: "Could not fetch {filename}. Skip it or retry?" — admin chooses. |
| Word conversion throws (corrupt `.docx`) | Toast names the file; admin can remove it and re-run. |
| Image oversized | pdf-lib downscales to 2000 px on longest side before embedding. |
| Storage upload fails | Retain the generated blob in memory; modal shows **Retry upload** button; browser download already occurred, so the file is not lost. |
| Storage upload succeeds but DB upsert fails | Warning banner: "File saved but record not updated — contact dev"; storage path is deterministic, so a reconciler can backfill. |
| Tab closed mid-generation | Nothing is saved until step 7 — so a cancelled run leaves no partial state. |

## Testing

No test runner exists in the project, so introducing one for a single feature is overkill. Instead:

- **Primary: manual QA against a real applicant.** Checklist:
  - Four docs, one of each supported type → merged PDF opens, order matches drag order, cover page first, page count = 1 (cover) + sum of source pages.
  - Re-run with different selection → previous merged file overwritten; `merged_documents` row updated; link still works.
  - Fancy Word CV (tables, images, custom fonts) → verify it renders; note fidelity issues so the boundary is known.
  - Unsupported type (`.xlsx`) → row disabled, cannot include.
  - Empty selection → **Generate** disabled.
  - Large (20+ MB) source PDF → merge completes within acceptable time on a typical admin laptop.
- **Lightweight regression harness:** one static HTML page at `tests/merge-documents.html` that loads the module with three small hardcoded fixtures (`tests/fixtures/sample.pdf`, `sample.docx`, `sample.jpg`) and logs the output page count. Not wired into CI — run manually before releases.

## Dependencies on other work

None. The existing `documents` table, `gh-applicant-documents` bucket, and admin RLS policies are all already in place.

## Future extensions (out of scope for v1)

- Applicant-facing download (trivial once it exists — remove admin-only RLS clause).
- Short-lived signed link for emailing to employers directly.
- Server-side generation via an edge function for browser-independent runs / bulk merge.
- Word-to-PDF with searchable text (would require a different conversion chain — LibreOffice on the VPS, or jsPDF with custom text-stream authoring).
- Versioned history of merged files.
