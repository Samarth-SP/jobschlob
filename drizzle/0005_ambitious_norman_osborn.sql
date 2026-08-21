ALTER TABLE "documents" ALTER COLUMN "latex" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source" text DEFAULT 'generated' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "blob_url" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "filename" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "active" boolean DEFAULT false NOT NULL;