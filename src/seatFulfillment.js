const LOCAL_PART_PATTERN = /^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/;
const DEFAULT_MAX_TOTAL_CHARACTERS = 2800;

function validSeatEmail(value) {
  if (!value || value.length > 254 || /\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (
    !local
    || local.length > 64
    || !LOCAL_PART_PATTERN.test(local)
    || local.startsWith('.')
    || local.endsWith('.')
    || local.includes('..')
  ) return false;
  if (!domain || domain.length > 253 || domain.startsWith('.') || domain.endsWith('.')) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[A-Za-z0-9-]+$/.test(label)
    && !label.startsWith('-')
    && !label.endsWith('-')
  ));
}

function seatEmailError(message, details = {}) {
  return Object.assign(new Error(message), { statusCode: 400, ...details });
}

export function parseSeatEmailLines(input, {
  maxQuantity = 20,
  maxTotalCharacters = DEFAULT_MAX_TOTAL_CHARACTERS
} = {}) {
  const sourceLines = Array.isArray(input)
    ? input.map((value) => String(value ?? ''))
    : String(input ?? '').split(/\r?\n/);
  const entries = sourceLines
    .map((value, index) => ({ value: value.trim(), line: index + 1 }))
    .filter((entry) => entry.value);

  if (!entries.length) {
    throw seatEmailError('At least one seat email is required', { code: 'seat_email_required' });
  }

  const totalCharacters = entries.reduce((sum, entry) => sum + entry.value.length, 0);
  const characterLimit = Math.max(1, Number(maxTotalCharacters) || DEFAULT_MAX_TOTAL_CHARACTERS);
  if (totalCharacters > characterLimit) {
    throw seatEmailError(`Seat email list must not exceed ${characterLimit} characters`, {
      code: 'seat_email_payload_too_large',
      maxTotalCharacters: characterLimit,
      actual: totalCharacters
    });
  }

  const invalidLines = entries
    .filter((entry) => !validSeatEmail(entry.value))
    .map((entry) => entry.line);
  if (invalidLines.length) {
    throw seatEmailError(`Invalid seat email on line(s): ${invalidLines.join(', ')}`, {
      code: 'seat_email_invalid',
      invalidLines
    });
  }

  const seen = new Set();
  const emails = [];
  const duplicateLines = [];
  for (const entry of entries) {
    const key = entry.value.toLowerCase();
    if (seen.has(key)) {
      duplicateLines.push(entry.line);
      continue;
    }
    seen.add(key);
    emails.push(entry.value);
  }

  if (duplicateLines.length) {
    throw seatEmailError(`Duplicate seat email on line(s): ${duplicateLines.join(', ')}`, {
      code: 'seat_email_duplicate',
      duplicateLines
    });
  }

  const limit = Math.max(1, Number(maxQuantity) || 1);
  if (emails.length > limit) {
    throw seatEmailError(`Seat email count must not exceed ${limit}`, {
      code: 'seat_email_limit',
      maxQuantity: limit,
      actual: emails.length
    });
  }

  return emails;
}

export function seatOrderEmails(input, options = {}) {
  return parseSeatEmailLines(input, options);
}
