ALTER TABLE "chatv3-channels" ADD COLUMN "ownerUserId" text;--> statement-breakpoint
ALTER TABLE "chatv3-members" ADD COLUMN "userId" text;--> statement-breakpoint
CREATE INDEX "chatv3_channel_idx_tenant_owner" ON "chatv3-channels" USING btree ("tenantId","ownerUserId");--> statement-breakpoint
CREATE INDEX "chatv3_member_idx_tenant_user" ON "chatv3-members" USING btree ("tenantId","userId");