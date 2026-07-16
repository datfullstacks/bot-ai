CREATE TABLE IF NOT EXISTS app_documents (
  collection text NOT NULL,
  id text NOT NULL,
  doc jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection, id)
);

CREATE TABLE IF NOT EXISTS app_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_documents_collection
  ON app_documents (collection);

CREATE INDEX IF NOT EXISTS idx_app_documents_doc_status
  ON app_documents ((doc->>'status'));

CREATE INDEX IF NOT EXISTS idx_app_documents_doc_order_id
  ON app_documents ((doc->>'orderId'));

CREATE INDEX IF NOT EXISTS idx_app_documents_doc_product_id
  ON app_documents ((doc->>'productId'));

CREATE INDEX IF NOT EXISTS idx_app_documents_collection_status
  ON app_documents (collection, (doc->>'status'));

CREATE INDEX IF NOT EXISTS idx_app_documents_collection_product_status
  ON app_documents (collection, (doc->>'productId'), (doc->>'status'));

CREATE INDEX IF NOT EXISTS idx_app_documents_collection_order_status
  ON app_documents (collection, (doc->>'orderId'), (doc->>'status'));

CREATE INDEX IF NOT EXISTS idx_app_documents_collection_user_status
  ON app_documents (collection, (doc->>'userId'), (doc->>'status'));

CREATE INDEX IF NOT EXISTS idx_app_documents_products_sku
  ON app_documents (collection, (doc->>'sku'));

CREATE INDEX IF NOT EXISTS idx_app_documents_collection_created_at
  ON app_documents (collection, (doc->>'createdAt'));
