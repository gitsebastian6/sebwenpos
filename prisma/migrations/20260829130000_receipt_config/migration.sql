-- AlterTable: configuración de tirilla / recibo térmico + resolución DIAN del documento equivalente POS
ALTER TABLE "stores"
    ADD COLUMN "receipt_paper_width" TEXT NOT NULL DEFAULT '80',
    ADD COLUMN "receipt_doc_denomination" TEXT,
    ADD COLUMN "receipt_footer_text" TEXT,
    ADD COLUMN "receipt_extra_legend" TEXT,
    ADD COLUMN "is_iva_withholding_agent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "is_self_withholding_agent" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "is_inc_responsible" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "pos_resolution_number" TEXT,
    ADD COLUMN "pos_resolution_prefix" TEXT,
    ADD COLUMN "pos_resolution_from" INTEGER,
    ADD COLUMN "pos_resolution_to" INTEGER,
    ADD COLUMN "pos_resolution_date" TIMESTAMP(3),
    ADD COLUMN "pos_resolution_end_date" TIMESTAMP(3);
