"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "@/lib/date";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/engagements/${engagement.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  }

  return (
    <>
      <Card className="transition-colors hover:bg-accent/50">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <Link href={`/engagements/${engagement.id}`} className="flex-1 cursor-pointer">
            <div className="space-y-1">
              <CardTitle className="text-base">{engagement.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {engagement.clientName}
                {engagement.industry && ` · ${engagement.industry}`}
              </p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <StatusBadge status={engagement.status} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setShowDeleteDialog(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <Link href={`/engagements/${engagement.id}`} className="cursor-pointer">
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
        </Link>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete engagement?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{engagement.name}</strong> and
              all associated data including discovery calls, build plans,
              implementations, walkthroughs, scope documents, and activity logs.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
