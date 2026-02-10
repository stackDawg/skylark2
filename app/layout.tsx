import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark Agent",
  description: "AI-powered drone operations coordinator for Skylark Drones. Manage pilots, fleet, missions, and assignments with intelligent conflict detection.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛩️</text></svg>",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
