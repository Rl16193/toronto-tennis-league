const nodeCrypto = require('node:crypto');

/**
 * Correlation-safe identifier for logs. Keep operational traces useful without putting user IDs,
 * email addresses, coupon codes, or storage paths into the log stream.
 */
const safeId = (value) =>
  nodeCrypto
    .createHash('sha256')
    .update(String(value ?? ''))
    .digest('hex')
    .slice(0, 12);

module.exports = { safeId };
