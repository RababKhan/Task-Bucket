CREATE TABLE "rate_limits" (
	"bucket" text NOT NULL,
	"subject" text NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"window_start" text DEFAULT to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM-DD HH24:MI:SS') NOT NULL,
	CONSTRAINT "rate_limits_bucket_subject_pk" PRIMARY KEY("bucket","subject")
);
