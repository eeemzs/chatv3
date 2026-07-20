CREATE TABLE "chatv3-spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"externalRefs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"spaceId" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"purpose" text,
	"status" text DEFAULT 'active' NOT NULL,
	"generalRoomId" uuid,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"archivedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'session' NOT NULL,
	"purpose" text,
	"status" text DEFAULT 'active' NOT NULL,
	"lastSeq" integer DEFAULT 0 NOT NULL,
	"lastMessageAt" timestamp with time zone,
	"currentEpoch" integer DEFAULT 0 NOT NULL,
	"createdBy" text,
	"updatedBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"archivedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"handle" text NOT NULL,
	"displayName" text,
	"actorKind" text DEFAULT 'agent' NOT NULL,
	"roleKey" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"tokenHash" text NOT NULL,
	"joinedViaKeyId" uuid,
	"lastSeenAt" timestamp with time zone,
	"joinedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"removedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-room-cursors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"roomId" uuid NOT NULL,
	"memberId" uuid NOT NULL,
	"lastReadSeq" integer DEFAULT 0 NOT NULL,
	"deliveredSeq" integer DEFAULT 0 NOT NULL,
	"lastReadAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-access-keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"keyId" text NOT NULL,
	"verifierHash" text NOT NULL,
	"label" text,
	"roleKey" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"epoch" integer DEFAULT 1 NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone,
	"lastUsedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-room-epochs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"roomId" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"cipherSuite" text NOT NULL,
	"wrappedKeyBlob" text NOT NULL,
	"kdfMeta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-member-devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"memberId" uuid NOT NULL,
	"deviceLabel" text,
	"identityPublicKey" text NOT NULL,
	"signingPublicKey" text,
	"status" text DEFAULT 'active' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-device-key-packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"deviceId" uuid NOT NULL,
	"kind" text DEFAULT 'v0' NOT NULL,
	"packageBlob" text NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"consumedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-welcome-envelopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"roomId" uuid NOT NULL,
	"epoch" integer NOT NULL,
	"targetDeviceId" uuid NOT NULL,
	"envelopeBlob" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"claimedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "chatv3-messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"roomId" uuid NOT NULL,
	"seq" integer NOT NULL,
	"senderMemberId" uuid NOT NULL,
	"senderDeviceId" uuid,
	"kind" text DEFAULT 'message' NOT NULL,
	"protocolVersion" integer DEFAULT 1 NOT NULL,
	"cipherSuite" text NOT NULL,
	"epoch" integer NOT NULL,
	"ciphertext" text NOT NULL,
	"nonce" text NOT NULL,
	"aad" text,
	"authTag" text,
	"mentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"replyToSeq" integer,
	"idempotencyKey" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"roomId" uuid,
	"bindingType" text NOT NULL,
	"refId" text,
	"uri" text,
	"title" text,
	"note" text,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatv3-channels" ADD CONSTRAINT "chatv3-channels_spaceId_chatv3-spaces_id_fk" FOREIGN KEY ("spaceId") REFERENCES "public"."chatv3-spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-rooms" ADD CONSTRAINT "chatv3-rooms_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-members" ADD CONSTRAINT "chatv3-members_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-room-cursors" ADD CONSTRAINT "chatv3-room-cursors_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-room-cursors" ADD CONSTRAINT "chatv3-room-cursors_memberId_chatv3-members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."chatv3-members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-access-keys" ADD CONSTRAINT "chatv3-access-keys_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-room-epochs" ADD CONSTRAINT "chatv3-room-epochs_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-member-devices" ADD CONSTRAINT "chatv3-member-devices_memberId_chatv3-members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."chatv3-members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-device-key-packages" ADD CONSTRAINT "chatv3-device-key-packages_deviceId_chatv3-member-devices_id_fk" FOREIGN KEY ("deviceId") REFERENCES "public"."chatv3-member-devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-welcome-envelopes" ADD CONSTRAINT "chatv3-welcome-envelopes_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-welcome-envelopes" ADD CONSTRAINT "chatv3-welcome-envelopes_targetDeviceId_chatv3-member-devices_id_fk" FOREIGN KEY ("targetDeviceId") REFERENCES "public"."chatv3-member-devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-messages" ADD CONSTRAINT "chatv3-messages_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-bindings" ADD CONSTRAINT "chatv3-bindings_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-bindings" ADD CONSTRAINT "chatv3-bindings_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_space_tenant_slug_unique" ON "chatv3-spaces" USING btree ("tenantId","slug");--> statement-breakpoint
