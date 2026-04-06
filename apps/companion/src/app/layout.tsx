import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REX Companion",
  description: "PatchOps live call monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
