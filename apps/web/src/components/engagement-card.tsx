"use client";

import Link from "next/link";
import { formatDistanceToNow } from "@/lib/date";
import { StatusBadge } from "@/components/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface EngagementCardProps {
  engagement: {
    id: string;
    name: string;
    clientName: string;
    industry: string | null;
    hubspotTier: string | null;
    status: string;
    createdAt: string;
    _count?: {
      discoveryCalls: number;
      implementations: number;
      qaItems: number;
    };
  };
}

export function EngagementCard({ engagement }: EngagementCardProps) {
  return (
    <Link href={`/engagements/${engagement.id}`}>
      <Card className="transition-colors hover:bg-accent/50 cursor-pointer">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="text-base">{engagement.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {engagement.clientName}
              {engagement.industry && ` · ${engagement.industry}`}
            </p>
          </div>
          <StatusBadge status={engagement.status} />
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {engagement.hubspotTier && (
              <span className="capitalize">{engagement.hubspotTier}</span>
            )}
            <span>
              Created {formatDistanceToNow(new Date(engagement.createdAt))}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
