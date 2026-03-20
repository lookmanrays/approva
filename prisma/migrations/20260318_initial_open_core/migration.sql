-- Open-core baseline migration.
-- Generated from the current Prisma schema and augmented with
-- integrity checks that Prisma does not model directly.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ApprovalRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired', 'auto_approved');

-- CreateEnum
CREATE TYPE "ApprovalDecisionType" AS ENUM ('approved', 'rejected', 'auto_approved');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed');

-- CreateEnum
CREATE TYPE "ApproverUserStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "OrganizationMemberRole" AS ENUM ('owner', 'admin', 'member', 'approver');

-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('slack', 'webhook', 'email');

-- CreateEnum
CREATE TYPE "ApiKeyScope" AS ENUM ('approval_requests_create', 'approval_requests_read', 'capabilities_verify', 'capabilities_use', 'webhooks_manage');

-- CreateEnum
CREATE TYPE "CapabilityDeliveryMode" AS ENUM ('none', 'exchange_token');

-- CreateEnum
CREATE TYPE "MachinePrincipalType" AS ENUM ('api_key', 'service_account');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "OrganizationMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_requests" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "external_request_id" TEXT,
    "requested_by_system" TEXT NOT NULL,
    "requested_by_actor_id" TEXT,
    "idempotency_key" TEXT,
    "request_fingerprint_hash" CHAR(64) NOT NULL,
    "approval_access_token_hash" CHAR(64) NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "params_hash" CHAR(64) NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "status" "ApprovalRequestStatus" NOT NULL,
    "callback_url" TEXT,
    "deliver_capability_mode" "CapabilityDeliveryMode" NOT NULL DEFAULT 'none',
    "machine_principal_type" "MachinePrincipalType",
    "machine_principal_id" TEXT,
    "policy_result" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "decision" "ApprovalDecisionType" NOT NULL,
    "approver_id" TEXT NOT NULL,
    "approver_display_name" TEXT,
    "reason" TEXT,
    "auth_method" TEXT NOT NULL,
    "auth_context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capabilities" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT NOT NULL,
    "params_hash" CHAR(64) NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capability_exchange_tokens" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "capability_id" UUID NOT NULL,
    "exchange_token_hash" CHAR(64) NOT NULL,
    "encrypted_capability_token" TEXT,
    "callback_url" TEXT,
    "machine_principal_type" "MachinePrincipalType",
    "machine_principal_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capability_exchange_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID,
    "event_type" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immutable_events" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "immutable_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "immutable_event_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "previous_hash" CHAR(64),
    "entry_hash" CHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "organization_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "approval_request_id" UUID NOT NULL,
    "callback_url" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "response_status" INTEGER,
    "response_body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "risk_level" "RiskLevel" NOT NULL,
    "approval_required" BOOLEAN NOT NULL,
    "approver_roles" "OrganizationMemberRole"[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "callback_url" TEXT NOT NULL,
    "signing_secret_hash" CHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "config_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limit_windows" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_replay_windows" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "replay_key" CHAR(64) NOT NULL,
    "event_type" TEXT NOT NULL,
    "approval_request_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_replay_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approver_users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" "ApproverUserStatus" NOT NULL DEFAULT 'active',
    "registration_challenge" TEXT,
    "registration_challenge_expires_at" TIMESTAMP(3),
    "authentication_challenge" TEXT,
    "authentication_challenge_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approver_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" UUID NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL,
    "transports_json" JSONB,
    "device_type" TEXT,
    "backed_up" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approver_sessions" (
    "id" UUID NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "webauthn_credential_id" UUID,
    "session_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approver_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_accounts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "service_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_api_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_account_id" TEXT,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "scopes" "ApiKeyScope"[],
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organizations_created_at_idx" ON "organizations"("created_at");

-- CreateIndex
CREATE INDEX "organization_members_user_id_created_at_idx" ON "organization_members"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_members_organization_id_role_created_at_idx" ON "organization_members"("organization_id", "role", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_approval_access_token_hash_key" ON "approval_requests"("approval_access_token_hash");

-- CreateIndex
CREATE INDEX "approval_requests_org_status_expires_idx" ON "approval_requests"("organization_id", "status", "expires_at");

-- CreateIndex
CREATE INDEX "approval_requests_org_resource_created_idx" ON "approval_requests"("organization_id", "resource_type", "resource_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_org_system_created_idx" ON "approval_requests"("organization_id", "requested_by_system", "created_at");

-- CreateIndex
CREATE INDEX "approval_requests_org_created_idx" ON "approval_requests"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_org_system_idemp_key" ON "approval_requests"("organization_id", "requested_by_system", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "approval_requests_org_system_external_key" ON "approval_requests"("organization_id", "requested_by_system", "external_request_id");

-- CreateIndex
CREATE INDEX "approval_decisions_organization_id_approver_id_created_at_idx" ON "approval_decisions"("organization_id", "approver_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "approval_decisions_approval_request_id_key" ON "approval_decisions"("approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_token_hash_key" ON "capabilities"("token_hash");

-- CreateIndex
CREATE INDEX "capabilities_organization_id_expires_at_idx" ON "capabilities"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "capabilities_organization_id_revoked_at_idx" ON "capabilities"("organization_id", "revoked_at");

-- CreateIndex
CREATE INDEX "capabilities_organization_id_resource_type_resource_id_idx" ON "capabilities"("organization_id", "resource_type", "resource_id");

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_approval_request_id_key" ON "capabilities"("approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "capability_exchange_tokens_approval_request_id_key" ON "capability_exchange_tokens"("approval_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "capability_exchange_tokens_capability_id_key" ON "capability_exchange_tokens"("capability_id");

-- CreateIndex
CREATE UNIQUE INDEX "capability_exchange_tokens_exchange_token_hash_key" ON "capability_exchange_tokens"("exchange_token_hash");

-- CreateIndex
CREATE INDEX "capability_exchange_tokens_org_expires_idx" ON "capability_exchange_tokens"("organization_id", "expires_at");

-- CreateIndex
CREATE INDEX "capability_exchange_tokens_org_used_expires_idx" ON "capability_exchange_tokens"("organization_id", "used_at", "expires_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_approval_request_id_created_at_idx" ON "audit_events"("organization_id", "approval_request_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_events_organization_id_event_type_created_at_idx" ON "audit_events"("organization_id", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "immutable_events_org_request_created_idx" ON "immutable_events"("organization_id", "approval_request_id", "created_at");

-- CreateIndex
CREATE INDEX "immutable_events_organization_id_event_type_created_at_idx" ON "immutable_events"("organization_id", "event_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_immutable_event_id_key" ON "ledger_entries"("immutable_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_entry_hash_key" ON "ledger_entries"("entry_hash");

-- CreateIndex
CREATE INDEX "ledger_entries_organization_id_created_at_idx" ON "ledger_entries"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_organization_id_sequence_key" ON "ledger_entries"("organization_id", "sequence");

-- CreateIndex
CREATE INDEX "webhook_deliveries_organization_id_status_created_at_idx" ON "webhook_deliveries"("organization_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "webhook_deliveries_org_request_created_idx" ON "webhook_deliveries"("organization_id", "approval_request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_deliveries_approval_request_id_event_type_key" ON "webhook_deliveries"("approval_request_id", "event_type");

-- CreateIndex
CREATE INDEX "policies_org_created_idx" ON "policies"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "policies_org_match_idx" ON "policies"("organization_id", "action", "resource_type", "risk_level");

-- CreateIndex
CREATE UNIQUE INDEX "policies_org_action_resource_risk_key" ON "policies"("organization_id", "action", "resource_type", "risk_level");

-- CreateIndex
CREATE INDEX "webhooks_organization_id_created_at_idx" ON "webhooks"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhooks_organization_id_callback_url_key" ON "webhooks"("organization_id", "callback_url");

-- CreateIndex
CREATE INDEX "integrations_org_created_idx" ON "integrations"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "integrations_org_type_key" ON "integrations"("organization_id", "type");

-- CreateIndex
CREATE INDEX "rate_limit_windows_expires_at_idx" ON "rate_limit_windows"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_windows_scope_bucket_window_start_key" ON "rate_limit_windows"("scope", "bucket", "window_start");

-- CreateIndex
CREATE INDEX "webhook_replay_windows_expires_at_idx" ON "webhook_replay_windows"("expires_at");

-- CreateIndex
CREATE INDEX "webhook_replay_windows_org_created_idx" ON "webhook_replay_windows"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_replay_windows_org_target_replay_key_key" ON "webhook_replay_windows"("organization_id", "target", "replay_key");

-- CreateIndex
CREATE UNIQUE INDEX "approver_users_email_key" ON "approver_users"("email");

-- CreateIndex
CREATE INDEX "approver_users_status_created_at_idx" ON "approver_users"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "webauthn_credentials_approver_user_id_created_at_idx" ON "webauthn_credentials"("approver_user_id", "created_at");

-- CreateIndex
CREATE INDEX "webauthn_credentials_last_used_at_idx" ON "webauthn_credentials"("last_used_at");

-- CreateIndex
CREATE UNIQUE INDEX "approver_sessions_session_token_hash_key" ON "approver_sessions"("session_token_hash");

-- CreateIndex
CREATE INDEX "approver_sessions_approver_user_id_created_at_idx" ON "approver_sessions"("approver_user_id", "created_at");

-- CreateIndex
CREATE INDEX "approver_sessions_expires_at_idx" ON "approver_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "approver_sessions_webauthn_credential_id_created_at_idx" ON "approver_sessions"("webauthn_credential_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "service_accounts_org_created_idx" ON "service_accounts"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "service_accounts_org_revoked_created_idx" ON "service_accounts"("organization_id", "revoked_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "organization_api_keys_key_prefix_key" ON "organization_api_keys"("key_prefix");

-- CreateIndex
CREATE UNIQUE INDEX "organization_api_keys_key_hash_key" ON "organization_api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "organization_api_keys_org_created_idx" ON "organization_api_keys"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "organization_api_keys_org_revoked_created_idx" ON "organization_api_keys"("organization_id", "revoked_at", "created_at");

-- CreateIndex
CREATE INDEX "organization_api_keys_org_last_used_idx" ON "organization_api_keys"("organization_id", "last_used_at");

-- CreateIndex
CREATE INDEX "organization_api_keys_service_account_created_idx" ON "organization_api_keys"("service_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capabilities" ADD CONSTRAINT "capabilities_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_exchange_tokens" ADD CONSTRAINT "capability_exchange_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_exchange_tokens" ADD CONSTRAINT "capability_exchange_tokens_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capability_exchange_tokens" ADD CONSTRAINT "capability_exchange_tokens_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immutable_events" ADD CONSTRAINT "immutable_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immutable_events" ADD CONSTRAINT "immutable_events_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_immutable_event_id_fkey" FOREIGN KEY ("immutable_event_id") REFERENCES "immutable_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_replay_windows" ADD CONSTRAINT "webhook_replay_windows_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "approver_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approver_sessions" ADD CONSTRAINT "approver_sessions_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "approver_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approver_sessions" ADD CONSTRAINT "approver_sessions_webauthn_credential_id_fkey" FOREIGN KEY ("webauthn_credential_id") REFERENCES "webauthn_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_api_keys" ADD CONSTRAINT "organization_api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_api_keys" ADD CONSTRAINT "organization_api_keys_service_account_id_fkey" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve core integrity checks from the pre-squash schema hardening.
ALTER TABLE "approval_requests"
  ADD CONSTRAINT "approval_requests_status_decided_at_check"
  CHECK (
    ("status" = 'pending' AND "decided_at" IS NULL)
    OR
    ("status" <> 'pending' AND "decided_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "approval_requests_expires_at_after_created_at_check"
  CHECK ("expires_at" > "created_at");

ALTER TABLE "capabilities"
  ADD CONSTRAINT "capabilities_expires_at_after_issued_at_check"
  CHECK ("expires_at" > "issued_at");

ALTER TABLE "webhook_deliveries"
  ADD CONSTRAINT "webhook_deliveries_attempt_count_check"
  CHECK ("attempt_count" >= 0),
  ADD CONSTRAINT "webhook_deliveries_attempt_timestamps_check"
  CHECK (
    ("attempt_count" = 0 AND "last_attempt_at" IS NULL)
    OR
    ("attempt_count" > 0 AND "last_attempt_at" IS NOT NULL)
  );
