import type { Metadata } from "next";
import { Inter } from "next/font/google";

import "./globals.css";
import { Sidebar } from "@/components/sidebar";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Restaurant Visitor Tracker",
  description: "Auto-registering visitor detection, recognition, and analytics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <div className="flex">
          <Sidebar />
          <main className="h-screen flex-1 overflow-y-auto bg-bg p-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
