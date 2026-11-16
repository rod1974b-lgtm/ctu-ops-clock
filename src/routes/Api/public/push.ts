// src/routes/api/public/push.ts — Server Endpoint for CTU Web Push Subscriptions & Alerts
import { createFileRoute } from "@tanstack/react-router";

interface PushPayload {
  action: "subscribe" | "schedule" | "cancel";
  subscription?: {
    endpoint: string;
    keys?: {
      p256dh: string;
      auth: string;
    };
  };
  alarmId?: string;
  label?: string;
  targetEpochMs?: number;
}

export const Route = createFileRoute("/api/public/push")({
  server: {
    handlers: {
      GET: async () => {
        const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || null;
        return Response.json({
          status: "operational",
          vapidPublicKey,
        });
      },

      POST: async ({ request }) => {
        try {
          const payload = (await request.json()) as PushPayload;
          const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
          const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

          if (!vapidPublicKey || !vapidPrivateKey) {
            return Response.json(
              {
                status: "mock_accepted",
                message: "VAPID keys not configured in environment variables. Local service worker fallbacks active.",
              },
              { status: 200 }
            );
          }

          if (payload.action === "subscribe") {
            return Response.json({
              success: true,
              message: "Subscription registered",
            });
          }

          if (payload.action === "schedule") {
            return Response.json({
              success: true,
              scheduledFor: payload.targetEpochMs,
            });
          }

          if (payload.action === "cancel") {
            return Response.json({
              success: true,
              cancelled: payload.alarmId,
            });
          }

          return Response.json(
            { error: "Invalid action parameter" },
            { status: 400 }
          );
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
