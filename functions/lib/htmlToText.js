/**
 * HTML → plain text for the multipart alternative on every outgoing email. Lives in lib/ for the
 * same reason notify.js does: index.js/notifications.js/taskPoints.js are re-exported wholesale as
 * Cloud Functions, so a plain helper can't live there.
 *
 * Sending HTML with no text/plain part is a long-standing spam signal. This produces the text half.
 * It is tuned to the markup emailTemplates.js actually emits, not to arbitrary HTML — three things
 * a naive tag-strip gets wrong, all of which apply to those templates:
 *
 *   1. The preheader lives in a `display:none` div. Plain text has no CSS, so a dumb stripper
 *      prints the teaser AND the real heading right after it. We keep it as the opening line and
 *      drop the hidden wrapper.
 *   2. CTAs are <a> tags. Stripping them leaves "Accept Rally" with no URL, making the text version
 *      useless. Links become "Label: https://…" — unless the label already *is* the URL.
 *   3. Entities (&#129309;, &amp;, &#x27;) must be decoded or readers see "Racquets &amp; Strings".
 */

// The templates currently use &amp; &rsquo; &middot; &mdash;. The rest are here so a new template
// using a smart quote or ellipsis doesn't silently ship "You&rsquo;ve" to recipients. Numeric
// escapes (&#129309;, &#x27;) are handled generically below and need no table.
const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
};

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED[name.toLowerCase()] ?? m);
}

function htmlToText(html) {
  return decodeEntities(
    String(html)
      // Drop everything that never renders as copy.
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<(head|style|script|title)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // Links: keep the destination. "Label: url", or just the url when the label repeats it.
      .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, label) => {
        const text = label
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return !text || href.includes(text) ? ` ${href} ` : ` ${text}: ${href} `;
      })
      // Block-level tags become line breaks; <br> too.
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h1|h2|h3|table|td)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      // Normalise whitespace: trim each line, collapse runs of blanks to one.
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+/g, ' ').trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

module.exports = { htmlToText };
