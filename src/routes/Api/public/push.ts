// src/routes/api/public/push.ts — Server Endpoint for CTU Web Push Subscriptions & Alerts
import { createAPIFileRoute } from "@tanstack/react-start/api";
import webpush from "web-push";

// In production, configure VAPID keys via environment variables:
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. mailto:ops@ctu.local)
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:ops@ctu.local";

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

interface PushPayload {
  action: "subscribe" | "schedule" | "cancel";
  subscription?: webpush.PushSubscription;
  alarmId?: string;
  label?: string;
  targetEpochMs?: number;
}

export const Route = createAPIFileRoute("/api/public/push")({
  GET: async () => {
    return new Response(
      JSON.stringify({
        status: "operational",
        vapidPublicKey: vapidPublicKey || null,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  },

  POST: async ({ request }) => {
    try {
      const payload = (await request.json()) as PushPayload;

      if (!vapidPublicKey || !vapidPrivateKey) {
        return new Response(
          JSON.stringify({
            error: "VAPID credentials not configured on server",
          }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }

      if (payload.action === "subscribe") {
        // Store subscription in database for target device
        return new Response(
          JSON.stringify({ success: true, message: "Subscription registered" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (payload.action === "schedule" && payload.subscription) {
        const delay = (payload.targetEpochMs || Date.now()) - Date.now();
        
        // In local/edge runtime, schedule or store for queue worker:
        if (delay <= 0) {
          // Trigger immediate test push
          const notificationData = JSON.stringify({
            title: `CTU ALERT: ${payload.label || "MISSION EXPIRED"}`,
            body: "Tactical deadline reached. Tap to open terminal.",
            alarmId: payload.alarmId,
            url: "/",
          });

          await webpush.sendNotification(payload.subscription, notificationData);
        }

        return new Response(
          JSON.stringify({
            success: true,
            scheduledFor: payload.targetEpochMs,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Invalid action or missing parameters" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: errorMsg }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
});
