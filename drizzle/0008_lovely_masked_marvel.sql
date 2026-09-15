CREATE TABLE "apply_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"job_id" text NOT NULL,
	"document_id" integer,
	"status" text DEFAULT 'queued' NOT NULL,
	"notes" text,
	"field_flags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "identity" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "apply_api_token" text;--> statement-breakpoint
ALTER TABLE "apply_tasks" ADD CONSTRAINT "apply_tasks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apply_tasks" ADD CONSTRAINT "apply_tasks_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "apply_tasks_user_job_idx" ON "apply_tasks" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_apply_api_token_idx" ON "profiles" USING btree ("apply_api_token");