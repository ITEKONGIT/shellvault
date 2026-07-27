import type { Metadata } from "next";
import "@/app/globals.css";

export const metadata: Metadata = {
  title: "ShellVault - Secure SSH Broker",
  description: "Passwordless SSH connection broker with enterprise-grade security",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
