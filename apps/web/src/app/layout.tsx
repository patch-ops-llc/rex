import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "REX — PatchOps AI Platform",
  description: "RevOps Discovery, Implementation & Ongoing Support",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const body = (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );

  if (hasClerk) {
    return <ClerkProvider>{body}</ClerkProvider>;
  }

  return body;
}
