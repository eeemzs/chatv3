CREATE TABLE "chatv3-user-key-backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"userId" text NOT NULL,
	"keyVersion" integer DEFAULT 1 NOT NULL,
	"publicKeyAlgorithm" text NOT NULL,
	"publicKeyFormat" text NOT NULL,
	"publicKey" text NOT NULL,
	"backupPackageVersion" integer DEFAULT 1 NOT NULL,
	"kekSource" text NOT NULL,
	"kdfName" text NOT NULL,
	"kdfVersion" integer DEFAULT 1 NOT NULL,
	"kdfSalt" text NOT NULL,
	"kdfMemoryKiB" integer,
	"kdfIterations" integer NOT NULL,
	"kdfParallelism" integer DEFAULT 1 NOT NULL,
	"wrapAlg" text DEFAULT 'aes-256-gcm' NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"aad" text,
	"authTag" text,
	"threatModelLabel" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-member-key-packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"memberId" uuid NOT NULL,
	"recipientUserId" text NOT NULL,
	"recipientUserKeyId" uuid NOT NULL,
	"recipientKeyVersion" integer NOT NULL,
	"packageVersion" integer DEFAULT 1 NOT NULL,
	"packageAlg" text NOT NULL,
	"ephemeralPublicKeyAlgorithm" text NOT NULL,
	"ephemeralPublicKeyFormat" text NOT NULL,
	"ephemeralPublicKey" text NOT NULL,
	"nonce" text NOT NULL,
	"ciphertext" text NOT NULL,
	"aad" text,
	"authTag" text,
	"sourceEpoch" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'usable' NOT NULL,
	"staleReason" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatv3-member-key-packages" ADD CONSTRAINT "chatv3-member-key-packages_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-member-key-packages" ADD CONSTRAINT "chatv3-member-key-packages_memberId_chatv3-members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."chatv3-members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-member-key-packages" ADD CONSTRAINT "chatv3-member-key-packages_recipientUserKeyId_chatv3-user-key-backups_id_fk" FOREIGN KEY ("recipientUserKeyId") REFERENCES "public"."chatv3-user-key-backups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_user_key_backup_tenant_user_unique" ON "chatv3-user-key-backups" USING btree ("tenantId","userId");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_user_key_backup_tenant_user_version_unique" ON "chatv3-user-key-backups" USING btree ("tenantId","userId","keyVersion");--> statement-breakpoint
CREATE INDEX "chatv3_user_key_backup_idx_tenant_status" ON "chatv3-user-key-backups" USING btree ("tenantId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_member_key_package_tenant_channel_member_unique" ON "chatv3-member-key-packages" USING btree ("tenantId","channelId","memberId");--> statement-breakpoint
CREATE INDEX "chatv3_member_key_package_idx_recipient" ON "chatv3-member-key-packages" USING btree ("tenantId","recipientUserId","status");--> statement-breakpoint
CREATE INDEX "chatv3_member_key_package_idx_channel_status" ON "chatv3-member-key-packages" USING btree ("tenantId","channelId","status");