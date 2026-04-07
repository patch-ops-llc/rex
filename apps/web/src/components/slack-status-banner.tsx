"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SlackBannerContent() {
  const searchParams = useSearchParams();
  const success = searchParams.get("slack_success");
  const error = searchParams.get("slack_error");

  if (success) {
    return (
      <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-200">
        Successfully connected Slack workspace: <strong>{success}</strong>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
        Slack connection failed: {error}
      </div>
    );
  }

  return null;
}

export function SlackStatusBanner() {
  return (
    <Suspense fallback={null}>
      <SlackBannerContent />
    </Suspense>
  );
}
