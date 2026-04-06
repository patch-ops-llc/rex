import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "REX Display",
  description: "Call copilot visual output",
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
