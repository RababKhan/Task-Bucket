"use client";

import { useState } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query-client";
import BrandingProvider from "@/components/app/BrandingProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  // One client per browser session (lazy-init via useState so it's stable
  // across re-renders and never shared between requests on the server).
  const [queryClient] = useState(makeQueryClient);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <BrandingProvider>{children}</BrandingProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
