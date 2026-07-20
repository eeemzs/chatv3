CREATE TABLE "chatv3-presence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"roomId" uuid NOT NULL,
	"memberId" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"note" text,
	"expiresAt" timestamp with time zone NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chatv3-webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenantId" text DEFAULT 'default' NOT NULL,
	"channelId" uuid NOT NULL,
	"url" text NOT NULL,
	"signingSecret" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"label" text,
	"status" text DEFAULT 'active' NOT NULL,
	"failCount" integer DEFAULT 0 NOT NULL,
	"lastDeliveryAt" timestamp with time zone,
	"lastFailureAt" timestamp with time zone,
	"createdBy" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chatv3-room-cursors" ADD COLUMN "ackSeq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chatv3-presence" ADD CONSTRAINT "chatv3-presence_roomId_chatv3-rooms_id_fk" FOREIGN KEY ("roomId") REFERENCES "public"."chatv3-rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-presence" ADD CONSTRAINT "chatv3-presence_memberId_chatv3-members_id_fk" FOREIGN KEY ("memberId") REFERENCES "public"."chatv3-members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chatv3-webhooks" ADD CONSTRAINT "chatv3-webhooks_channelId_chatv3-channels_id_fk" FOREIGN KEY ("channelId") REFERENCES "public"."chatv3-channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chatv3_presence_room_member_unique" ON "chatv3-presence" USING btree ("roomId","memberId");--> statement-breakpoint
CREATE INDEX "chatv3_presence_idx_room_expires" ON "chatv3-presence" USING btree ("roomId","expiresAt");--> statement-breakpoint
CREATE INDEX "chatv3_webhook_idx_channel_status" ON "chatv3-webhooks" USING btree ("tenantId","channelId","status");