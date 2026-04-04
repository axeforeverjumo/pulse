-- Email cached files: stores references to cached email images/attachments in R2
-- Files are proactively downloaded for new emails and on-demand for old ones
-- Cleanup: daily cron deletes files not accessed in 30 days

CREATE TABLE IF NOT EXISTS "public"."email_cached_files" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "email_external_id" text NOT NULL,
    "ext_connection_id" uuid NOT NULL,
    "r2_key" text NOT NULL,
    "file_type" text NOT NULL CHECK (file_type IN ('inline', 'attachment')),
    "original_filename" text,
    "content_id" text,
    "attachment_id" text,
    "mime_type" text,
    "size_bytes" bigint,
    "last_accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_cached_files_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_email_cached_files_cleanup
    ON email_cached_files (last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_email_cached_files_lookup
    ON email_cached_files (user_id, email_external_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_cached_files_unique_r2
    ON email_cached_files (r2_key);

ALTER TABLE email_cached_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cached files" ON email_cached_files
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own cached files" ON email_cached_files
    FOR ALL USING (auth.uid() = user_id);
