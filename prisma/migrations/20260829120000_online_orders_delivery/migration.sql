-- AlterTable: delivery config on stores
ALTER TABLE "stores"
    ADD COLUMN "delivery_enabled" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "delivery_fee" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "delivery_free_above" INTEGER,
    ADD COLUMN "delivery_min_order" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "accepting_orders" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: delivery context on orders
ALTER TABLE "orders"
    ADD COLUMN "fulfillment_type" TEXT NOT NULL DEFAULT 'IN_STORE',
    ADD COLUMN "delivery_fee" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "delivery_address" TEXT,
    ADD COLUMN "placed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "online_orders" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "order_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_phone_normalized" TEXT NOT NULL,
    "fulfillment_type" TEXT NOT NULL,
    "delivery_address" TEXT,
    "delivery_notes" TEXT,
    "subtotal" INTEGER NOT NULL,
    "delivery_fee" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL,
    "fee_config_snapshot" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "rejection_reason" TEXT,
    "converted_to_order_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "online_order_items" (
    "id" SERIAL NOT NULL,
    "online_order_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "presentation_id" INTEGER,
    "product_name" TEXT NOT NULL,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_row" INTEGER NOT NULL,

    CONSTRAINT "online_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_orders_converted_to_order_id_key" ON "online_orders"("converted_to_order_id");

-- CreateIndex
CREATE INDEX "online_orders_store_id_status_idx" ON "online_orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "online_orders_store_id_created_at_idx" ON "online_orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "online_orders_store_id_dedupe_key_idx" ON "online_orders"("store_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "online_order_items_online_order_id_idx" ON "online_order_items"("online_order_id");

-- CreateIndex
CREATE INDEX "online_order_items_product_id_idx" ON "online_order_items"("product_id");

-- CreateIndex
CREATE INDEX "online_order_items_presentation_id_idx" ON "online_order_items"("presentation_id");

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_orders" ADD CONSTRAINT "online_orders_converted_to_order_id_fkey" FOREIGN KEY ("converted_to_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_online_order_id_fkey" FOREIGN KEY ("online_order_id") REFERENCES "online_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_items" ADD CONSTRAINT "online_order_items_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
