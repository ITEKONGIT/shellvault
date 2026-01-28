-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "totp_secret" TEXT NOT NULL,
    "totp_verified" BOOLEAN NOT NULL DEFAULT false,
    "backup_codes" TEXT[],
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "servers" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "ssh_username" TEXT NOT NULL,
    "hostname" TEXT,
    "os_info" TEXT,
    "handshake_uuid" TEXT NOT NULL,
    "agent_installed" BOOLEAN NOT NULL DEFAULT false,
    "agent_version" TEXT,
    "agent_last_seen" TIMESTAMP(3),
    "agent_health_status" TEXT NOT NULL DEFAULT 'unknown',
    "rotation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rotation_interval" INTEGER NOT NULL DEFAULT 24,
    "last_rotated" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_connected" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tags" TEXT[],
    "notes" TEXT,

    CONSTRAINT "servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ssh_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "client_ip" TEXT NOT NULL,
    "user_agent" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "last_activity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bytes_sent" BIGINT NOT NULL DEFAULT 0,
    "bytes_received" BIGINT NOT NULL DEFAULT 0,
    "error_message" TEXT,

    CONSTRAINT "ssh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" TEXT,
    "event_type" TEXT NOT NULL,
    "event_category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "servers_handshake_uuid_key" ON "servers"("handshake_uuid");

-- CreateIndex
CREATE INDEX "servers_user_id_idx" ON "servers"("user_id");

-- CreateIndex
CREATE INDEX "servers_agent_installed_idx" ON "servers"("agent_installed");

-- CreateIndex
CREATE UNIQUE INDEX "servers_user_id_ip_address_key" ON "servers"("user_id", "ip_address");

-- CreateIndex
CREATE INDEX "ssh_sessions_user_id_idx" ON "ssh_sessions"("user_id");

-- CreateIndex
CREATE INDEX "ssh_sessions_server_id_idx" ON "ssh_sessions"("server_id");

-- CreateIndex
CREATE INDEX "ssh_sessions_status_idx" ON "ssh_sessions"("status");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "audit_logs_event_category_idx" ON "audit_logs"("event_category");

-- CreateIndex
CREATE INDEX "audit_logs_severity_idx" ON "audit_logs"("severity");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "servers" ADD CONSTRAINT "servers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_server_id_fkey" FOREIGN KEY ("server_id") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
