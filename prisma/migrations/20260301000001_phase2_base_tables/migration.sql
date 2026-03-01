-- Phase 2: Base tables migration — generated from Prisma schema
-- Applies models: cost_rate_cards, dashboard_events, endpoint_configs
-- NOTE: request_logs is intentionally omitted here — created as partitioned table in 20260301000002_phase2_advanced_sql

-- CreateTable
CREATE TABLE "cost_rate_cards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "input_price_per_m_tokens" DECIMAL(10,6) NOT NULL,
    "output_price_per_m_tokens" DECIMAL(10,6) NOT NULL,
    "cached_input_price_per_m_tokens" DECIMAL(10,6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_events" (
    "id" BIGSERIAL NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "endpoint_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "endpoint_name" TEXT NOT NULL,
    "primary_model" TEXT NOT NULL,
    "fallback_chain" JSONB NOT NULL DEFAULT '[]',
    "temperature" DECIMAL(3,2) NOT NULL DEFAULT 0.7,
    "max_tokens" INTEGER NOT NULL DEFAULT 1000,
    "system_prompt" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "endpoint_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cost_rate_cards_model_id_key" ON "cost_rate_cards"("model_id");

-- CreateIndex
CREATE UNIQUE INDEX "endpoint_configs_endpoint_name_key" ON "endpoint_configs"("endpoint_name");
