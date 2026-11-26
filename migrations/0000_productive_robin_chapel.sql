CREATE TYPE "public"."app_role" AS ENUM('hq_admin', 'hq_viewer', 'centre_manager', 'centre_staff', 'restricted_viewer');--> statement-breakpoint
CREATE TABLE "action_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"conclusion_id" uuid NOT NULL,
	"tab" text NOT NULL,
	"description" text NOT NULL,
	"owner" text NOT NULL,
	"due_date" date NOT NULL,
	"priority" text NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_items_conclusion_id_unique" UNIQUE("conclusion_id"),
	CONSTRAINT "progress_range" CHECK ("action_items"."progress" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "centre_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"alias" text NOT NULL,
	CONSTRAINT "centre_aliases_source_id_alias_unique" UNIQUE("source_id","alias")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event" text NOT NULL,
	"record_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "centres" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "centres_org_id_code_unique" UNIQUE("org_id","code"),
	CONSTRAINT "centres_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "report_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"date" date NOT NULL,
	"due_date" date,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_centre_permissions" (
	"org_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "user_centre_permissions_user_id_centre_id_unique" UNIQUE("user_id","centre_id")
);
--> statement-breakpoint
CREATE TABLE "normalised_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"centre_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"metric_key" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"value" numeric(20, 6) NOT NULL,
	"unit" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"methodology" text NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer NOT NULL,
	CONSTRAINT "normalised_metrics_source_id_external_id_unique" UNIQUE("source_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "organisations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reporting_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"start" date NOT NULL,
	"end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reporting_periods_org_id_kind_start_end_unique" UNIQUE("org_id","kind","start","end"),
	CONSTRAINT "reporting_periods_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "period_dates" CHECK ("reporting_periods"."end" >= "reporting_periods"."start")
);
--> statement-breakpoint
CREATE TABLE "application_settings" (
	"org_id" uuid PRIMARY KEY NOT NULL,
	"logo_url" text,
	"fiscal_start_month" integer DEFAULT 4 NOT NULL,
	"fortnight_anchor" date DEFAULT '2026-01-05' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fiscal_month_range" CHECK ("application_settings"."fiscal_start_month" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "integration_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_sources_org_id_key_unique" UNIQUE("org_id","key"),
	CONSTRAINT "integration_sources_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" text NOT NULL,
	"counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_summary" text,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"name" text NOT NULL,
	"role" "app_role" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_subject_unique" UNIQUE("subject"),
	CONSTRAINT "user_profiles_org_id_id_unique" UNIQUE("org_id","id")
);
--> statement-breakpoint
ALTER TABLE "action_history" ADD CONSTRAINT "action_history_action_id_action_items_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."action_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_history" ADD CONSTRAINT "action_history_actor_id_user_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_conclusion_id_report_entries_id_fk" FOREIGN KEY ("conclusion_id") REFERENCES "public"."report_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_org_id_period_id_reporting_periods_org_id_id_fk" FOREIGN KEY ("org_id","period_id") REFERENCES "public"."reporting_periods"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_aliases" ADD CONSTRAINT "centre_aliases_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centre_aliases" ADD CONSTRAINT "centre_aliases_org_id_source_id_integration_sources_org_id_id_fk" FOREIGN KEY ("org_id","source_id") REFERENCES "public"."integration_sources"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_user_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "centres" ADD CONSTRAINT "centres_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_entries" ADD CONSTRAINT "report_entries_org_id_period_id_reporting_periods_org_id_id_fk" FOREIGN KEY ("org_id","period_id") REFERENCES "public"."reporting_periods"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_centre_permissions" ADD CONSTRAINT "user_centre_permissions_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_centre_permissions" ADD CONSTRAINT "user_centre_permissions_org_id_user_id_user_profiles_org_id_id_fk" FOREIGN KEY ("org_id","user_id") REFERENCES "public"."user_profiles"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalised_metrics" ADD CONSTRAINT "normalised_metrics_org_id_centre_id_centres_org_id_id_fk" FOREIGN KEY ("org_id","centre_id") REFERENCES "public"."centres"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalised_metrics" ADD CONSTRAINT "normalised_metrics_org_id_source_id_integration_sources_org_id_id_fk" FOREIGN KEY ("org_id","source_id") REFERENCES "public"."integration_sources"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reporting_periods" ADD CONSTRAINT "reporting_periods_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_org_id_organisations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_history_action_id_created_at_index" ON "action_history" USING btree ("action_id","created_at");--> statement-breakpoint
CREATE INDEX "action_items_org_id_centre_id_due_date_index" ON "action_items" USING btree ("org_id","centre_id","due_date");--> statement-breakpoint
CREATE INDEX "audit_logs_org_id_created_at_index" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "report_entries_org_id_centre_id_kind_date_index" ON "report_entries" USING btree ("org_id","centre_id","kind","date");--> statement-breakpoint
CREATE INDEX "report_entries_org_id_period_id_index" ON "report_entries" USING btree ("org_id","period_id");--> statement-breakpoint
CREATE INDEX "normalised_metrics_org_id_centre_id_metric_key_period_start_index" ON "normalised_metrics" USING btree ("org_id","centre_id","metric_key","period_start");--> statement-breakpoint
CREATE INDEX "sync_jobs_source_id_created_at_index" ON "sync_jobs" USING btree ("source_id","created_at");