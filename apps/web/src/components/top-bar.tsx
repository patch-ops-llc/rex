"use client";

import { useEffect, useState } from "react";

function ClerkUserButton() {
  const [UserButton, setUserButton] = useState<React.ComponentType<any> | null>(
    null
  );

  useEffect(() => {
    import("@clerk/nextjs")
      .then((mod) => setUserButton(() => mod.UserButton))
      .catch(() => {});
  }, []);

  if (!UserButton) return null;
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
