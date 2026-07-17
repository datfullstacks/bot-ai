import { DEFAULT_CATALOG_PRODUCTS } from '../src/catalog.js';
import { createProduct, listProducts, updateProduct } from '../src/shop.js';

const actorId = 'catalog-seed';
const knownTestSku = (sku) => sku === 'demo-account' || String(sku || '').startsWith('smoke-');

const existingProducts = await listProducts({ includeInactive: true });
const bySku = new Map(existingProducts.map((product) => [product.sku, product]));

let created = 0;
let updated = 0;
let disabledTestProducts = 0;

for (const product of existingProducts) {
  if (knownTestSku(product.sku) && product.active !== false) {
    await updateProduct(actorId, product.id, { active: false });
    disabledTestProducts += 1;
  }
}

for (const product of DEFAULT_CATALOG_PRODUCTS) {
  const existing = bySku.get(product.sku);
  if (existing) {
    await updateProduct(actorId, existing.id, {
      name: product.name,
      description: product.description,
      category: product.category,
      brand: product.brand,
      packageType: product.packageType,
      price: product.price,
      currency: product.currency,
      sortOrder: product.sortOrder,
      hot: product.hot,
      officialPriceNote: product.officialPriceNote,
      accountType: product.accountType,
      warrantyPolicy: product.warrantyPolicy,
      replacementPolicy: product.replacementPolicy,
      fulfillmentMode: product.fulfillmentMode,
      deliveryMode: product.deliveryMode,
      active: true
    });
    updated += 1;
  } else {
    await createProduct(actorId, product);
    created += 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  created,
  updated,
  disabledTestProducts,
  catalogProducts: DEFAULT_CATALOG_PRODUCTS.length
}, null, 2));
