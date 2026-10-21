import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReminderEmail, niceName } from "./index.ts";

const portal = "https://globalhire.elabsolution.org/portal.html";
const logo = "https://globalhire.elabsolution.org/assets/brand/globalhire-logo-white.png";

Deno.test("niceName fixes all-caps stored names and empty input", () => {
  assertEquals(niceName("OJUKWU ANTHONY CHIDUBEM"), "Ojukwu Anthony Chidubem");
  assertEquals(niceName("  abu-bakar   o'neil "), "Abu-Bakar O'Neil");
  assertEquals(niceName(null), "there");
  assertEquals(niceName("   "), "there");
});

Deno.test("first note names exactly what is missing and links the portal", () => {
  const m = buildReminderEmail("first", "ADA OKAFOR", ["specialty", "phone"], true, portal, logo);
  assertEquals(m.subject, "One quick step to complete your GlobalHire profile");
  assertStringIncludes(m.html, "Dear Ada Okafor,");
  assertStringIncludes(m.html, "Your specialty");
  assertStringIncludes(m.html, "Your phone number");
  assert(!m.html.includes("Your country"));
  assertStringIncludes(m.html, "We have received your documents");
  assertStringIncludes(m.html, portal);
  assertStringIncludes(m.text, "• Your specialty");
  assert(!m.text.includes("• Your country"));
});

Deno.test("no documents -> does not claim documents were received", () => {
  const m = buildReminderEmail("first", "Ada", ["country"], false, portal, logo);
  assert(!m.html.includes("received your documents"));
  assertStringIncludes(m.html, "Thank you for registering");
});

Deno.test("follow-up has its own subject/eyebrow and is not the same email", () => {
  const f = buildReminderEmail("followup", "Ada", ["country"], true, portal, logo);
  assertEquals(f.subject, "Your GlobalHire profile is still incomplete");
  assertStringIncludes(f.html, "REMINDER");
});

Deno.test("copy never mentions automation, stages or the review queue", () => {
  const all = (["first", "followup"] as const)
    .map((k) => buildReminderEmail(k, "Ada", ["specialty", "country", "phone"], true, portal, logo))
    // visible words only: strip <style> blocks and tags so CSS (e.g. border-bottom) can't match
    .map((m) => (m.subject + " " + m.html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ") + " " + m.text).toLowerCase())
    .join(" ");
  for (const w of ["automat", "screening", "pipeline", "queue", "system-generated"]) {
    assert(!all.includes(w), "found forbidden word: " + w);
  }
  assert(!/\bbot\b/.test(all), "found forbidden word: bot");
});

Deno.test("blank name gets a plain greeting, never 'Dear there'", () => {
  for (const blank of ["", "   ", null]) {
    const m = buildReminderEmail("first", blank, ["phone"], true, portal, logo);
    assertStringIncludes(m.html, "Hello,");
    assert(!m.html.includes("Dear there"));
    assert(m.text.startsWith("Hello,"));
  }
});

Deno.test("names are HTML-escaped", () => {
  const m = buildReminderEmail("first", "<script>alert(1)</script>", ["phone"], true, portal, logo);
  assert(!m.html.includes("<script>"));
});
