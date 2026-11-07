-- Applied 2026-11-08 with the CEO's OK. The `resumes` bucket was public, empty and unused, and
-- its "Anyone can upload resumes" policy let anyone upload any file without signing in
-- (free file hosting under GlobalHire's address). Make it private and drop the anonymous upload.
update storage.buckets set public = false where id = 'resumes';
drop policy if exists "Anyone can upload resumes" on storage.objects;
