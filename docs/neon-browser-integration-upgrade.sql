-- Run the entire file as the Neon database owner after the initial Hub setup.
-- If your Vercel connection uses a differently named runtime role, edit it below.
DO $hub_integration$
DECLARE
  runtime_role text := 'huddle_app';
BEGIN
  PERFORM pg_advisory_xact_lock(407143041);
  PERFORM set_config('search_path', 'public, pg_catalog', true);
  IF to_regclass('drizzle.__drizzle_migrations') IS NULL OR to_regclass('public.organisations') IS NULL THEN
    RAISE EXCEPTION 'Run the initial Neon browser setup first and verify this is the Hub branch.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE created_at = 1795668546421) THEN
CREATE TABLE "integration_datasets" (
	"source_id" uuid NOT NULL,
	"key" text NOT NULL,
	"definition" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_datasets_source_id_key_unique" UNIQUE("source_id","key")
);
--> statement-breakpoint
CREATE TABLE "integration_flags" (
	"source_id" uuid NOT NULL,
	"external_centre" text NOT NULL,
	"external_id" text NOT NULL,
	"hart" boolean DEFAULT false NOT NULL,
	"highlight" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_flags_source_id_external_centre_external_id_unique" UNIQUE("source_id","external_centre","external_id")
);
--> statement-breakpoint
CREATE TABLE "integration_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"job_id" uuid,
	"code" text NOT NULL,
	"detail" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"external_centre" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"data" jsonb NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "integration_snapshots_source_id_external_centre_from_date_to_date_unique" UNIQUE("source_id","external_centre","from_date","to_date")
);
--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "state" jsonb;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration_datasets" ADD CONSTRAINT "integration_datasets_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_flags" ADD CONSTRAINT "integration_flags_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_issues" ADD CONSTRAINT "integration_issues_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_issues" ADD CONSTRAINT "integration_issues_job_id_sync_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."sync_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_snapshots" ADD CONSTRAINT "integration_snapshots_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_snapshots" ADD CONSTRAINT "integration_snapshots_org_id_source_id_integration_sources_org_id_id_fk" FOREIGN KEY ("org_id","source_id") REFERENCES "public"."integration_sources"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "integration_issues_source_id_created_at_index" ON "integration_issues" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "integration_snapshots_org_id_centre_id_from_date_to_date_index" ON "integration_snapshots" USING btree ("org_id","centre_id","from_date","to_date");--> statement-breakpoint
CREATE UNIQUE INDEX "sync_jobs_one_running" ON "sync_jobs" USING btree ("source_id") WHERE "sync_jobs"."status" = 'running';
    INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('d97d94ad22f7ff887ab33f499c52bb76571c729594bcf4228b96ff747f4254ae', 1795668546421);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.integration_datasets, public.integration_flags, public.integration_snapshots, public.sync_jobs TO %I', runtime_role);
    EXECUTE format('GRANT SELECT, INSERT ON public.integration_issues TO %I', runtime_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.integration_sources TO %I', runtime_role);
  ELSE
    RAISE NOTICE 'Runtime role % does not exist. Apply the integration grants after creating that role.', runtime_role;
  END IF;
END;
$hub_integration$;

SELECT 'Integration schema ready' AS status;
