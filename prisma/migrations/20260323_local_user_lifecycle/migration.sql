ALTER TABLE "users"
ADD COLUMN "disabled_at" TIMESTAMP(3);

CREATE INDEX "users_disabled_at_idx" ON "users"("disabled_at");
