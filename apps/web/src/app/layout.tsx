import type { Metadata } from "next";
import { AuthProvider } from "../lib/auth-context";
import { ThemeProvider } from "../components/theme/ThemeProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hospital CMS",
  description: "Hospital Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 antialiased">
        <AuthProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
