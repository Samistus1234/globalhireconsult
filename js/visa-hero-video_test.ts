// js/visa-hero-video_test.ts
import { assertEquals } from 'jsr:@std/assert@^1.0.0';
import { shouldLoadVideo, buildVideoElement } from './visa-hero-video.js';

Deno.test('shouldLoadVideo: false on reduced motion', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: true,  downlink: 10 }), false);
});

Deno.test('shouldLoadVideo: false when downlink < 3 Mbps', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: 1.5 }), false);
});

Deno.test('shouldLoadVideo: true when motion ok and fast enough', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: 5 }), true);
});

Deno.test('shouldLoadVideo: undefined downlink means assume fast (defensive default)', () => {
  assertEquals(shouldLoadVideo({ reducedMotion: false, downlink: undefined }), true);
});

Deno.test('buildVideoElement: returns a serialisable description (testable in Deno)', () => {
  const desc = buildVideoElement({
    sources: [{ src: 'a.webm', type: 'video/webm' }, { src: 'a.mp4', type: 'video/mp4' }],
    poster: 'p.jpg',
  });
  assertEquals(desc.tag, 'video');
  assertEquals(desc.attrs.autoplay, true);
  assertEquals(desc.attrs.muted, true);
  assertEquals(desc.attrs.loop, true);
  assertEquals(desc.attrs.playsinline, true);
  assertEquals(desc.attrs.poster, 'p.jpg');
  assertEquals(desc.children.length, 2);
  assertEquals(desc.children[0], { tag: 'source', attrs: { src: 'a.webm', type: 'video/webm' } });
});
