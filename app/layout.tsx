import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "DevOps AI Agents",
  description: "AI-powered DevOps operation assistants",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Sidebar />
        <main className="md:ml-64 min-h-screen p-4 md:p-8 pt-14 md:pt-8">{children}</main>
      </body>
    </html>
  );
}
