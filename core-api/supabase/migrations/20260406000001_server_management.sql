-- Server management: stores external servers for agent deployment
CREATE TABLE IF NOT EXISTS "public"."workspace_servers" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL,
    "host" text NOT NULL,
    "port" integer DEFAULT 22,
    "username" text NOT NULL DEFAULT 'root',
    "auth_type" text NOT NULL DEFAULT 'ssh_key' CHECK (auth_type IN ('ssh_key', 'password', 'both')),
    "ssh_private_key_encrypted" text,
    "password_encrypted" text,
    "wildcard_domain" text,
    "status" text DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'offline')),
    "last_verified_at" timestamp with time zone,
    "verification_details" jsonb DEFAULT '{}',
    "is_default" boolean DEFAULT false,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_servers_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_workspace_servers_workspace ON workspace_servers(workspace_id);

ALTER TABLE workspace_servers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_servers" ON workspace_servers
    FOR ALL USING (EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_servers.workspace_id AND wm.user_id = auth.uid()
    ));

-- Generated SSH keypair for the workspace (so they can download the public key)
CREATE TABLE IF NOT EXISTS "public"."workspace_ssh_keys" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "workspace_id" uuid NOT NULL,
    "name" text NOT NULL DEFAULT 'pulse-deploy',
    "public_key" text NOT NULL,
    "private_key_encrypted" text NOT NULL,
    "fingerprint" text,
    "created_by" uuid,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT workspace_ssh_keys_pkey PRIMARY KEY (id)
);

ALTER TABLE workspace_ssh_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace_members_ssh_keys" ON workspace_ssh_keys
    FOR ALL USING (EXISTS (
        SELECT 1 FROM workspace_members wm
        WHERE wm.workspace_id = workspace_ssh_keys.workspace_id AND wm.user_id = auth.uid()
    ));
