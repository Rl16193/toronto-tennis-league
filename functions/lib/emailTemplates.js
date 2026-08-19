/**
 * Every Resend HTML email the app sends. All six share one shell (wrapEmail) — cream card with
 * the clay tagline above the wordmark, dark-green body, cream footer — so a brand change is one
 * edit rather than six.
 *
 * Emoji are written as HTML entities rather than literals so they survive any transport that
 * isn't UTF-8 clean.
 */

const { SITE, INSTAGRAM, WHATSAPP, FAQ } = require('./constants');

const COLORS = {
  pageBg: '#f5f5f2',
  card: '#FAFAF8',
  darkGreen: '#143D34',
  highlightBg: '#1B4E43',
  divider: '#1F5247',
  clay: '#FF6B35',
  ctaBg: '#c0622a',
  bodyText: '#FFFFFF',
  mutedText: '#E0E0E0',
  footerText: '#143D34',
};

const FONT = 'Arial, Helvetica, sans-serif';

// Shared shell. `preheader` is the hidden inbox-preview line; `bodyHtml` is the dark-green
// content section. `footerExtra` is an optional row above the "you're receiving this" note.
function wrapEmail({ preheader, title, bodyHtml, footerNote, footerExtra = '' }) {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" lang="en">
  <head>
    <meta content="width=device-width" name="viewport" />
    <meta content="text/html; charset=UTF-8" http-equiv="Content-Type" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta content="IE=edge" http-equiv="X-UA-Compatible" />
    <meta content="telephone=no,address=no,email=no,date=no,url=no" name="format-detection" />
    <title>${title}</title>
  </head>
  <body dir="ltr" lang="en" style="margin:0;padding:0;background-color:${COLORS.pageBg};font-family:${FONT};">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
      ${preheader}
    </div>
    <table
      align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
      style="margin:20px auto;max-width:600px;width:100%;background-color:${COLORS.card};border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);"
    >
      <tbody>
        <!-- Header: tagline above the wordmark -->
        <tr>
          <td align="center" style="padding:28px 40px 22px;background-color:${COLORS.card};text-align:center;">
            <p style="margin:0 0 8px;padding:0;font-size:14px;color:${COLORS.clay};letter-spacing:4px;text-transform:uppercase;font-weight:bold;font-family:${FONT};">
              L&#x27;OEUF FOR THE GAME
            </p>
            <h1 style="margin:0;padding:0;font-size:28px;line-height:1.3;font-weight:bold;text-align:center;font-family:${FONT};letter-spacing:0.5px;color:${COLORS.darkGreen};text-transform:uppercase;">
              Racquets &amp; Strings
            </h1>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="background-color:${COLORS.darkGreen};padding:24px 40px;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:22px 40px;background-color:${COLORS.card};text-align:center;border-top:1px solid #eeeeee;">
            <p style="margin:0 0 5px;padding:0;font-size:12px;color:${COLORS.footerText};line-height:1.5;font-family:${FONT};">
              Racquets &amp; Strings &middot; Toronto, ON
            </p>
            ${footerExtra}
            <p style="margin:0;padding:0;font-size:11px;color:${COLORS.footerText};line-height:1.5;font-family:${FONT};">
              ${footerNote}
            </p>
            <p style="margin:8px 0 0;padding:0;font-size:11px;color:${COLORS.footerText};line-height:1.5;font-family:${FONT};">
              <a href="${LINK.profile}" style="color:${COLORS.footerText};text-decoration:underline;">Manage email preferences</a>
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

function heading(text) {
  return `<h2 style="margin:0 0 8px;padding:0;font-size:22px;line-height:1.3;font-weight:bold;color:${COLORS.bodyText};font-family:${FONT};">${text}</h2>`;
}

/** Primary white body copy. */
function paragraph(html) {
  return `<p style="margin:0 0 16px;padding:0;font-size:15px;color:${COLORS.bodyText};line-height:1.6;font-family:${FONT};">${html}</p>`;
}

/** Secondary grey copy — the "what to do next" line that sits above the CTA. */
function mutedParagraph(html) {
  return `<p style="margin:0 0 20px;padding:0;font-size:15px;color:${COLORS.mutedText};line-height:1.6;font-family:${FONT};">${html}</p>`;
}

/** Clay-edged callout: small clay label over a large white value (opponent / rally partner). */
function infoBadge(label, value) {
  return `<table
    width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
    style="margin:16px 0 20px;background-color:${COLORS.highlightBg};border-left:4px solid ${COLORS.clay};border-radius:12px;overflow:hidden;"
  >
    <tbody>
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0;padding:0;font-size:13px;color:${COLORS.clay};font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;font-family:${FONT};">
            ${label}
          </p>
          <p style="margin:6px 0 0;padding:0;font-size:18px;color:${COLORS.bodyText};font-weight:bold;font-family:${FONT};">
            ${value}
          </p>
        </td>
      </tr>
    </tbody>
  </table>`;
}

/** Same callout shape, but a paragraph instead of a headline value (the points card). */
function noteCard(label, body) {
  return `<table
    width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
    style="margin:24px 0 0;background-color:${COLORS.highlightBg};border-radius:12px;border-left:4px solid ${COLORS.clay};overflow:hidden;"
  >
    <tbody>
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;padding:0;font-size:13px;color:${COLORS.clay};font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;font-family:${FONT};">
            ${label}
          </p>
          <p style="margin:0;padding:0;font-size:14px;color:${COLORS.bodyText};line-height:1.6;font-family:${FONT};">
            ${body}
          </p>
        </td>
      </tr>
    </tbody>
  </table>`;
}

function buttonHtml(href, label, bg = COLORS.ctaBg, color = '#ffffff') {
  return `<a
    href="${href}" target="_blank" rel="noopener noreferrer nofollow"
    style="color:${color};text-decoration:none;display:inline-block;background-color:${bg};font-family:${FONT};font-size:13px;font-weight:bold;padding:12px 18px;border-radius:10px;letter-spacing:0.3px;"
  >${label}</a>`;
}

/** Single CTA, separated from the body by the divider rule. */
function ctaButton(href, label) {
  return `<table
    width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
    style="padding-top:20px;border-top:1px solid ${COLORS.divider};"
  >
    <tbody>
      <tr>
        <td align="center">${buttonHtml(href, label)}</td>
      </tr>
    </tbody>
  </table>`;
}

/** One centred row of side-by-side buttons (welcome email). */
function buttonRow(buttons, marginBottom = '0') {
  const cells = buttons
    .map((b) => `<td style="padding:0 4px;">${buttonHtml(b.href, b.label, b.bg, b.color)}</td>`)
    .join('');
  return `<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 auto ${marginBottom};">
    <tbody><tr>${cells}</tr></tbody>
  </table>`;
}

/** Numbered onboarding step: clay circle + title + description. */
function step(n, title, body, marginBottom = '12px') {
  return `<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 ${marginBottom};">
    <tbody>
      <tr>
        <td width="30" valign="top" style="padding-top:1px;">
          <div style="width:30px;height:30px;background-color:${COLORS.clay};border-radius:50%;color:#ffffff;font-size:13px;font-weight:bold;text-align:center;line-height:30px;font-family:${FONT};">${n}</div>
        </td>
        <td style="padding-left:14px;">
          <p style="margin:0 0 3px;padding:0;font-size:15px;color:${COLORS.bodyText};font-weight:bold;font-family:${FONT};">${title}</p>
          <p style="margin:0;padding:0;font-size:14px;color:${COLORS.mutedText};line-height:1.5;font-family:${FONT};">${body}</p>
        </td>
      </tr>
    </tbody>
  </table>`;
}

// Deep links. The app reads the tab from `?mode=` (see Matches.tsx) — `/friendlies` and
// `/challenges` are bare redirects that drop the query string, so they must not be used here.
const LINK = {
  friendlies: `${SITE}/matches?mode=friendlies`,
  challenges: `${SITE}/matches?mode=challenges`,
  profile: `${SITE}/profile`,
  events: `${SITE}/events`,
};

function buildRallyEmail(senderName) {
  return wrapEmail({
    preheader: `${senderName} wants to rally with you on the court!`,
    title: 'Friendly Rally Invite',
    footerNote: "You're receiving this notification because another player invited you to hit on Friendlies.",
    bodyHtml: `
      ${heading('Friendly Rally Invite &#129309;')}
      ${paragraph(`<strong>${senderName}</strong> sent you an invitation for a friendly rally session! No points, no tournament pressure. Just tennis.`)}
      ${infoBadge('Rally Partner', senderName)}
      ${mutedParagraph('Accept the rally request to arrange a time and court location to hit together.')}
      ${ctaButton(LINK.friendlies, 'Accept Rally')}
    `,
  });
}

function buildRallyAcceptedEmail(partnerName) {
  return wrapEmail({
    preheader: `${partnerName} accepted your rally invite — time to hit the court!`,
    title: 'Your rally invite was accepted!',
    footerNote: "You're receiving this notification because another player accepted your invite on Friendlies.",
    bodyHtml: `
      ${heading('Rally Accepted! &#129309;')}
      ${paragraph(`<strong>${partnerName}</strong> accepted your friendly rally invite. No points, no pressure &mdash; just time to hit.`)}
      ${infoBadge('Rally Partner', partnerName)}
      ${mutedParagraph('Head to Friendlies to lock in a time and a court to hit together.')}
      ${ctaButton(LINK.friendlies, 'Schedule Your Rally')}
    `,
  });
}

function buildChallengeEmail(challengerName, ladderName) {
  return wrapEmail({
    preheader: `${challengerName} has challenged you to a ladder match!`,
    title: 'You have received a challenge!',
    footerNote: "You're receiving this notification because you are active on the ladder.",
    bodyHtml: `
      ${heading('You&rsquo;ve Been Challenged! &#127942;')}
      ${paragraph(`<strong>${challengerName}</strong> has challenged you in the <strong>${ladderName}</strong>.`)}
      ${infoBadge('Challenger', challengerName)}
      ${mutedParagraph('Accept the challenge to choose a court, arrange a time, and start playing to defend your ladder ranking.')}
      ${ctaButton(LINK.challenges, 'Respond to Challenge')}
    `,
  });
}

function buildChallengeAcceptedEmail(opponentName, ladderName) {
  return wrapEmail({
    preheader: `${opponentName} accepted your challenge — time to get on the court!`,
    title: 'Your challenge was accepted!',
    footerNote: "You're receiving this notification because you are active on the ladder.",
    bodyHtml: `
      ${heading('Challenge Accepted! &#127934;')}
      ${paragraph(`<strong>${opponentName}</strong> accepted your challenge in the <strong>${ladderName}</strong>. Time to lock in a court and a time.`)}
      ${infoBadge('Opponent', opponentName)}
      ${mutedParagraph('Head to your matches to coordinate a court, agree on a time, and get the match on the books.')}
      ${ctaButton(LINK.challenges, 'Schedule Your Match')}
    `,
  });
}

/**
 * Weekly "you still have things to finish" digest. Shows the total only — the per-category
 * breakdown was dropped deliberately, so the caller no longer passes its `lines`.
 * `firstName` is optional; without it the greeting simply omits the name.
 */
function buildIncompleteMatchesEmail(totalCount, firstName) {
  const plural = totalCount === 1 ? '' : 'es';
  const greeting = firstName ? `Ready to hit the court, ${firstName}? &#127934;` : 'Ready to hit the court? &#127934;';
  return wrapEmail({
    preheader: `You have ${totalCount} incomplete match${plural} waiting on you.`,
    title: 'Incomplete Matches',
    footerNote: "You're receiving this because you subscribed to weekly match reminders.",
    bodyHtml: `
      ${heading(greeting)}
      ${mutedParagraph(`You currently have <strong>${totalCount}</strong><strong> incomplete match${plural}</strong> that need your action or attention. Log in to see the details and follow up with your opponents.`)}
      ${ctaButton(LINK.profile, 'View My Matches')}
    `,
  });
}

function buildWelcomeEmail(firstName) {
  return wrapEmail({
    preheader: 'Get ready to play with these quick next steps.',
    title: 'Get ready to play with these quick next steps.',
    footerNote: "You're receiving this because you signed up with Racquets &amp; Strings.",
    footerExtra: `<p style="margin:0 0 8px;padding:0;font-size:13px;font-family:${FONT};">
      <a href="${SITE}" target="_blank" rel="noopener noreferrer nofollow" style="color:#0670db;text-decoration:underline;">www.racquetsandstrings.ca</a>
    </p>`,
    bodyHtml: `
      ${heading(`Welcome ${firstName}! &#127934;`)}
      ${paragraph("Your email is verified and you're officially part of Toronto's fastest-growing tennis community. Here's everything you need to get started.")}

      <h3 style="margin:0 0 14px;padding:0;font-size:13px;line-height:1.2;font-weight:bold;color:${COLORS.clay};text-transform:uppercase;letter-spacing:2px;font-family:${FONT};">
        Beginner Package
      </h3>

      ${step(1, 'Complete your profile', 'Add your skill level, court preferences, and availability so we can match you with the right opponent.')}
      ${step(2, 'Browse open events', 'Friendlies, Challenges, Socials and Tournaments are live right now. Free entry, all skill levels welcome.')}
      ${step(3, 'Read the rules', 'Understand how scoring and advancement work before your first match.')}
      ${step(4, 'Join the WhatsApp community', 'Stay updated on events, find hitting partners.')}
      ${step(5, 'Tell us about your local courts', 'Help the community understand how the local tennis courts work.', '20px')}

      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="padding-top:20px;border-top:1px solid ${COLORS.divider};">
        <tbody>
          <tr>
            <td align="center" style="text-align:center;">
              <p style="margin:0 0 16px;padding:0;font-size:15px;color:${COLORS.bodyText};font-family:${FONT};">
                Everything you need, right here:
              </p>
              ${buttonRow(
                [
                  { href: LINK.events, label: 'Browse Events' },
                  { href: FAQ, label: 'View FAQ', bg: COLORS.card, color: COLORS.darkGreen },
                ],
                '8px',
              )}
              ${buttonRow([
                { href: WHATSAPP, label: 'Join WhatsApp', bg: '#25d366' },
                { href: INSTAGRAM, label: 'Instagram', bg: '#8a3ab9' },
              ])}
            </td>
          </tr>
        </tbody>
      </table>

      ${noteCard(
        '&#127942; Redeem the Points you collect',
        'Complete your profile, participate in events, and finish tasks to earn community points. Unlock discounted stringing services and coaching lessons!',
      )}
    `,
  });
}

module.exports = {
  // Exported so notify.js/index.js can point List-Unsubscribe at the same profile URL the footer
  // link uses, rather than hardcoding it a third time.
  LINK,
  buildRallyEmail,
  buildRallyAcceptedEmail,
  buildChallengeEmail,
  buildChallengeAcceptedEmail,
  buildIncompleteMatchesEmail,
  buildWelcomeEmail,
};
