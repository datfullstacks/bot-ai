import { usePostgresRowMode } from './storageMode.js';
import * as jsonShopStore from './shopStores/jsonShopStore.js';
import * as postgresShopStore from './shopStores/postgresShopStore.js';

function activeShopStore() {
  return usePostgresRowMode() ? postgresShopStore : jsonShopStore;
}

export const publicOrder = jsonShopStore.publicOrder;

export const listProducts = (...args) => activeShopStore().listProducts(...args);
export const getDashboardSummary = (...args) => activeShopStore().getDashboardSummary(...args);
export const upsertTelegramUser = (...args) => activeShopStore().upsertTelegramUser(...args);
export const createProduct = (...args) => activeShopStore().createProduct(...args);
export const updateProduct = (...args) => activeShopStore().updateProduct(...args);
export const importInventory = (...args) => activeShopStore().importInventory(...args);
export const listInventory = (...args) => activeShopStore().listInventory(...args);
export const createOrderForUser = (...args) => activeShopStore().createOrderForUser(...args);
export const listOrdersForUser = (...args) => activeShopStore().listOrdersForUser(...args);
export const getOrderCheckoutForUser = (...args) => activeShopStore().getOrderCheckoutForUser(...args);
export const cancelOrderForUser = (...args) => activeShopStore().cancelOrderForUser(...args);
export const listOrders = (...args) => activeShopStore().listOrders(...args);
export const listPayments = (...args) => activeShopStore().listPayments(...args);
export const getPublicPaymentStatus = (...args) => activeShopStore().getPublicPaymentStatus(...args);
export const listAuditLogs = (...args) => activeShopStore().listAuditLogs(...args);
export const recordAudit = (...args) => activeShopStore().recordAudit(...args);
export const applyPaymentEvent = (...args) => activeShopStore().applyPaymentEvent(...args);
export const markOrderPaidManually = (...args) => activeShopStore().markOrderPaidManually(...args);
export const cancelOrder = (...args) => activeShopStore().cancelOrder(...args);
export const approveReviewDelivery = (...args) => activeShopStore().approveReviewDelivery(...args);
export const completeSeatFulfillment = (...args) => activeShopStore().completeSeatFulfillment(...args);
export const markOrderRefunded = (...args) => activeShopStore().markOrderRefunded(...args);
export const getDeliveryForOrder = (...args) => activeShopStore().getDeliveryForOrder(...args);
export const expireOrders = (...args) => activeShopStore().expireOrders(...args);
