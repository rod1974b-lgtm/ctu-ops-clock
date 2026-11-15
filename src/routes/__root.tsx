import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-[#ffcc00] font-mono">
      <div className="max-w-md text-center border-2 border-[#ffcc00]/40 p-8 bg-black/90 shadow-[0_0_25px_rgba(255,204,0,0.15)]">
        <div className="text-xs tracking-widest text-[#ffcc00]/60 mb-2">CTU SECTOR 4 — GRID 00</div>
        <h1 className="text-6xl font-black tracking-widest text-[#ffcc00] mb-2">404</h1>
        <h2 className="text-sm font-bold tracking-widest uppercase mb-4 text-[#ffcc00]">
          SECTOR FREQUENCY NOT FOUND
        </h2>
        <p className="text-xs text-[#ffcc00]/70 font-sans mb-6 leading-relaxed">
          The requested tactical sector does not exist or clearance was revoked by CTU command.
        </p>
        <div>
          <Link
            to="/"
            className="inline-block bg-[#ffcc00] text-black font-black uppercase text-xs tracking-widest px-6 py-2.5 hover:bg-[#ffcc00]/80 transition-colors"
          >
            RETURN TO OPERATIONAL TERMINAL
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error("CTU Root Boundary caught exception:", error);
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4 text-[#ffcc00] font-mono">
      <div className="max-w-md text-center border-2 border-red-600/70 p-8 bg-black/95 shadow-[0_0_30px_rgba(255,0,0,0.25)]">
        <div className="text-xs tracking-widest text-red-500 font-bold mb-2">
          CRITICAL SUBSYSTEM FAILURE // CTU CORE
        </div>
        <h1 className="text-xl font-black tracking-widest text-red-500 mb-3 uppercase">
          OPERATIONAL MALFUNCTION
        </h1>
        <p className="text-xs text-[#ffcc00]/80 font-sans mb-6 leading-relaxed">
          Tactical telemetry interrupted. A hardware or script fault occurred in the active operational buffer.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="bg-red-600 text-black font-black uppercase text-xs tracking-widest px-5 py-2.5 hover:bg-red-500 transition-colors"
          >
            RE-ENGAGE TERMINAL
          </button>
          <a
            href="/"
            className="border border-[#ffcc00]/50 text-[#ffcc00] font-bold uppercase text-xs tracking-widest px-5 py-2.5 hover:bg-[#ffcc00]/10 transition-colors"
          >
            RELOAD GRID
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "CTU 24 Operational Terminal" },
      {
        name: "description",
        content: "Counter Terrorist Unit tactical mission timer, multi-alarm terminal, and background surveillance hub.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },

      // Mobile OS & PWA Standalone Directives
      { name: "theme-color", content: "#000000" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "CTU Ops" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "application-name", content: "CTU Ops" },
      { name: "format-detection", content: "telephone=no" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "apple-touch-icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.json" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark bg-black text-foreground">
      <head>
        <HeadContent />
      </head>
      <body className="bg-black min-h-screen selection:bg-[#ffcc00] selection:text-black">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Register background service worker with automatic update checks
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          // Check for worker updates every 30 minutes
          setInterval(() => {
            registration.update().catch(() => {});
          }, 30 * 60 * 1000);
        })
        .catch((err) => {
          console.warn("[CTU SW] Service worker registration failure:", err);
        });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
