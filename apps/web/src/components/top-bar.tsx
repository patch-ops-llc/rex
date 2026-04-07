"use client";

const hasClerk = !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

function ClerkUserButton() {
  if (!hasClerk) return null;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { UserButton } = require("@clerk/nextjs");
  return <UserButton afterSignOutUrl="/sign-in" />;
}

export function TopBar() {
  return (
    <header className="flex h-16 items-center justify-between border-b bg-card px-6">
      <div />
      <div className="flex items-center gap-4">
        <ClerkUserButton />
      </div>
    </header>
  );
}
