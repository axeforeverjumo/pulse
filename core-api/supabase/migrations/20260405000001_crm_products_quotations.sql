-- CRM Products catalog
CREATE TABLE IF NOT EXISTS "public"."crm_products" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "unit_price" numeric NOT NULL DEFAULT 0,
    "currency_code" text DEFAULT 'EUR',
    "unit_of_measure" text DEFAULT 'Unidad',
    "tax_rate" numeric DEFAULT 21,
    "category" text,
    "is_active" boolean DEFAULT true,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_products_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_crm_products_workspace ON crm_products(workspace_id);
ALTER TABLE crm_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_products" ON crm_products
    FOR ALL USING (EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = crm_products.workspace_id AND wm.user_id = auth.uid()
    ));

-- CRM Quotations (Presupuestos)
CREATE TABLE IF NOT EXISTS "public"."crm_quotations" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "opportunity_id" uuid REFERENCES crm_opportunities(id) ON DELETE SET NULL,
    "company_id" uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
    "contact_id" uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
    "quotation_number" text,
    "status" text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'rejected', 'cancelled')),
    "expiry_date" date,
    "payment_terms" text DEFAULT 'Inmediato',
    "notes" text,
    "subtotal" numeric DEFAULT 0,
    "tax_total" numeric DEFAULT 0,
    "total" numeric DEFAULT 0,
    "currency_code" text DEFAULT 'EUR',
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT crm_quotations_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_crm_quotations_workspace ON crm_quotations(workspace_id);
CREATE INDEX idx_crm_quotations_opportunity ON crm_quotations(opportunity_id);
ALTER TABLE crm_quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_quotations" ON crm_quotations
    FOR ALL USING (EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = crm_quotations.workspace_id AND wm.user_id = auth.uid()
    ));

-- Quotation lines (like Odoo's order lines with sections and notes)
CREATE TABLE IF NOT EXISTS "public"."crm_quotation_lines" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "quotation_id" uuid NOT NULL REFERENCES crm_quotations(id) ON DELETE CASCADE,
    "line_type" text NOT NULL DEFAULT 'product' CHECK (line_type IN ('product', 'section', 'note')),
    "product_id" uuid REFERENCES crm_products(id) ON DELETE SET NULL,
    "name" text NOT NULL,
    "description" text,
    "quantity" numeric DEFAULT 1,
    "unit_price" numeric DEFAULT 0,
    "unit_of_measure" text DEFAULT 'Unidad',
    "discount" numeric DEFAULT 0,
    "tax_rate" numeric DEFAULT 21,
    "subtotal" numeric DEFAULT 0,
    "position" integer DEFAULT 0,
    CONSTRAINT crm_quotation_lines_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_crm_quotation_lines_quotation ON crm_quotation_lines(quotation_id);
ALTER TABLE crm_quotation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quotation_lines_via_quotation" ON crm_quotation_lines
    FOR ALL USING (EXISTS (
        SELECT 1 FROM crm_quotations q
        JOIN workspace_members wm ON wm.workspace_id = q.workspace_id AND wm.user_id = auth.uid()
        WHERE q.id = crm_quotation_lines.quotation_id
    ));

-- Auto-generate quotation numbers
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num integer;
BEGIN
    SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 2) AS integer)), 0) + 1
    INTO next_num
    FROM crm_quotations
    WHERE workspace_id = NEW.workspace_id;

    NEW.quotation_number := 'P' || LPAD(next_num::text, 5, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_quotation_number
    BEFORE INSERT ON crm_quotations
    FOR EACH ROW
    WHEN (NEW.quotation_number IS NULL)
    EXECUTE FUNCTION generate_quotation_number();
