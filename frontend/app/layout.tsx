import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { StoreProvider } from "@/components/StoreProvider";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "KitchenCore · Mise ERP",
  description: "Kitchen module for the Mise ERP restaurant system",
};

// Runs before hydration so the correct theme class is on <html> for the very
// first paint — without this, a dark-mode user would see a flash of the
// light theme every time they load the app.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("mise_theme");
    var mode = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    if (mode === "dark") document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="h-full flex flex-col bg-bg text-ink" suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <StoreProvider>
          <ToastProvider>
            <ConnectionBanner />
            {children}
          </ToastProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
