const codePattern = /^[A-Z0-9][A-Z0-9_-]{3,31}$/;

function discountError(message, code, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}

export function normalizeDiscountCode(value, { strict = false } = {}) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) {
    if (strict) throw discountError('Discount code is required', 'discount_code_required');
    return '';
  }
  if (!codePattern.test(code)) {
    throw discountError(
      'Discount code must be 4-32 characters using A-Z, 0-9, hyphen or underscore',
      'discount_code_invalid'
    );
  }
  return code;
}

function optionalExpiry(value) {
  if (!value) return null;
  const timestamp = Number(new Date(value));
  if (!Number.isFinite(timestamp)) {
    throw discountError('Discount expiry is invalid', 'discount_expiry_invalid');
  }
  if (timestamp <= Date.now()) {
    throw discountError('Discount expiry must be in the future', 'discount_expiry_invalid');
  }
  return new Date(timestamp).toISOString();
}

export function normalizeDiscountInput(input = {}) {
  const type = String(input.type || '').trim().toLowerCase();
  if (!['fixed', 'percent'].includes(type)) {
    throw discountError('Discount type must be fixed or percent', 'discount_type_invalid');
  }
  const value = Number(input.value);
  if (!Number.isFinite(value) || value <= 0 || (type === 'percent' && value > 99)) {
    throw discountError(
      type === 'percent' ? 'Percent discount must be between 1 and 99' : 'Fixed discount must be positive',
      'discount_value_invalid'
    );
  }
  const minOrderTotal = Number(input.minOrderTotal || 0);
  if (!Number.isFinite(minOrderTotal) || minOrderTotal < 0) {
    throw discountError('Minimum order total cannot be negative', 'discount_minimum_invalid');
  }
  return {
    code: normalizeDiscountCode(input.code, { strict: true }),
    type,
    value: Math.round(value),
    minOrderTotal: Math.round(minOrderTotal),
    expiresAt: optionalExpiry(input.expiresAt),
    active: input.active !== false
  };
}

export function discountReservationIsLive(discount, now = Date.now()) {
  return Boolean(
    discount?.reservedByOrderId
    && Number(new Date(discount.reservedUntil)) > Number(now)
  );
}

export function clearExpiredDiscountReservation(discount, now = Date.now()) {
  if (!discount?.reservedByOrderId || discountReservationIsLive(discount, now)) return false;
  discount.reservedByOrderId = null;
  discount.reservedByUserId = null;
  discount.reservedAt = null;
  discount.reservedUntil = null;
  return true;
}

export function calculateDiscount(discount, subtotal, { now = Date.now() } = {}) {
  const amountBeforeDiscount = Math.round(Number(subtotal));
  if (!Number.isFinite(amountBeforeDiscount) || amountBeforeDiscount <= 0) {
    throw discountError('Order subtotal must be positive', 'discount_subtotal_invalid');
  }
  if (!discount || discount.active === false) {
    throw discountError('Discount code is not active', 'discount_not_active', 409);
  }
  if (discount.usedAt || discount.usedByOrderId) {
    throw discountError('Discount code has already been used', 'discount_already_used', 409);
  }
  if (discount.expiresAt && Number(new Date(discount.expiresAt)) <= Number(now)) {
    throw discountError('Discount code has expired', 'discount_expired', 409);
  }
  if (amountBeforeDiscount < Number(discount.minOrderTotal || 0)) {
    throw discountError('Order total does not meet the discount minimum', 'discount_minimum_not_met', 409);
  }

  const amount = discount.type === 'percent'
    ? Math.floor(amountBeforeDiscount * Number(discount.value) / 100)
    : Math.round(Number(discount.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= amountBeforeDiscount) {
    throw discountError('Discount must be lower than the order subtotal', 'discount_exceeds_subtotal', 409);
  }
  return {
    code: discount.code,
    type: discount.type,
    value: Number(discount.value),
    amount,
    subtotal: amountBeforeDiscount,
    total: amountBeforeDiscount - amount
  };
}

export function publicDiscountCode(discount = {}) {
  return {
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: Number(discount.value || 0),
    minOrderTotal: Number(discount.minOrderTotal || 0),
    active: discount.active !== false,
    usageLimit: 1,
    expiresAt: discount.expiresAt || null,
    reservedByOrderId: discount.reservedByOrderId || null,
    reservedUntil: discount.reservedUntil || null,
    usedByOrderId: discount.usedByOrderId || null,
    usedAt: discount.usedAt || null,
    createdAt: discount.createdAt,
    updatedAt: discount.updatedAt
  };
}
