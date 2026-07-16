export function publicPaymentCheckout(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    reference: payment.reference,
    amount: payment.amount,
    currency: payment.currency,
    paymentUrl: payment.paymentUrl,
    qrImageUrl: payment.qrImageUrl || '',
    memo: payment.memo || payment.reference || '',
    bankCode: payment.bankCode || '',
    accountNumber: payment.accountNumber || '',
    expiresAt: payment.expiresAt || '',
    status: payment.status
  };
}
