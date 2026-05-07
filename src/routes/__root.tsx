/// <reference types="vite/client" />
import { QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import appCss from "~/styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Splendor Online" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: Outlet,
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  const { queryClient } = Route.useRouteContext();

  return (
    <html lang="zh-CN">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
