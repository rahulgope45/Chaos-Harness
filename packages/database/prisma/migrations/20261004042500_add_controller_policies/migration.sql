CREATE TABLE "controller_policies" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 1,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "target_service" TEXT NOT NULL,
  "condition" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "breach_count" INTEGER NOT NULL,
  "cooldown_ms" INTEGER NOT NULL,
  "max_restarts" INTEGER NOT NULL,
  "restart_window_ms" INTEGER NOT NULL,
  "poll_interval_ms" INTEGER NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "controller_policies_condition_check"
    CHECK ("condition" IN ('container_not_running')),
  CONSTRAINT "controller_policies_action_check" CHECK ("action" IN ('restart')),
  CONSTRAINT "controller_policies_breach_count_check" CHECK ("breach_count" > 0),
  CONSTRAINT "controller_policies_cooldown_check" CHECK ("cooldown_ms" >= 0),
  CONSTRAINT "controller_policies_max_restarts_check" CHECK ("max_restarts" > 0),
  CONSTRAINT "controller_policies_restart_window_check" CHECK ("restart_window_ms" > 0),
  CONSTRAINT "controller_policies_poll_interval_check" CHECK ("poll_interval_ms" >= 100)
);

INSERT INTO "controller_policies" (
  "id",
  "target_service",
  "condition",
  "action",
  "breach_count",
  "cooldown_ms",
  "max_restarts",
  "restart_window_ms",
  "poll_interval_ms"
) VALUES (
  'restart-payment-worker-v1',
  'payment-worker',
  'container_not_running',
  'restart',
  2,
  5000,
  3,
  60000,
  500
);
