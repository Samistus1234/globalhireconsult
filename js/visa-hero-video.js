/* ============================================
   GLOBALHIRE@ELAB — Hub hero video module
   Post-LCP attach guarded by reduced-motion + downlink.
   Spec §3.4
   ============================================ */

export function shouldLoadVideo({ reducedMotion, downlink }) {
  if (reducedMotion) return false;
  if (downlink !== undefined && downlink < 3) return false;
  return true;
}

// Returns a serialisable description; useful in tests.
// In browsers, the description is converted to a real DOM node via toDOM().
export function buildVideoElement({ sources, poster }) {
  return {
    tag: 'video',
    attrs: {
      autoplay: true,
      muted: true,
      loop: true,
      playsinline: true,
      poster,
    },
    children: sources.map((s) => ({
      tag: 'source',
      attrs: { src: s.src, type: s.type },
    })),
  };
}

function descriptionToDOM(desc, doc) {
  const el = doc.createElement(desc.tag);
  for (const [k, v] of Object.entries(desc.attrs)) {
    if (v === true) el.setAttribute(k, '');
    else if (v === false || v == null) continue;
    else el.setAttribute(k, String(v));
  }
  for (const c of desc.children || []) {
    el.appendChild(descriptionToDOM(c, doc));
  }
  return el;
}

if (typeof window !== 'undefined') {
  // Look for a hero container with the data attributes that describe the video sources.
  const ready = () => {
    const heroBg = document.querySelector('.visa-hero--hub .visa-hero__bg');
    if (!heroBg) return;
    const webm = heroBg.dataset.videoWebm;
    const mp4  = heroBg.dataset.videoMp4;
    const poster = heroBg.dataset.poster;
    if (!webm && !mp4) return;

    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const downlink = navigator.connection?.downlink;

    if (!shouldLoadVideo({ reducedMotion, downlink })) return;

    const sources = [];
    if (webm) sources.push({ src: webm, type: 'video/webm' });
    if (mp4)  sources.push({ src: mp4,  type: 'video/mp4' });

    const desc = buildVideoElement({ sources, poster });
    const video = descriptionToDOM(desc, document);
    // Replace the poster image, if any, with the video. Else just append.
    const posterImg = heroBg.querySelector('img');
    if (posterImg) posterImg.replaceWith(video); else heroBg.appendChild(video);
  };

  // Defer until after LCP-ish window via rIC, or as soon as DOM ready if rIC unavailable
  if ('requestIdleCallback' in window) {
    requestIdleCallback(ready, { timeout: 2500 });
  } else {
    setTimeout(ready, 1200);
  }
}