CREATE INDEX "chatv3_space_idx_tenant_status" ON "chatv3-spaces" USING btree ("tenantId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_channel_tenant_space_slug_unique" ON "chatv3-channels" USING btree ("tenantId","spaceId","slug");--> statement-breakpoint
CREATE INDEX "chatv3_channel_idx_tenant_space_status" ON "chatv3-channels" USING btree ("tenantId","spaceId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_room_tenant_channel_slug_unique" ON "chatv3-rooms" USING btree ("tenantId","channelId","slug");--> statement-breakpoint
CREATE INDEX "chatv3_room_idx_tenant_channel_status" ON "chatv3-rooms" USING btree ("tenantId","channelId","status");--> statement-breakpoint
CREATE INDEX "chatv3_room_idx_tenant_last_message" ON "chatv3-rooms" USING btree ("tenantId","lastMessageAt");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_member_tenant_channel_handle_unique" ON "chatv3-members" USING btree ("tenantId","channelId","handle");--> statement-breakpoint
CREATE INDEX "chatv3_member_idx_tenant_channel_status" ON "chatv3-members" USING btree ("tenantId","channelId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_room_cursor_room_member_unique" ON "chatv3-room-cursors" USING btree ("roomId","memberId");--> statement-breakpoint
CREATE INDEX "chatv3_room_cursor_idx_member" ON "chatv3-room-cursors" USING btree ("tenantId","memberId");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_access_key_tenant_key_id_unique" ON "chatv3-access-keys" USING btree ("tenantId","keyId");--> statement-breakpoint
CREATE INDEX "chatv3_access_key_idx_channel_status" ON "chatv3-access-keys" USING btree ("tenantId","channelId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_room_epoch_room_epoch_unique" ON "chatv3-room-epochs" USING btree ("roomId","epoch");--> statement-breakpoint
CREATE INDEX "chatv3_room_epoch_idx_room_status" ON "chatv3-room-epochs" USING btree ("tenantId","roomId","status");--> statement-breakpoint
CREATE INDEX "chatv3_member_device_idx_member_status" ON "chatv3-member-devices" USING btree ("tenantId","memberId","status");--> statement-breakpoint
CREATE INDEX "chatv3_device_key_package_idx_device_status" ON "chatv3-device-key-packages" USING btree ("deviceId","status");--> statement-breakpoint
CREATE INDEX "chatv3_welcome_envelope_idx_target_status" ON "chatv3-welcome-envelopes" USING btree ("targetDeviceId","status");--> statement-breakpoint
CREATE INDEX "chatv3_welcome_envelope_idx_room_epoch" ON "chatv3-welcome-envelopes" USING btree ("roomId","epoch");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_message_room_seq_unique" ON "chatv3-messages" USING btree ("roomId","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_message_room_idempotency_unique" ON "chatv3-messages" USING btree ("roomId","idempotencyKey");--> statement-breakpoint
CREATE INDEX "chatv3_message_idx_room_created" ON "chatv3-messages" USING btree ("roomId","createdAt");--> statement-breakpoint
CREATE INDEX "chatv3_message_idx_tenant_room_kind" ON "chatv3-messages" USING btree ("tenantId","roomId","kind");--> statement-breakpoint
CREATE INDEX "chatv3_binding_idx_channel_type" ON "chatv3-bindings" USING btree ("tenantId","channelId","bindingType");--> statement-breakpoint
CREATE INDEX "chatv3_binding_idx_room" ON "chatv3-bindings" USING btree ("roomId");