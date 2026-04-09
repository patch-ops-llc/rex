"use client";

import { Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AddCalendarButton({ configured }: { configured: boolean }) {
  if (!configured) {
    return (
      <Button size="sm" disabled variant="outline">
        <Calendar className="h-4 w-4 mr-2" />
        Not Configured
      </Button>
    );
  }

  return (
    <Button size="sm" asChild>
      <a href="/api/calendar/auth">
        <Calendar className="h-4 w-4 mr-2" />
        Connect Google Calendar
      </a>
    </Button>
  );
}
