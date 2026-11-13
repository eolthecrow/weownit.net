// No addresses, message bodies or raw provider exceptions belong in diagnostics.
export function contactConfiguration(env) {
  const valid = value => typeof value === 'string' && value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  const from = typeof env.CONTACT_FROM_EMAIL === 'string' ? env.CONTACT_FROM_EMAIL.trim() : '';
  const to = typeof env.CONTACT_TO_EMAIL === 'string' ? env.CONTACT_TO_EMAIL.trim() : '';
  const missing = [];
  if (typeof env.EMAIL?.send !== 'function') missing.push('EMAIL');
  if (!valid(from)) missing.push('CONTACT_FROM_EMAIL');
  if (!valid(to)) missing.push('CONTACT_TO_EMAIL');
  return { configured: missing.length === 0, missing, from, to };
}

const providerCodes = new Set([
  'E_VALIDATION_ERROR', 'E_FIELD_MISSING', 'E_SENDER_NOT_VERIFIED',
  'E_RECIPIENT_NOT_ALLOWED', 'E_RECIPIENT_SUPPRESSED', 'E_ACCOUNT_SUSPENDED',
  'E_SENDER_DOMAIN_NOT_AVAILABLE', 'E_CONTENT_TOO_LARGE', 'E_DELIVERY_FAILED',
  'E_RATE_LIMIT_EXCEEDED', 'E_DAILY_LIMIT_EXCEEDED', 'E_INTERNAL_SERVER_ERROR',
  'E_HEADER_NOT_ALLOWED', 'E_HEADER_USE_API_FIELD', 'E_HEADER_VALUE_INVALID',
  'E_HEADER_VALUE_TOO_LONG', 'E_HEADER_NAME_INVALID', 'E_HEADERS_TOO_LARGE',
  'E_HEADERS_TOO_MANY', 'E_TOO_MANY_RECIPIENTS', 'E_TOO_MANY_ATTACHMENTS',
]);

export function deliveryFailure(error) {
  const providerCode = providerCodes.has(error?.code) ? error.code : 'UNKNOWN';
  if (providerCode === 'E_RATE_LIMIT_EXCEEDED') {
    return { providerCode, code: 'CONTACT_RATE_LIMITED', status: 429, retryAfter: 60 };
  }
  // Unrecognized exceptions / missing acknowledgements may occur after acceptance.
  // Do not automatically retry or tell the visitor that no message was sent.
  return { providerCode, code: providerCode === 'UNKNOWN' ? 'CONTACT_DELIVERY_UNKNOWN' : 'CONTACT_UNAVAILABLE', status: 503 };
}
