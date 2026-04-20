/* ============================================
   GLOBALHIRE@ELAB — Merge Documents (admin)
   Combines selected applicant documents into a
   single PDF. Handles PDF / Word / JPG / PNG.
   Saves to gh-applicant-documents/merged/{uid}/merged.pdf
   and tracks in globalhire.merged_documents.
   ============================================ */

(function () {
  var sb = window.ghSupabase;
  var BUCKET = 'gh-applicant-documents';
  var LETTER_W = 612;  // pt (8.5in * 72)
  var LETTER_H = 792;  // pt (11in * 72)
  var PAGE_MARGIN = 36; // pt (0.5in)
  var MAX_IMG_DIM = 2000; // downscale threshold

  var CDN = {
    pdfLib:      'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
    mammoth:     'https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js',
    html2canvas: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
    jspdf:       'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
    sortable:    'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
  };

  var DOC_TYPE_LABELS = {
    license: 'Professional License',
    degree: 'Degree / Certificate',
    passport: 'Passport (Data Page)',
    cv: 'CV / Resume',
    passport_photo: 'Passport Photo',
    police_report: 'Police Character Report',
    travel_insurance: 'Travel Insurance'
  };

  var SUPPORTED_PDF   = ['application/pdf'];
  var SUPPORTED_IMAGE = ['image/jpeg', 'image/jpg', 'image/png'];
  var SUPPORTED_WORD  = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  function kindForMime(mime) {
    if (!mime) return null;
    var m = mime.toLowerCase();
    if (SUPPORTED_PDF.indexOf(m) !== -1) return 'pdf';
    if (SUPPORTED_IMAGE.indexOf(m) !== -1) return 'image';
    if (SUPPORTED_WORD.indexOf(m) !== -1) return 'word';
    return null;
  }

  function kindForFile(fileName, mime) {
    var k = kindForMime(mime);
    if (k) return k;
    // Fallback: sniff by extension (stored mime_type is sometimes missing)
    var n = (fileName || '').toLowerCase();
    if (n.endsWith('.pdf')) return 'pdf';
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image';
    if (n.endsWith('.png')) return 'image';
    if (n.endsWith('.doc') || n.endsWith('.docx')) return 'word';
    return null;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // ── Lazy library loader ────────────────────────────────────────
  var _libsLoaded = null;
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  function ensureLibs() {
    if (_libsLoaded) return _libsLoaded;
    _libsLoaded = Promise.all([
      loadScript(CDN.pdfLib),
      loadScript(CDN.mammoth),
      loadScript(CDN.html2canvas),
      loadScript(CDN.jspdf),
      loadScript(CDN.sortable)
    ]);
    return _libsLoaded;
  }

  // ── Modal ──────────────────────────────────────────────────────
  function buildModal(profile, docs) {
    var overlay = document.createElement('div');
    overlay.id = 'mdoc-overlay';
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(10,22,40,0.65);' +
      'display:flex;align-items:center;justify-content:center;z-index:10000;';

    var modal = document.createElement('div');
    modal.style.cssText =
      'background:var(--bg-elevated,#fff);border-radius:var(--radius-lg,12px);' +
      'width:min(640px,92vw);max-height:86vh;overflow:hidden;' +
      'display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.35);';

    // Header
    var header = document.createElement('div');
    header.style.cssText =
      'padding:var(--space-5,20px);border-bottom:1px solid var(--border-subtle,#e5e7eb);' +
      'display:flex;align-items:center;justify-content:space-between;gap:12px;';
    header.innerHTML =
      '<div>' +
      '<div style="font-size:var(--text-lg,17px);font-weight:700;color:var(--text-primary,#0A1628);">Merge documents</div>' +
      '<div style="font-size:var(--text-sm,13px);color:var(--text-tertiary,#6B7280);margin-top:2px;">' +
      escapeHtml(profile.full_name || 'Applicant') +
      ' · drag to reorder · uncheck to exclude</div>' +
      '</div>' +
      '<button id="mdoc-close" class="btn btn-ghost btn-sm" style="font-size:20px;line-height:1;padding:4px 10px;">&times;</button>';

    // Body
    var body = document.createElement('div');
    body.style.cssText = 'padding:var(--space-5,20px);overflow-y:auto;flex:1;';

    if (!docs.length) {
      body.innerHTML =
        '<p style="color:var(--text-tertiary,#6B7280);font-size:var(--text-sm,13px);">' +
        'No documents uploaded for this applicant yet.</p>';
    } else {
      var list = document.createElement('div');
      list.id = 'mdoc-list';
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      docs.forEach(function (d) {
        var kind = kindForFile(d.file_name, d.mime_type);
        var supported = kind !== null;
        var typeLabel = DOC_TYPE_LABELS[d.doc_type] || d.doc_type || 'Document';

        var row = document.createElement('div');
        row.className = 'mdoc-row';
        row.dataset.docId = d.id;
        row.dataset.kind = kind || 'unsupported';
        row.style.cssText =
          'display:flex;align-items:center;gap:10px;padding:10px 12px;' +
          'background:var(--bg-surface,#fafafa);border:1px solid var(--border-subtle,#e5e7eb);' +
          'border-radius:var(--radius-md,8px);' + (supported ? '' : 'opacity:0.6;');

        var badgeColor = supported
          ? 'background:var(--success-muted,#d1fae5);color:var(--success,#059669);'
          : 'background:var(--error-muted,#fee2e2);color:var(--error,#dc2626);';

        row.innerHTML =
          '<span class="mdoc-drag" style="cursor:grab;font-size:16px;color:var(--text-tertiary,#6B7280);user-select:none;' +
          (supported ? '' : 'cursor:not-allowed;') + '">&#x2630;</span>' +
          '<input type="checkbox" class="mdoc-check" ' + (supported ? 'checked' : 'disabled') + ' ' +
          'style="width:16px;height:16px;cursor:' + (supported ? 'pointer' : 'not-allowed') + ';"/>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:var(--text-sm,13px);font-weight:600;color:var(--text-primary,#0A1628);' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(typeLabel) + '</div>' +
          '<div style="font-size:11px;color:var(--text-tertiary,#6B7280);' +
          'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(d.file_name || '') + '</div>' +
          '</div>' +
          '<span style="font-size:10px;font-weight:700;padding:3px 7px;border-radius:4px;text-transform:uppercase;' +
          badgeColor + '">' + (kind || 'unsupported') + '</span>';
        list.appendChild(row);
      });
      body.appendChild(list);
    }

    // Footer
    var footer = document.createElement('div');
    footer.style.cssText =
      'padding:var(--space-4,16px) var(--space-5,20px);border-top:1px solid var(--border-subtle,#e5e7eb);' +
      'display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--bg-surface,#fafafa);';
    footer.innerHTML =
      '<div id="mdoc-status" style="font-size:var(--text-sm,13px);color:var(--text-tertiary,#6B7280);"></div>' +
      '<div style="display:flex;gap:8px;">' +
      '<button id="mdoc-cancel" class="btn btn-ghost">Cancel</button>' +
      '<button id="mdoc-generate" class="btn btn-primary"' + (docs.length ? '' : ' disabled') + '>Generate PDF</button>' +
      '</div>';

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    return overlay;
  }

  function setStatus(overlay, text, color) {
    var el = overlay.querySelector('#mdoc-status');
    if (el) {
      el.textContent = text || '';
      el.style.color = color || 'var(--text-tertiary,#6B7280)';
    }
  }

  function closeModal(overlay) {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  }

  // ── Per-kind conversion ────────────────────────────────────────
  async function fetchDocBytes(filePath) {
    var { data, error } = await sb.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error || !data || !data.signedUrl) {
      throw new Error('Could not sign URL for ' + filePath);
    }
    var resp = await fetch(data.signedUrl);
    if (!resp.ok) throw new Error('Download failed (' + resp.status + ')');
    return new Uint8Array(await resp.arrayBuffer());
  }

  async function copyPdfPages(outDoc, bytes) {
    var PDFLib = window.PDFLib;
    var src = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
    var pages = await outDoc.copyPages(src, src.getPageIndices());
    pages.forEach(function (p) { outDoc.addPage(p); });
  }

  async function addImagePage(outDoc, bytes, mime, fileName) {
    var PDFLib = window.PDFLib;
    // Downscale via canvas if longest side > MAX_IMG_DIM
    var blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    var url = URL.createObjectURL(blob);
    try {
      var img = await new Promise(function (res, rej) {
        var i = new Image();
        i.onload = function () { res(i); };
        i.onerror = function () { rej(new Error('Invalid image: ' + fileName)); };
        i.src = url;
      });

      var w = img.naturalWidth, h = img.naturalHeight;
      var longest = Math.max(w, h);
      var imgBytes = bytes;
      var outMime = (mime || '').toLowerCase();
      if (longest > MAX_IMG_DIM) {
        var scale = MAX_IMG_DIM / longest;
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        outMime = 'image/jpeg';
        imgBytes = Uint8Array.from(atob(dataUrl.split(',')[1]), function (c) { return c.charCodeAt(0); });
        w = canvas.width; h = canvas.height;
      }

      var embedded = outMime.indexOf('png') !== -1
        ? await outDoc.embedPng(imgBytes)
        : await outDoc.embedJpg(imgBytes);

      var page = outDoc.addPage([LETTER_W, LETTER_H]);
      var maxW = LETTER_W - 2 * PAGE_MARGIN;
      var maxH = LETTER_H - 2 * PAGE_MARGIN;
      var ratio = Math.min(maxW / w, maxH / h);
      var drawW = w * ratio, drawH = h * ratio;
      page.drawImage(embedded, {
        x: (LETTER_W - drawW) / 2,
        y: (LETTER_H - drawH) / 2,
        width: drawW,
        height: drawH
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function wordToPdfBytes(bytes, fileName) {
    // 1. .docx → HTML via mammoth (accepts ArrayBuffer)
    var conv = await window.mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
    var html = conv.value || '<p>(empty document)</p>';

    // 2. Render into hidden container sized for Letter width (816px @ ~96dpi)
    var host = document.createElement('div');
    host.style.cssText =
      'position:fixed;left:-10000px;top:0;width:816px;padding:64px 72px;' +
      'background:#fff;color:#000;font-family:"Helvetica","Arial",sans-serif;' +
      'font-size:12pt;line-height:1.45;z-index:-1;';
    // Basic reset for child elements
    host.innerHTML =
      '<style>' +
      '.mdoc-word h1{font-size:20pt;margin:.8em 0 .4em;}' +
      '.mdoc-word h2{font-size:16pt;margin:.7em 0 .3em;}' +
      '.mdoc-word h3{font-size:13pt;margin:.6em 0 .3em;}' +
      '.mdoc-word p{margin:.4em 0;}' +
      '.mdoc-word table{border-collapse:collapse;width:100%;margin:.5em 0;}' +
      '.mdoc-word td,.mdoc-word th{border:1px solid #888;padding:4px 6px;vertical-align:top;}' +
      '.mdoc-word img{max-width:100%;height:auto;}' +
      '.mdoc-word ul,.mdoc-word ol{margin:.4em 0 .4em 1.6em;}' +
      '</style>' +
      '<div class="mdoc-word">' + html + '</div>';
    document.body.appendChild(host);

    try {
      // 3. jsPDF.html() — uses html2canvas under the hood; handles pagination
      var jsPDFCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      if (!jsPDFCtor) throw new Error('jsPDF not available');
      var pdf = new jsPDFCtor({ unit: 'pt', format: 'letter', compress: true });
      await new Promise(function (resolve, reject) {
        pdf.html(host, {
          callback: function () { resolve(); },
          margin: [36, 36, 36, 36],
          autoPaging: 'text',
          width: LETTER_W - 72,
          windowWidth: 816,
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }
        });
        // Safety timeout in case jsPDF never calls back
        setTimeout(function () { reject(new Error('Word conversion timed out for ' + fileName)); }, 60000);
      });
      return new Uint8Array(pdf.output('arraybuffer'));
    } finally {
      if (host.parentNode) host.parentNode.removeChild(host);
    }
  }

  async function addCoverPage(outDoc, profile, includedDocs) {
    var PDFLib = window.PDFLib;
    var font = await outDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
    var fontReg = await outDoc.embedFont(PDFLib.StandardFonts.Helvetica);
    // Insert at index 0 so cover is first even though we add it last.
    var page = outDoc.insertPage(0, [LETTER_W, LETTER_H]);

    var x = PAGE_MARGIN + 20;
    var y = LETTER_H - PAGE_MARGIN - 60;

    page.drawText('Applicant Documents', {
      x: x, y: y, size: 22, font: font
    });
    y -= 30;
    page.drawText(profile.full_name || 'Applicant', {
      x: x, y: y, size: 16, font: font
    });
    y -= 22;
    var now = new Date();
    var stamp = now.getUTCFullYear() + '-' +
      String(now.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(now.getUTCDate()).padStart(2, '0') + ' ' +
      String(now.getUTCHours()).padStart(2, '0') + ':' +
      String(now.getUTCMinutes()).padStart(2, '0') + ' UTC';
    page.drawText('Generated: ' + stamp, {
      x: x, y: y, size: 11, font: fontReg
    });
    y -= 36;
    page.drawText('Included documents', {
      x: x, y: y, size: 13, font: font
    });
    y -= 20;

    includedDocs.forEach(function (d, i) {
      if (y < PAGE_MARGIN + 40) return; // don't overflow; rare with <40 docs
      var label = DOC_TYPE_LABELS[d.doc_type] || d.doc_type || 'Document';
      var line = (i + 1) + '. ' + label + ' — ' + (d.file_name || '');
      if (line.length > 90) line = line.slice(0, 87) + '...';
      page.drawText(line, { x: x, y: y, size: 11, font: fontReg });
      y -= 16;
    });
  }

  // ── Orchestration ──────────────────────────────────────────────
  async function generate(applicant, orderedDocs, onProgress) {
    var PDFLib = window.PDFLib;
    var outDoc = await PDFLib.PDFDocument.create();
    outDoc.setTitle('Applicant Documents — ' + (applicant.full_name || 'Applicant'));
    outDoc.setCreator('GlobalHire@eLab');
    outDoc.setProducer('GlobalHire@eLab');

    for (var i = 0; i < orderedDocs.length; i++) {
      var d = orderedDocs[i];
      onProgress('Processing ' + (i + 1) + '/' + orderedDocs.length + ': ' + (d.file_name || d.doc_type));
      var bytes = await fetchDocBytes(d.file_path);
      var kind = kindForFile(d.file_name, d.mime_type);
      try {
        if (kind === 'pdf') {
          await copyPdfPages(outDoc, bytes);
        } else if (kind === 'image') {
          await addImagePage(outDoc, bytes, d.mime_type, d.file_name);
        } else if (kind === 'word') {
          onProgress('Converting Word ' + (i + 1) + '/' + orderedDocs.length + ': ' + (d.file_name || ''));
          var pdfBytes = await wordToPdfBytes(bytes, d.file_name);
          await copyPdfPages(outDoc, pdfBytes);
        } else {
          throw new Error('Unsupported kind for ' + (d.file_name || ''));
        }
      } catch (err) {
        throw new Error('Failed on "' + (d.file_name || d.doc_type) + '": ' + err.message);
      }
    }

    onProgress('Building cover page...');
    await addCoverPage(outDoc, applicant, orderedDocs);

    onProgress('Finalising PDF...');
    return await outDoc.save();
  }

  // ── Public entry point ─────────────────────────────────────────
  async function openMergeModal(applicantId, options) {
    options = options || {};
    var onSaved = options.onSaved || function () {};

    // Fetch profile
    var profRes = await ghFrom('profiles').select('id, full_name').eq('id', applicantId).single();
    if (profRes.error || !profRes.data) {
      alert('Could not load applicant: ' + (profRes.error ? profRes.error.message : 'not found'));
      return;
    }
    var profile = profRes.data;

    // Fetch docs
    var docsRes = await ghFrom('documents').select('id, doc_type, file_name, file_path, mime_type, uploaded_at')
      .eq('applicant_id', applicantId)
      .order('uploaded_at', { ascending: false });
    if (docsRes.error) {
      alert('Could not load documents: ' + docsRes.error.message);
      return;
    }
    var docs = docsRes.data || [];

    // Load libs in parallel with building the modal
    var libsPromise = ensureLibs();

    var overlay = buildModal(profile, docs);
    document.body.appendChild(overlay);

    // Close handlers
    function dismiss() { closeModal(overlay); }
    overlay.querySelector('#mdoc-close').addEventListener('click', dismiss);
    overlay.querySelector('#mdoc-cancel').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });

    // Sortable (once libs are loaded)
    libsPromise.then(function () {
      var list = overlay.querySelector('#mdoc-list');
      if (list && window.Sortable) {
        window.Sortable.create(list, {
          animation: 120,
          filter: '.mdoc-row[data-kind="unsupported"]',
          preventOnFilter: true,
          handle: '.mdoc-drag'
        });
      }
    }).catch(function (err) {
      setStatus(overlay, 'Failed to load PDF libraries: ' + err.message, 'var(--error,#dc2626)');
    });

    // Generate handler
    overlay.querySelector('#mdoc-generate').addEventListener('click', async function () {
      var btn = overlay.querySelector('#mdoc-generate');
      var cancelBtn = overlay.querySelector('#mdoc-cancel');
      btn.disabled = true;
      cancelBtn.disabled = true;
      setStatus(overlay, 'Loading libraries...');

      try {
        await libsPromise;

        // Collect selected rows in DOM order
        var rows = Array.prototype.slice.call(overlay.querySelectorAll('.mdoc-row'));
        var selected = rows
          .filter(function (r) {
            var cb = r.querySelector('.mdoc-check');
            return cb && cb.checked && r.dataset.kind !== 'unsupported';
          })
          .map(function (r) {
            return docs.find(function (d) { return d.id === r.dataset.docId; });
          })
          .filter(Boolean);

        if (!selected.length) {
          setStatus(overlay, 'Select at least one supported document.', 'var(--warning,#d97706)');
          btn.disabled = false;
          cancelBtn.disabled = false;
          return;
        }

        var bytes = await generate(profile, selected, function (msg) {
          setStatus(overlay, msg);
        });

        setStatus(overlay, 'Uploading...');
        var filePath = 'merged/' + applicantId + '/merged.pdf';
        var uploadRes = await sb.storage.from(BUCKET).upload(filePath, bytes, {
          upsert: true,
          contentType: 'application/pdf'
        });
        if (uploadRes.error) throw new Error('Upload failed: ' + uploadRes.error.message);

        // Upsert DB row
        var me = await GHAuth.getUser();
        var dbRes = await ghFrom('merged_documents').upsert({
          applicant_id: applicantId,
          file_path: filePath,
          source_doc_ids: selected.map(function (d) { return d.id; }),
          generated_by: me ? me.id : null,
          generated_at: new Date().toISOString()
        }, { onConflict: 'applicant_id' });

        if (dbRes.error) {
          setStatus(overlay, 'File saved but record update failed: ' + dbRes.error.message,
            'var(--warning,#d97706)');
        } else {
          setStatus(overlay, 'Saved.', 'var(--success,#059669)');
        }

        // Trigger browser download
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = slugify(profile.full_name || 'applicant') + '-documents.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

        if (window.ElabTracker) {
          ElabTracker.track('gh_admin_merged_documents', 'high_value', {
            applicant_id: applicantId,
            doc_count: selected.length,
            platform: 'globalhire'
          });
        }

        onSaved({ filePath: filePath, generatedAt: new Date().toISOString() });
        setTimeout(dismiss, 900);
      } catch (err) {
        console.error('[merge-documents]', err);
        setStatus(overlay, err.message || String(err), 'var(--error,#dc2626)');
        btn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
  }

  function slugify(s) {
    return String(s || 'applicant')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'applicant';
  }

  async function getMergedDownloadUrl(filePath) {
    var { data, error } = await sb.storage.from(BUCKET).createSignedUrl(filePath, 3600);
    if (error || !data) return null;
    return data.signedUrl;
  }

  window.GHMergeDocs = {
    open: openMergeModal,
    getDownloadUrl: getMergedDownloadUrl
  };
})();
