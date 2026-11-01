import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useRouterState,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { type ReactNode } from "react";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { CookieBanner, useCookieConsent } from "@/components/site/CookieBanner";
import { buttonCls } from "@/components/site/ui";
import { AuthProvider } from "@/lib/auth";
import "@/lib/i18n";

function NotFoundComponent() {
  return (
    <section className="flex min-h-[80vh] items-center bg-navy-gradient pt-20 text-navy-foreground">
      <div className="container-x">
        <p className="eyebrow">404</p>
        <h1 className="mt-6 text-6xl md:text-8xl">This page is not here.</h1>
        <p className="mt-6 max-w-lg text-navy-muted">The address may have changed. Everything else is still where you left it.</p>
        <Link to="/" className={`${buttonCls("gold")} mt-10`}>Return home</Link>
      </div>
    </section>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-3xl text-foreground">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end. You can try refreshing or head back home.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className={buttonCls("navy")}>Try again</button>
          <a href="/" className={buttonCls("outline")}>Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Avencrestcorp" },
      { name: "description", content: "A considered approach to savings, deposits, capital markets and commodities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const cookies = useCookieConsent();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const portal = path.startsWith("/portal") || path.startsWith("/admin");
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:bg-gold focus:px-4 focus:py-2 focus:text-navy-deep">Skip to content</a>
      {!portal && <Header />}
      <main id="main-content">
        <Outlet />
      </main>
      {!portal && <Footer onCookies={() => cookies.setOpen(true)} />}
      {!portal && <CookieBanner open={cookies.open} onClose={() => cookies.setOpen(false)} />}
      <Toaster position="bottom-left" toastOptions={{ style: { borderRadius: 2, fontFamily: "var(--font-sans)" } }} />
      </AuthProvider>
    </QueryClientProvider>
  );
}

