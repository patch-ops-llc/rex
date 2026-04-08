import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Implementation Walkthrough — PatchOps",
  description: "Interactive walkthrough of your HubSpot implementation",
};

export default function WalkthroughLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
