-- CreateTable
CREATE TABLE "store_event_logs" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_event_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "cedula" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "security_question" TEXT,
    "security_answer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revoked_tokens" (
    "id" SERIAL NOT NULL,
    "token_jti" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'LOGOUT',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" INTEGER,
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "legal_name" TEXT,
    "nit" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "currency_code" TEXT NOT NULL DEFAULT 'COP',
    "country_code" TEXT,
    "debt_overdue_days" INTEGER NOT NULL DEFAULT 30,
    "invoice_prefix" TEXT,
    "resolution_number" TEXT,
    "resolution_start_date" TIMESTAMP(3),
    "resolution_end_date" TIMESTAMP(3),
    "resolution_start_number" INTEGER,
    "resolution_end_number" INTEGER,
    "invoice_test_mode" BOOLEAN NOT NULL DEFAULT true,
    "invoice_provider" TEXT NOT NULL DEFAULT 'NONE',
    "invoice_enabled" BOOLEAN NOT NULL DEFAULT false,
    "certificate_uploaded" BOOLEAN NOT NULL DEFAULT false,
    "certificate_password" TEXT,
    "software_id" TEXT,
    "software_pin" TEXT,
    "provider_config" TEXT NOT NULL DEFAULT '{}',
    "divipola_code" TEXT,
    "city_name" TEXT,
    "tax_regime" TEXT,
    "fiscal_responsibilities" TEXT,
    "cert_uploaded_at" TIMESTAMP(3),
    "cert_expires_at" TIMESTAMP(3),
    "cert_subject" TEXT,
    "connection_mode" TEXT NOT NULL DEFAULT 'OFFLINE',
    "pte_nit" TEXT,
    "pte_api_url" TEXT,
    "pte_api_key" TEXT,
    "electronic_invoicing_enabled" BOOLEAN NOT NULL DEFAULT false,
    "parent_store_id" INTEGER,
    "store_slug" TEXT,
    "store_description" TEXT,
    "store_whatsapp" TEXT,
    "store_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "max_stores" INTEGER NOT NULL DEFAULT 1,
    "max_employees" INTEGER NOT NULL DEFAULT 5,
    "max_products" INTEGER NOT NULL DEFAULT 100,
    "features" TEXT NOT NULL DEFAULT '{}',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "trial_end_date" TIMESTAMP(3),
    "grace_end_date" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "billing_period" TEXT NOT NULL DEFAULT 'MONTHLY',
    "billingPrice" INTEGER NOT NULL,
    "last_billed_at" TIMESTAMP(3),
    "next_billing_at" TIMESTAMP(3),
    "proration_credit" INTEGER NOT NULL DEFAULT 0,
    "previous_plan_id" INTEGER,
    "previous_plan_name" TEXT,
    "prorated_days_remaining" INTEGER NOT NULL DEFAULT 0,
    "alert_sent_at_3d" TIMESTAMP(3),
    "alert_sent_at_1d" TIMESTAMP(3),
    "grace_alert_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_history" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" TEXT,
    "new_status" TEXT,
    "previous_plan_id" INTEGER,
    "new_plan_id" INTEGER,
    "previous_plan_name" TEXT,
    "new_plan_name" TEXT,
    "description" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_records" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "store_id" INTEGER NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "receipt_id" INTEGER,
    "plan_id" INTEGER NOT NULL,
    "plan_name" TEXT NOT NULL,
    "billing_period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "proration_credit" INTEGER NOT NULL DEFAULT 0,
    "net_amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "payment_method" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "owner_full_name" TEXT NOT NULL,
    "owner_cedula" TEXT NOT NULL,
    "owner_email" TEXT,
    "owner_phone" TEXT,
    "owner_password" TEXT,
    "store_name" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "business_type" TEXT NOT NULL DEFAULT 'NATURAL',
    "store_phone" TEXT,
    "department" TEXT,
    "city_name" TEXT,
    "address" TEXT,
    "has_camara_comercio" BOOLEAN NOT NULL DEFAULT false,
    "registration_number" TEXT,
    "tax_regime" TEXT,
    "fiscal_responsibilities" TEXT,
    "resolution_prefix" TEXT,
    "resolution_number" TEXT,
    "resolution_start_date" TIMESTAMP(3),
    "resolution_end_date" TIMESTAMP(3),
    "resolution_start_number" INTEGER,
    "resolution_end_number" INTEGER,
    "rut_file_path" TEXT,
    "rut_file_name" TEXT,
    "rut_file_size" INTEGER,
    "rut_file_type" TEXT,
    "camara_file_path" TEXT,
    "camara_file_name" TEXT,
    "camara_file_size" INTEGER,
    "camara_file_type" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'LEAD',
    "assigned_to_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "source" TEXT NOT NULL DEFAULT 'WEB',
    "notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "converted_store_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_contacts" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "full_name" TEXT NOT NULL,
    "cedula" TEXT,
    "role" TEXT NOT NULL DEFAULT 'OTRO',
    "email" TEXT,
    "phone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_documents" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "document_type" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejection_reason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by" INTEGER,
    "reviewed_at" TIMESTAMP(3),

    CONSTRAINT "lead_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" SERIAL NOT NULL,
    "subscription_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_data" TEXT,
    "file_path" TEXT,
    "amount" INTEGER NOT NULL,
    "reference" TEXT,
    "payment_method" TEXT NOT NULL DEFAULT 'OTHER',
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "review_notes" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "rate_type" TEXT NOT NULL,
    "rate" INTEGER NOT NULL,
    "applyTo" TEXT NOT NULL DEFAULT 'PRODUCT',
    "category" TEXT NOT NULL DEFAULT 'SALES_TAX',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "order_id" INTEGER NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'FE',
    "consecutive" INTEGER NOT NULL,
    "resolution_number" TEXT,
    "resolution_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "start_number" INTEGER,
    "end_number" INTEGER,
    "customer_nit" TEXT,
    "customer_name" TEXT,
    "customer_address" TEXT,
    "customer_phone" TEXT,
    "customer_email" TEXT,
    "customer_regime" TEXT,
    "customer_type" TEXT,
    "subtotal_base" INTEGER NOT NULL,
    "tax_exempt_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "total_tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total_with_tax" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "tip_amount" INTEGER NOT NULL DEFAULT 0,
    "grand_total" INTEGER NOT NULL,
    "payment_method" TEXT,
    "payment_notes" TEXT,
    "cufe" TEXT,
    "qr_code" TEXT,
    "xml_content" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dian_response" TEXT,
    "dian_error_code" TEXT,
    "sent_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_notes" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "prefix" TEXT NOT NULL DEFAULT 'NC',
    "consecutive" INTEGER NOT NULL,
    "resolution_number" TEXT,
    "resolution_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "start_number" INTEGER,
    "end_number" INTEGER,
    "noteType" TEXT NOT NULL DEFAULT 'CREDIT',
    "concept" TEXT NOT NULL,
    "description" TEXT,
    "reason" TEXT,
    "return_code" TEXT NOT NULL DEFAULT '01',
    "supplier_nit" TEXT,
    "supplier_name" TEXT,
    "supplier_address" TEXT,
    "supplier_phone" TEXT,
    "supplier_email" TEXT,
    "customer_nit" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "customer_address" TEXT,
    "customer_regime" TEXT,
    "customer_type" TEXT,
    "subtotal_base" INTEGER NOT NULL DEFAULT 0,
    "tax_exempt_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "total_tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total_with_tax" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "grand_total" INTEGER NOT NULL,
    "cufe" TEXT,
    "qr_code" TEXT,
    "xml_content" TEXT,
    "referenced_invoice_id" TEXT,
    "referenced_prefix" TEXT,
    "referenced_consec" INTEGER,
    "items" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dian_response" TEXT,
    "sent_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debit_notes" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "prefix" TEXT NOT NULL DEFAULT 'ND',
    "consecutive" INTEGER NOT NULL,
    "resolution_number" TEXT,
    "resolution_date" TIMESTAMP(3),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "start_number" INTEGER,
    "end_number" INTEGER,
    "supplier_nit" TEXT,
    "supplier_name" TEXT,
    "supplier_address" TEXT,
    "supplier_phone" TEXT,
    "supplier_email" TEXT,
    "customer_nit" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "customer_address" TEXT,
    "customer_regime" TEXT,
    "customer_type" TEXT,
    "subtotal_base" INTEGER NOT NULL DEFAULT 0,
    "tax_exempt_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "total_tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total_with_tax" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "grand_total" INTEGER NOT NULL,
    "reason" TEXT,
    "debit_code" TEXT NOT NULL DEFAULT '01',
    "cufe" TEXT,
    "qr_code" TEXT,
    "xml_content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dian_response" TEXT,
    "sent_at" TIMESTAMP(3),
    "validated_at" TIMESTAMP(3),
    "emailed_at" TIMESTAMP(3),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contingency_invoices" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "invoice_id" INTEGER,
    "prefix" TEXT NOT NULL DEFAULT 'FC',
    "consecutive" INTEGER NOT NULL,
    "contingencyType" TEXT NOT NULL DEFAULT '04',
    "reason" TEXT,
    "customer_nit" TEXT,
    "customer_name" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "customer_address" TEXT,
    "customer_regime" TEXT,
    "customer_type" TEXT,
    "subtotal_base" INTEGER NOT NULL DEFAULT 0,
    "tax_exempt_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "total_tax_amount" INTEGER NOT NULL DEFAULT 0,
    "total_with_tax" INTEGER NOT NULL,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "grand_total" INTEGER NOT NULL,
    "original_cufe" TEXT,
    "original_cufe_qr" TEXT,
    "contingency_cufe" TEXT,
    "xml_content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dian_response" TEXT,
    "contingency_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contingency_end" TIMESTAMP(3),
    "retransmitted_at" TIMESTAMP(3),
    "test_mode" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contingency_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "provider_id" INTEGER,
    "tax_rate_id" INTEGER,
    "sku" TEXT,
    "barcode" TEXT,
    "name" TEXT NOT NULL,
    "unit_label" TEXT NOT NULL DEFAULT 'UND',
    "description" TEXT,
    "img_url" TEXT,
    "invima" TEXT,
    "cost_price" INTEGER NOT NULL DEFAULT 0,
    "salePrice" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL DEFAULT 0,
    "current_stock" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(65,30) NOT NULL DEFAULT 5,
    "track_inventory" BOOLEAN NOT NULL DEFAULT true,
    "track_expiration" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_presentations" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit_label" TEXT NOT NULL DEFAULT 'UND',
    "barcode" TEXT,
    "sku" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL,
    "sale_price" INTEGER NOT NULL,
    "cost_price" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_presentations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "presentation_id" INTEGER,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantity" DECIMAL(65,30) NOT NULL,
    "movement_type" TEXT NOT NULL,
    "reference_id" INTEGER,
    "batch_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "lot_number" TEXT NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "manufacturing_date" TIMESTAMP(3),
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit_cost" INTEGER NOT NULL DEFAULT 0,
    "purchase_item_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "provider_id" INTEGER,
    "invoice_number" TEXT,
    "document_type" TEXT NOT NULL DEFAULT 'FACTURA_COMPRA',
    "consecutive_number" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_date" TIMESTAMP(3),
    "payment_terms" TEXT NOT NULL DEFAULT 'CONTADO',
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount_paid" INTEGER NOT NULL DEFAULT 0,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "total_iva" INTEGER NOT NULL DEFAULT 0,
    "total_rete_fuente" INTEGER NOT NULL DEFAULT 0,
    "total_rete_ica" INTEGER NOT NULL DEFAULT 0,
    "total_rete_iva" INTEGER NOT NULL DEFAULT 0,
    "total_discount" INTEGER NOT NULL DEFAULT 0,
    "total_consumption_tax" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "presentation_id" INTEGER,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantity" DECIMAL(65,30) NOT NULL,
    "returned_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit_cost" INTEGER NOT NULL,
    "iva_rate" INTEGER NOT NULL DEFAULT 0,
    "iva_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "lot_number" TEXT,
    "expiry_date" TIMESTAMP(3),
    "manufacturing_date" TIMESTAMP(3),
    "is_bonus" BOOLEAN NOT NULL DEFAULT false,
    "total" INTEGER NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "city" TEXT,
    "nit" TEXT,
    "dv" TEXT,
    "regime" TEXT NOT NULL DEFAULT 'NO_RESPONSABLE',
    "autoretainer" BOOLEAN NOT NULL DEFAULT false,
    "payment_terms" TEXT NOT NULL DEFAULT 'CONTADO',
    "lead_time_days" INTEGER NOT NULL DEFAULT 7,
    "credit_limit" INTEGER NOT NULL DEFAULT 0,
    "total_debt" INTEGER NOT NULL DEFAULT 0,
    "total_purchases" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_product_mappings" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "provider_id" INTEGER NOT NULL,
    "seller_sku" TEXT NOT NULL,
    "product_id" INTEGER NOT NULL,
    "presentation_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_product_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_payments" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "created_by_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_histories" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "store_id" INTEGER NOT NULL,
    "previous_cost" INTEGER NOT NULL,
    "new_cost" INTEGER NOT NULL,
    "purchase_id" INTEGER,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "nit" TEXT,
    "document_type" TEXT,
    "address" TEXT,
    "regime" TEXT,
    "total_debt" INTEGER NOT NULL DEFAULT 0,
    "debt_since" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "table_session_id" INTEGER,
    "cash_register_id" INTEGER,
    "sold_by_employee_id" INTEGER,
    "order_number" TEXT NOT NULL,
    "subtotal" INTEGER NOT NULL,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "tip_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_type" TEXT NOT NULL DEFAULT 'NONE',
    "discount_reason" TEXT,
    "total" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "payment_splits" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "service_id" INTEGER,
    "presentation_id" INTEGER,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantity" DECIMAL(65,30) NOT NULL,
    "returned_quantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "unit_price" INTEGER NOT NULL,
    "total_row" INTEGER NOT NULL,
    "tax_code" TEXT,
    "tax_rate" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_base" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bar_tables" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "zone" TEXT NOT NULL DEFAULT 'PRINCIPAL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bar_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "bar_table_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comanda_items" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "table_session_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "service_id" INTEGER,
    "presentation_id" INTEGER,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "product_name" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comanda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "ledger_account_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT,
    "reference_type" TEXT,
    "reference_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT NOT NULL DEFAULT 'Star',
    "unit" TEXT NOT NULL DEFAULT 'servicio',
    "commission_rate" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_transactions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "service_id" INTEGER NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "unit_price" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_balance" INTEGER NOT NULL DEFAULT 0,
    "closing_balance" INTEGER,
    "expected_cash" INTEGER,
    "difference" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "count_breakdown" TEXT,
    "notes" TEXT,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "cash_register_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payments" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "payment_method" TEXT NOT NULL DEFAULT 'CASH',
    "cash_register_id" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role_id" INTEGER,
    "position" TEXT,
    "permissions" TEXT NOT NULL DEFAULT '{}',
    "commission_rate" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotations" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "quotation_number" TEXT NOT NULL,
    "customer_name" TEXT,
    "customer_nit" TEXT,
    "customer_email" TEXT,
    "customer_phone" TEXT,
    "customer_address" TEXT,
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_breakdown" TEXT,
    "discount_amount" INTEGER NOT NULL DEFAULT 0,
    "discount_type" TEXT NOT NULL DEFAULT 'NONE',
    "total" INTEGER NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "converted_to_order_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotation_items" (
    "id" SERIAL NOT NULL,
    "quotation_id" INTEGER NOT NULL,
    "product_id" INTEGER,
    "product_name" TEXT NOT NULL,
    "presentation_id" INTEGER,
    "presentation_name" TEXT,
    "units_per_pack" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unit_price" INTEGER NOT NULL,
    "total_row" INTEGER NOT NULL,
    "tax_code" TEXT,
    "tax_rate" INTEGER NOT NULL DEFAULT 0,
    "tax_amount" INTEGER NOT NULL DEFAULT 0,
    "tax_base" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "quotation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wompi_transactions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "subscription_id" INTEGER,
    "order_id" INTEGER,
    "receipt_id" INTEGER,
    "wompi_id" TEXT,
    "wompi_payment_link_id" TEXT,
    "reference" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "amount_in_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "payment_method" TEXT,
    "payment_method_type" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "wompi_status" TEXT,
    "customer_email" TEXT,
    "customer_name" TEXT,
    "customer_phone" TEXT,
    "customer_document" TEXT,
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "wompi_response" TEXT,
    "paid_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wompi_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "store_id" INTEGER,
    "title" TEXT,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" SERIAL NOT NULL,
    "session_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "model" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_counters" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "last_consecutive" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_requests" (
    "id" SERIAL NOT NULL,
    "store_id" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "order_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_events" (
    "id" SERIAL NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" INTEGER,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_event_logs_store_id_event_type_idx" ON "store_event_logs"("store_id", "event_type");

-- CreateIndex
CREATE INDEX "store_event_logs_event_type_created_at_idx" ON "store_event_logs"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "store_event_logs_created_at_idx" ON "store_event_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_cedula_key" ON "users"("cedula");

-- CreateIndex
CREATE UNIQUE INDEX "revoked_tokens_token_jti_key" ON "revoked_tokens"("token_jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_token_jti_idx" ON "revoked_tokens"("token_jti");

-- CreateIndex
CREATE INDEX "revoked_tokens_expires_at_idx" ON "revoked_tokens"("expires_at");

-- CreateIndex
CREATE INDEX "revoked_tokens_user_id_idx" ON "revoked_tokens"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_entity_created_at_idx" ON "audit_logs"("store_id", "entity", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_store_id_action_created_at_idx" ON "audit_logs"("store_id", "action", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "otp_tokens_user_id_idx" ON "otp_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_user_id_key" ON "stores"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "stores_store_slug_key" ON "stores"("store_slug");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_store_id_key" ON "subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscription_history_store_id_idx" ON "subscription_history"("store_id");

-- CreateIndex
CREATE INDEX "subscription_history_subscription_id_idx" ON "subscription_history"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_history_event_type_idx" ON "subscription_history"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_invoice_number_key" ON "billing_records"("invoice_number");

-- CreateIndex
CREATE INDEX "billing_records_store_id_idx" ON "billing_records"("store_id");

-- CreateIndex
CREATE INDEX "billing_records_subscription_id_idx" ON "billing_records"("subscription_id");

-- CreateIndex
CREATE INDEX "billing_records_receipt_id_idx" ON "billing_records"("receipt_id");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_assigned_to_id_idx" ON "leads"("assigned_to_id");

-- CreateIndex
CREATE INDEX "leads_owner_cedula_idx" ON "leads"("owner_cedula");

-- CreateIndex
CREATE INDEX "leads_nit_idx" ON "leads"("nit");

-- CreateIndex
CREATE INDEX "lead_contacts_lead_id_idx" ON "lead_contacts"("lead_id");

-- CreateIndex
CREATE INDEX "lead_documents_lead_id_idx" ON "lead_documents"("lead_id");

-- CreateIndex
CREATE INDEX "lead_documents_lead_id_document_type_idx" ON "lead_documents"("lead_id", "document_type");

-- CreateIndex
CREATE INDEX "lead_activities_lead_id_created_at_idx" ON "lead_activities"("lead_id", "created_at");

-- CreateIndex
CREATE INDEX "payment_receipts_subscription_id_idx" ON "payment_receipts"("subscription_id");

-- CreateIndex
CREATE INDEX "payment_receipts_store_id_status_idx" ON "payment_receipts"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tax_rates_store_id_code_key" ON "tax_rates"("store_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_order_id_key" ON "invoices"("order_id");

-- CreateIndex
CREATE INDEX "invoices_store_id_created_at_idx" ON "invoices"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "invoices_store_id_status_idx" ON "invoices"("store_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_store_id_prefix_consecutive_key" ON "invoices"("store_id", "prefix", "consecutive");

-- CreateIndex
CREATE INDEX "credit_notes_store_id_idx" ON "credit_notes"("store_id");

-- CreateIndex
CREATE INDEX "credit_notes_invoice_id_idx" ON "credit_notes"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_store_id_prefix_consecutive_key" ON "credit_notes"("store_id", "prefix", "consecutive");

-- CreateIndex
CREATE INDEX "debit_notes_store_id_idx" ON "debit_notes"("store_id");

-- CreateIndex
CREATE INDEX "debit_notes_invoice_id_idx" ON "debit_notes"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "debit_notes_store_id_prefix_consecutive_key" ON "debit_notes"("store_id", "prefix", "consecutive");

-- CreateIndex
CREATE INDEX "contingency_invoices_store_id_idx" ON "contingency_invoices"("store_id");

-- CreateIndex
CREATE INDEX "contingency_invoices_invoice_id_idx" ON "contingency_invoices"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "contingency_invoices_store_id_prefix_consecutive_key" ON "contingency_invoices"("store_id", "prefix", "consecutive");

-- CreateIndex
CREATE UNIQUE INDEX "categories_store_id_name_key" ON "categories"("store_id", "name");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "products_provider_id_idx" ON "products"("provider_id");

-- CreateIndex
CREATE INDEX "products_tax_rate_id_idx" ON "products"("tax_rate_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_store_id_name_key" ON "products"("store_id", "name");

-- CreateIndex
CREATE INDEX "product_presentations_product_id_idx" ON "product_presentations"("product_id");

-- CreateIndex
CREATE INDEX "product_presentations_barcode_idx" ON "product_presentations"("barcode");

-- CreateIndex
CREATE INDEX "inventory_movements_store_id_product_id_created_at_idx" ON "inventory_movements"("store_id", "product_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_reference_id_idx" ON "inventory_movements"("reference_id");

-- CreateIndex
CREATE INDEX "inventory_movements_presentation_id_idx" ON "inventory_movements"("presentation_id");

-- CreateIndex
CREATE INDEX "batches_store_id_product_id_status_idx" ON "batches"("store_id", "product_id", "status");

-- CreateIndex
CREATE INDEX "batches_expiry_date_idx" ON "batches"("expiry_date");

-- CreateIndex
CREATE INDEX "batches_store_id_status_expiry_date_idx" ON "batches"("store_id", "status", "expiry_date");

-- CreateIndex
CREATE UNIQUE INDEX "batches_product_id_lot_number_key" ON "batches"("product_id", "lot_number");

-- CreateIndex
CREATE INDEX "purchases_store_id_idx" ON "purchases"("store_id");

-- CreateIndex
CREATE INDEX "purchases_provider_id_idx" ON "purchases"("provider_id");

-- CreateIndex
CREATE INDEX "purchases_store_id_date_idx" ON "purchases"("store_id", "date");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE INDEX "purchase_items_presentation_id_idx" ON "purchase_items"("presentation_id");

-- CreateIndex
CREATE INDEX "providers_store_id_nit_idx" ON "providers"("store_id", "nit");

-- CreateIndex
CREATE UNIQUE INDEX "providers_store_id_name_key" ON "providers"("store_id", "name");

-- CreateIndex
CREATE INDEX "provider_product_mappings_store_id_idx" ON "provider_product_mappings"("store_id");

-- CreateIndex
CREATE INDEX "provider_product_mappings_product_id_idx" ON "provider_product_mappings"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_product_mappings_provider_id_seller_sku_key" ON "provider_product_mappings"("provider_id", "seller_sku");

-- CreateIndex
CREATE INDEX "purchase_payments_purchase_id_idx" ON "purchase_payments"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_payments_store_id_idx" ON "purchase_payments"("store_id");

-- CreateIndex
CREATE INDEX "cost_histories_product_id_created_at_idx" ON "cost_histories"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "cost_histories_store_id_idx" ON "cost_histories"("store_id");

-- CreateIndex
CREATE INDEX "customers_store_id_idx" ON "customers"("store_id");

-- CreateIndex
CREATE INDEX "orders_store_id_created_at_idx" ON "orders"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "orders_store_id_status_idx" ON "orders"("store_id", "status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "orders_table_session_id_idx" ON "orders"("table_session_id");

-- CreateIndex
CREATE INDEX "orders_cash_register_id_idx" ON "orders"("cash_register_id");

-- CreateIndex
CREATE INDEX "orders_sold_by_employee_id_idx" ON "orders"("sold_by_employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_store_id_order_number_key" ON "orders"("store_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE INDEX "order_items_service_id_idx" ON "order_items"("service_id");

-- CreateIndex
CREATE INDEX "order_items_presentation_id_idx" ON "order_items"("presentation_id");

-- CreateIndex
CREATE UNIQUE INDEX "bar_tables_store_id_number_key" ON "bar_tables"("store_id", "number");

-- CreateIndex
CREATE INDEX "table_sessions_store_id_idx" ON "table_sessions"("store_id");

-- CreateIndex
CREATE INDEX "table_sessions_bar_table_id_idx" ON "table_sessions"("bar_table_id");

-- CreateIndex
CREATE INDEX "table_sessions_customer_id_idx" ON "table_sessions"("customer_id");

-- CreateIndex
CREATE INDEX "comanda_items_store_id_idx" ON "comanda_items"("store_id");

-- CreateIndex
CREATE INDEX "comanda_items_table_session_id_idx" ON "comanda_items"("table_session_id");

-- CreateIndex
CREATE INDEX "comanda_items_product_id_idx" ON "comanda_items"("product_id");

-- CreateIndex
CREATE INDEX "comanda_items_service_id_idx" ON "comanda_items"("service_id");

-- CreateIndex
CREATE INDEX "comanda_items_presentation_id_idx" ON "comanda_items"("presentation_id");

-- CreateIndex
CREATE INDEX "ledger_accounts_store_id_idx" ON "ledger_accounts"("store_id");

-- CreateIndex
CREATE INDEX "journal_entries_store_id_ledger_account_id_idx" ON "journal_entries"("store_id", "ledger_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_store_id_name_key" ON "services"("store_id", "name");

-- CreateIndex
CREATE INDEX "service_transactions_store_id_idx" ON "service_transactions"("store_id");

-- CreateIndex
CREATE INDEX "service_transactions_service_id_idx" ON "service_transactions"("service_id");

-- CreateIndex
CREATE INDEX "cash_registers_store_id_status_idx" ON "cash_registers"("store_id", "status");

-- CreateIndex
CREATE INDEX "cash_registers_user_id_idx" ON "cash_registers"("user_id");

-- CreateIndex
CREATE INDEX "expenses_store_id_date_idx" ON "expenses"("store_id", "date");

-- CreateIndex
CREATE INDEX "expenses_cash_register_id_idx" ON "expenses"("cash_register_id");

-- CreateIndex
CREATE INDEX "customer_payments_store_id_created_at_idx" ON "customer_payments"("store_id", "created_at");

-- CreateIndex
CREATE INDEX "customer_payments_customer_id_idx" ON "customer_payments"("customer_id");

-- CreateIndex
CREATE INDEX "customer_payments_cash_register_id_idx" ON "customer_payments"("cash_register_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_store_id_name_key" ON "roles"("store_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");

-- CreateIndex
CREATE INDEX "employees_store_id_idx" ON "employees"("store_id");

-- CreateIndex
CREATE INDEX "employees_role_id_idx" ON "employees"("role_id");

-- CreateIndex
CREATE INDEX "quotations_store_id_idx" ON "quotations"("store_id");

-- CreateIndex
CREATE INDEX "quotations_customer_id_idx" ON "quotations"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotations_store_id_quotation_number_key" ON "quotations"("store_id", "quotation_number");

-- CreateIndex
CREATE INDEX "quotation_items_quotation_id_idx" ON "quotation_items"("quotation_id");

-- CreateIndex
CREATE INDEX "quotation_items_product_id_idx" ON "quotation_items"("product_id");

-- CreateIndex
CREATE INDEX "quotation_items_presentation_id_idx" ON "quotation_items"("presentation_id");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "wompi_transactions_order_id_key" ON "wompi_transactions"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "wompi_transactions_receipt_id_key" ON "wompi_transactions"("receipt_id");

-- CreateIndex
CREATE INDEX "wompi_transactions_store_id_idx" ON "wompi_transactions"("store_id");

-- CreateIndex
CREATE INDEX "wompi_transactions_subscription_id_idx" ON "wompi_transactions"("subscription_id");

-- CreateIndex
CREATE INDEX "wompi_transactions_order_id_idx" ON "wompi_transactions"("order_id");

-- CreateIndex
CREATE INDEX "wompi_transactions_wompi_id_idx" ON "wompi_transactions"("wompi_id");

-- CreateIndex
CREATE INDEX "wompi_transactions_status_idx" ON "wompi_transactions"("status");

-- CreateIndex
CREATE INDEX "wompi_transactions_created_at_idx" ON "wompi_transactions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wompi_transactions_reference_key" ON "wompi_transactions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_session_id_key" ON "chat_sessions"("session_id");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_idx" ON "chat_sessions"("user_id");

-- CreateIndex
CREATE INDEX "chat_sessions_store_id_idx" ON "chat_sessions"("store_id");

-- CreateIndex
CREATE INDEX "chat_sessions_session_id_idx" ON "chat_sessions"("session_id");

-- CreateIndex
CREATE INDEX "chat_sessions_created_at_idx" ON "chat_sessions"("created_at");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "chat_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_store_id_idx" ON "push_subscriptions"("store_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_counters_store_id_key" ON "invoice_counters"("store_id");

-- CreateIndex
CREATE INDEX "processed_requests_store_id_idempotency_key_idx" ON "processed_requests"("store_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "processed_requests_store_id_idempotency_key_key" ON "processed_requests"("store_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "processed_events_source_external_id_idx" ON "processed_events"("source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_events_source_external_id_key" ON "processed_events"("source", "external_id");

-- AddForeignKey
ALTER TABLE "store_event_logs" ADD CONSTRAINT "store_event_logs_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_tokens" ADD CONSTRAINT "otp_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_parent_store_id_fkey" FOREIGN KEY ("parent_store_id") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_previous_plan_id_fkey" FOREIGN KEY ("previous_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_history" ADD CONSTRAINT "subscription_history_new_plan_id_fkey" FOREIGN KEY ("new_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_contacts" ADD CONSTRAINT "lead_contacts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_documents" ADD CONSTRAINT "lead_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_notes" ADD CONSTRAINT "debit_notes_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingency_invoices" ADD CONSTRAINT "contingency_invoices_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contingency_invoices" ADD CONSTRAINT "contingency_invoices_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tax_rate_id_fkey" FOREIGN KEY ("tax_rate_id") REFERENCES "tax_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batches" ADD CONSTRAINT "batches_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_product_mappings" ADD CONSTRAINT "provider_product_mappings_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_payments" ADD CONSTRAINT "purchase_payments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_histories" ADD CONSTRAINT "cost_histories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_histories" ADD CONSTRAINT "cost_histories_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_histories" ADD CONSTRAINT "cost_histories_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_id_fkey" FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_sold_by_employee_id_fkey" FOREIGN KEY ("sold_by_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bar_tables" ADD CONSTRAINT "bar_tables_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_bar_table_id_fkey" FOREIGN KEY ("bar_table_id") REFERENCES "bar_tables"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_table_session_id_fkey" FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comanda_items" ADD CONSTRAINT "comanda_items_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_ledger_account_id_fkey" FOREIGN KEY ("ledger_account_id") REFERENCES "ledger_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_transactions" ADD CONSTRAINT "service_transactions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payments" ADD CONSTRAINT "customer_payments_cash_register_id_fkey" FOREIGN KEY ("cash_register_id") REFERENCES "cash_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_quotation_id_fkey" FOREIGN KEY ("quotation_id") REFERENCES "quotations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotation_items" ADD CONSTRAINT "quotation_items_presentation_id_fkey" FOREIGN KEY ("presentation_id") REFERENCES "product_presentations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wompi_transactions" ADD CONSTRAINT "wompi_transactions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wompi_transactions" ADD CONSTRAINT "wompi_transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wompi_transactions" ADD CONSTRAINT "wompi_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wompi_transactions" ADD CONSTRAINT "wompi_transactions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "payment_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_requests" ADD CONSTRAINT "processed_requests_store_id_fkey" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
