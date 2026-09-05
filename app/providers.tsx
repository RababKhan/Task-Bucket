"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import BrandingProvider, {
  type Branding,
} from "@/components/app/BrandingProvider";
import DocumentTitle from "@/components/app/DocumentTitle";

export default function Providers({
  children,
  branding,
}: {
  children: React.ReactNode;
  branding?: Branding | null;
}) {
  // One client per browser session (lazy-init via useState so it's stable
  // across re-renders and never shared between requests on the server).
  const [queryClient] = useState(makeQueryClient);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <BrandingProvider initial={branding}>
          <DocumentTitle />
          {children}
        </BrandingProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
