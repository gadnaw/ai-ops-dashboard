-- Phase 3: Prompt versioning migration
-- Creates prompt_templates and prompt_versions tables with:
--   1. Immutability trigger (prevents UPDATE on content columns)
--   2. Per-template auto-incrementing version trigger with advisory lock
--   3. FK constraint on request_logs.prompt_version_id
--   4. RLS policies
--   5. Seed templates

-- CreateTable: prompt_templates
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_by" UUID,
    "active_version_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: prompt_versions
CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "system_prompt" TEXT,
    "model_config" JSONB NOT NULL DEFAULT '{}',
    "variables" JSONB NOT NULL DEFAULT '[]',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_slug_key" ON "prompt_templates"("slug");
CREATE UNIQUE INDEX "prompt_templates_active_version_id_key" ON "prompt_templates"("active_version_id");
CREATE UNIQUE INDEX "prompt_versions_template_id_version_key" ON "prompt_versions"("template_id", "version");
CREATE INDEX "prompt_versions_template_id_created_at_idx" ON "prompt_versions"("template_id", "created_at" DESC);

-- AddForeignKey: prompt_versions -> prompt_templates
ALTER TABLE "prompt_versions"
    ADD CONSTRAINT "prompt_versions_template_id_fkey"
    FOREIGN KEY ("template_id")
    REFERENCES "prompt_templates"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- AddForeignKey: prompt_templates.active_version_id -> prompt_versions
ALTER TABLE "prompt_templates"
    ADD CONSTRAINT "prompt_templates_active_version_id_fkey"
    FOREIGN KEY ("active_version_id")
    REFERENCES "prompt_versions"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- 1. Immutability trigger: prevent UPDATE on content columns
CREATE OR REPLACE FUNCTION enforce_prompt_version_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.system_prompt IS DISTINCT FROM NEW.system_prompt
     OR OLD.model_config IS DISTINCT FROM NEW.model_config
  THEN
    RAISE EXCEPTION 'prompt_versions content is immutable. Create a new version instead.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_version_immutability
  BEFORE UPDATE ON prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_prompt_version_immutability();

-- 2. Per-template version auto-increment trigger with advisory lock
CREATE OR REPLACE FUNCTION assign_prompt_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
  lock_key     BIGINT;
BEGIN
  lock_key := hashtext(NEW.template_id::text)::bigint;
  PERFORM pg_advisory_xact_lock(lock_key);

  SELECT COALESCE(MAX(version), 0) + 1
  INTO next_version
  FROM prompt_versions
  WHERE template_id = NEW.template_id;

  NEW.version := next_version;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_prompt_version
  BEFORE INSERT ON prompt_versions
  FOR EACH ROW
  EXECUTE FUNCTION assign_prompt_version();

-- 3. FK constraint on request_logs.prompt_version_id -> prompt_versions(id)
ALTER TABLE request_logs
  ADD CONSTRAINT fk_prompt_version
  FOREIGN KEY (prompt_version_id)
  REFERENCES prompt_versions(id)
  ON DELETE SET NULL;

-- 4. RLS
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prompt_templates_select_all"
  ON prompt_templates FOR SELECT USING (true);

CREATE POLICY "prompt_versions_select_all"
  ON prompt_versions FOR SELECT USING (true);

-- 5. Seed templates
INSERT INTO prompt_templates (id, slug, name, description, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'summarization',  'Document Summarization', 'Summarizes documents preserving key points', NOW(), NOW()),
  (gen_random_uuid(), 'classification', 'Content Classification', 'Classifies content into predefined categories', NOW(), NOW()),
  (gen_random_uuid(), 'extraction',     'Entity Extraction',      'Extracts structured entities from unstructured text', NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
