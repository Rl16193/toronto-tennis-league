/**
 * Resend HTML emails for the rally-invite / ladder-challenge loop. All four share one shell
 * (cream header, "L'ŒUF FOR THE GAME" tagline, dark green body) via wrapEmail() — the RRS
 * brand look, matching the site's current Home page hero styling.
 */

const COLORS = {
  cream: '#FBF3E7',
  darkGreen: '#143D34',
  highlightBg: '#1B4E43',
  clay: '#FF6B35',
  bodyText: '#ffffff',
  mutedText: '#999999',
  faintText: '#bbbbbb',
};

// Shared shell: cream header with the wordmark + tagline, white content card, grey footer.
// `preheader` is the hidden inbox-preview text; `title`/`bodyHtml` are the content section.
function wrapEmail({ preheader, title, bodyHtml, footerNote }) {
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
  <body dir="ltr" lang="en" style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial, Helvetica, sans-serif;">
    <div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
      ${preheader}
    </div>
    <table
      align="center" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
      style="margin:20px auto;max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.1);"
    >
      <tbody>
        <!-- Header: cream, wordmark + tagline -->
        <tr>
          <td align="center" style="padding:32px 40px;background-color:${COLORS.cream};text-align:center;">
            <h1
              style="margin:0;padding:0;font-size:26px;line-height:1.3;font-weight:bold;text-align:center;font-family:Arial, Helvetica, sans-serif;letter-spacing:0.5px;color:${COLORS.darkGreen};text-transform:uppercase;"
            >
              RACQUETS &amp; STRINGS
            </h1>
            <p
              style="margin:6px 0 0;padding:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:${COLORS.clay};font-family:Arial, Helvetica, sans-serif;"
            >
              L&rsquo;&OElig;UF FOR THE GAME
            </p>
          </td>
        </tr>

        <!-- Content -->
        <tr>
          <td style="padding:28px 40px;background-color:${COLORS.darkGreen};">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td
            align="center"
            style="padding:18px 40px;background-color:#f9f9f9;text-align:center;border-top:1px solid #eeeeee;"
          >
            <p style="margin:0 0 5px;padding:0;font-size:12px;color:${COLORS.mutedText};line-height:1.5;font-family:Arial, Helvetica, sans-serif;">
              Racquets &amp; Strings &middot; Toronto, ON
            </p>
            <p style="margin:0;padding:0;font-size:11px;color:${COLORS.faintText};line-height:1.5;font-family:Arial, Helvetica, sans-serif;">
              ${footerNote}
            </p>
          </td>
        </tr>
      </tbody>
    </table>
  </body>
</html>`;
}

// Shared "info badge" / highlight-card block used by all templates (challenger/partner callout,
// and the incomplete-matches breakdown lines).
function infoBadge(label, value) {
  return `<table
    width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation"
    style="margin:20px 0;background-color:${COLORS.highlightBg};border-left:4px solid ${COLORS.clay};border-radius:8px;"
  >
    <tbody>
      <tr>
        <td style="padding:16px;">
          <p style="margin:0;padding:0;font-size:11px;color:#ffffff;font-weight:bold;text-transform:uppercase;letter-spacing:1.5px;font-family:Arial, Helvetica, sans-serif;">
            ${label}
          </p>
          <p style="margin:4px 0 0;padding:0;font-size:18px;color:#ffffff;font-weight:bold;font-family:Arial, Helvetica, sans-serif;">
            ${value}
          </p>
        </td>
      </tr>
    </tbody>
  </table>`;
}

function ctaButton(href, label) {
  return `<table align="center" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:24px auto 0;">
    <tbody>
      <tr>
        <td align="center">
          <a
            href="${href}" target="_blank" rel="noopener noreferrer nofollow"
            style="color:#ffffff;text-decoration:none;display:inline-block;background-color:${COLORS.clay};font-family:Arial, Helvetica, sans-serif;font-size:15px;font-weight:bold;padding:13px 22px;border-radius:10px;letter-spacing:0.3px;"
          >${label}</a>
        </td>
      </tr>
    </tbody>
  </table>`;
}

function paragraph(html) {
  return `<p style="margin:0 0 16px;padding:0;font-size:15px;color:${COLORS.bodyText};line-height:1.6;font-family:Arial, Helvetica, sans-serif;">${html}</p>`;
}

function heading(text) {
  return `<h2 style="margin:0 0 8px;padding:0;font-size:22px;line-height:1.3;font-weight:bold;color:#ffffff;font-family:Arial, Helvetica, sans-serif;">${text}</h2>`;
}

function buildRallyEmail(senderName) {
  return wrapEmail({
    preheader: `${senderName} wants to rally with you on the court!`,
    title: 'Friendly Rally Invite',
    footerNote: "You're receiving this notification because another player invited you to hit on Friendlies.",
    bodyHtml: `
      ${heading('Friendly Rally Invite &#129309;')}
      ${paragraph(`<strong>${senderName}</strong> sent you an invitation for a friendly rally session! No points, no tournament pressure. Just tennis.`)}
      ${infoBadge('RALLY PARTNER', senderName)}
      ${paragraph('Accept the rally request to arrange a time and court location to hit together.')}
      ${ctaButton('https://www.racquetsandstrings.ca/matches?mode=friendlies', 'Accept Rally')}
    `,
  });
}

function buildRallyAcceptedEmail(partnerName) {
  return wrapEmail({
    preheader: `${partnerName} accepted your rally invite!`,
    title: 'Rally Accepted',
    footerNote: "You're receiving this notification because your rally invite was accepted.",
    bodyHtml: `
      ${heading('Rally Accepted &#127934;')}
      ${paragraph(`<strong>${partnerName}</strong> accepted your friendly rally invite! Time to lock in a court and a time to hit.`)}
      ${infoBadge('RALLY PARTNER', partnerName)}
      ${paragraph('Reach out to arrange a time and court location together.')}
      ${ctaButton('https://www.racquetsandstrings.ca/matches?mode=friendlies', 'View Friendlies')}
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
      ${infoBadge('CHALLENGER', challengerName)}
      ${paragraph('Accept the challenge to choose a court, arrange a time, and start playing to defend your ladder ranking.')}
      ${ctaButton('https://www.racquetsandstrings.ca/matches?mode=challenges', 'Respond to Challenge')}
    `,
  });
}

function buildChallengeAcceptedEmail(opponentName, ladderName) {
  return wrapEmail({
    preheader: `${opponentName} accepted your challenge in ${ladderName}!`,
    title: 'Challenge Accepted',
    footerNote: "You're receiving this notification because you are active on the ladder.",
    bodyHtml: `
      ${heading('Challenge Accepted &#9989;')}
      ${paragraph(`<strong>${opponentName}</strong> accepted your challenge in the <strong>${ladderName}</strong>. Game on!`)}
      ${infoBadge('OPPONENT', opponentName)}
      ${paragraph('Arrange a time and court, play your match, then report the result on the ladder.')}
      ${ctaButton('https://www.racquetsandstrings.ca/matches?mode=challenges', 'View Challenge')}
    `,
  });
}

// Weekly "you still have things to finish" digest. `lines` is a pre-formatted array of strings
// like "2 Summer Gauntlet Matches" / "1 friendly" / "1 challenge" — one per non-zero category,
// already pluralized by the caller (see notifications.js weeklyReminders).
function buildIncompleteMatchesEmail(lines, totalCount) {
  const listHtml = lines
    .map(
      (l) => `<tr>
        <td style="padding:5px 16px;font-size:15px;color:#ffffff;font-weight:bold;font-family:Arial, Helvetica, sans-serif;">
          ${l}
        </td>
      </tr>`,
    )
    .join('');
  return wrapEmail({
    preheader: `You have ${totalCount} incomplete match${totalCount === 1 ? '' : 'es'} waiting on you.`,
    title: 'Incomplete Matches',
    footerNote: "You're receiving this notification because you have matches, friendlies, or challenges still in progress.",
    bodyHtml: `
      ${heading('Incomplete Matches &#9203;')}
      ${paragraph(`You currently have <strong>${totalCount}</strong> incomplete match${totalCount === 1 ? '' : 'es'} that need your attention.`)}
      <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0 20px;background-color:${COLORS.highlightBg};border-left:4px solid ${COLORS.clay};border-radius:8px;">
        <tbody style="display:table-row-group;">
          <tr><td style="padding:10px 16px 0;"></td></tr>
          ${listHtml}
          <tr><td style="padding:0 16px 10px;"></td></tr>
        </tbody>
      </table>
      ${paragraph('See the details on your profile page and follow up with your opponents.')}
      ${ctaButton('https://www.racquetsandstrings.ca/profile', 'View Profile')}
    `,
  });
}

module.exports = {
  buildRallyEmail,
  buildRallyAcceptedEmail,
  buildChallengeEmail,
  buildChallengeAcceptedEmail,
  buildIncompleteMatchesEmail,
};
