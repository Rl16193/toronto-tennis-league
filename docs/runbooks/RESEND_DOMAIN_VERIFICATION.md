# Resend domain verification runbook

This runbook covers the external DNS and environment checks needed before transactional email is considered operational. DNS and Resend state were not changed or verified from this checkout.

## Current code contract

- Email is sent only from Cloud Functions through the server-side `RESEND_API_KEY` secret.
- The configured sender is `Racquets & Strings <notifications@racquetsandstrings.ca>`.
- Replies use `events@racquetsandstrings.ca`.
- The notification path reads the recipient address from `contacts/{uid}` and respects `preferences/{uid}.email_notifications === false`.
- Local emulators never send email. A non-production Firebase project requires `EMAIL_DELIVERY_ENABLED=true` and an exact comma-separated `EMAIL_ALLOWED_RECIPIENTS` list.
- Production delivery is selected only when the runtime project is `toronto-tennis-league`; do not use that project for routine development or QA.

## Resend steps

1. In Resend, add `racquetsandstrings.ca` as a sending domain.
2. Record the exact DKIM, SPF, and any return-path records Resend provides. Do not substitute values from another domain or account.
3. Confirm Resend reports the domain as verified after DNS propagation.
4. Create or confirm the API key in the authorized secret store. Store it as the Firebase Functions secret `RESEND_API_KEY`; never commit it or place it in `.env.local`.
5. Send a controlled test only from an isolated staging project using an allowlisted test mailbox.

## Hostinger DNS steps

1. Open the authoritative DNS zone for `racquetsandstrings.ca` in Hostinger.
2. Add the exact records supplied by Resend, preserving record names, values, and TTL guidance.
3. Check for conflicting SPF records. Publish one SPF policy for the domain rather than multiple independent SPF TXT records.
4. Do not remove existing mail-provider records without identifying their owner and impact.
5. Wait for propagation, then return to Resend and refresh verification.

## SPF and DMARC checks

- SPF must authorize every legitimate sender for the domain, including Resend and any existing mailbox provider. Do not exceed SPF lookup limits.
- DMARC should start with a monitored policy such as `p=none` only if the domain owner needs observation; tighten it after reviewing aggregate reports and confirming all legitimate senders.
- Use a reporting mailbox controlled by the domain owner. Do not put personal addresses or secrets into DNS records.
- DKIM, SPF, and DMARC are external state: this repository cannot prove their current status.

## Validation checklist

- [ ] Resend domain status is `verified`.
- [ ] DKIM records resolve publicly and match Resend’s supplied values.
- [ ] SPF has one coherent policy and includes every approved sender.
- [ ] DMARC is published and its reporting mailbox is monitored.
- [ ] `RESEND_API_KEY` exists only in the authorized Functions secret store.
- [ ] A staging test uses a dedicated allowlisted mailbox and confirms both HTML and text parts.
- [ ] Email opt-out is verified with `email_notifications=false`.
- [ ] Production delivery approval is separate from staging validation.

## Evidence to record

Record the verification date, Resend domain status, DNS record names (not secret values), test project ID, test recipient class, and the exact source SHA. Never record API keys, mailbox credentials, or private DNS values in Git.
