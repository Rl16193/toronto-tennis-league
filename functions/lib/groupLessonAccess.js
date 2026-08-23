const { TZ } = require('./constants');

/**
 * Resolve midnight at the start of the following calendar month in the configured time zone.
 * The two-pass adjustment handles Toronto's UTC-4/UTC-5 daylight-saving offset without relying
 * on the host process time zone.
 */
function nextMonthStart(month, timeZone = TZ) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Invalid month key: ${month}`);
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) throw new Error(`Invalid month key: ${month}`);

  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  const desiredLocalAsUtc = Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  let utcMillis = desiredLocalAsUtc;
  for (let pass = 0; pass < 2; pass += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(utcMillis))
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const observedLocalAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    utcMillis += desiredLocalAsUtc - observedLocalAsUtc;
  }

  return new Date(utcMillis);
}

module.exports = { nextMonthStart };
