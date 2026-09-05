import type { Metadata } from "next";
import { getInitialBranding } from "@/lib/branding";
import { Inter } from "next/font/google";
import "./globals.css";
import "./shell.css";
import "./features.css";
import Providers from "./providers";

// Linear's UI font. Variable Inter, self-hosted by next/font (no layout shift).
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Task Bucket",
  description: "Project and task management for your team.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolve branding server-side so the sidebar's name/logo and the accent
  // colours are correct in the first paint (no flash of defaults).
  const branding = await getInitialBranding();
  const brandVars = [
    branding.colorDark &&
      `:root[data-theme="dark"]{--accent:${branding.colorDark};}`,
    branding.colorLight &&
      `:root[data-theme="light"]{--accent:${branding.colorLight};}`,
  ]
    .filter(Boolean)
    .join("");
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {/* Apply the saved theme before paint to avoid a flash of the wrong theme. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'){t='dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
        {brandVars && (
          <style id="brand-vars-ssr" dangerouslySetInnerHTML={{ __html: brandVars }} />
        )}
        <Providers branding={branding}>{children}</Providers>
      </body>
    </html>
  );
}
