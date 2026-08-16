import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LinksFunction,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { headingClass, PRODUCT_LINE, PRODUCT_NAME } from "~/lib/brand";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap",
  },
];

export const meta: Route.MetaFunction = () => [
  { title: PRODUCT_NAME },
  { name: "description", content: PRODUCT_LINE },
  { property: "og:title", content: PRODUCT_NAME },
  { property: "og:description", content: PRODUCT_LINE },
  { name: "twitter:card", content: "summary" },
  { name: "twitter:title", content: PRODUCT_NAME },
  { name: "twitter:description", content: PRODUCT_LINE },
  { name: "apple-mobile-web-app-title", content: PRODUCT_NAME },
  { name: "application-name", content: PRODUCT_NAME },
  { name: "theme-color", content: "#F3EEE6" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "An unexpected error occurred.";

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : "Error";
    details =
      error.status === 404
        ? "That page does not exist."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className={`text-2xl ${headingClass}`}>{message}</h1>
      <p className="mt-3 text-[var(--muted)]">{details}</p>
    </main>
  );
}
