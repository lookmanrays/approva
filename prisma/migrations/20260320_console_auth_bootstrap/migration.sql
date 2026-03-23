ALTER TABLE "users"
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "password_set_at" TIMESTAMP(3);

CREATE TABLE "console_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "console_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "console_sessions_session_token_hash_key" ON "console_sessions"("session_token_hash");
CREATE INDEX "console_sessions_user_id_created_at_idx" ON "console_sessions"("user_id", "created_at");
CREATE INDEX "console_sessions_expires_at_idx" ON "console_sessions"("expires_at");

ALTER TABLE "console_sessions"
ADD CONSTRAINT "console_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
