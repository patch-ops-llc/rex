import { prisma } from "@rex/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UploadCorpusDialog } from "@/components/upload-corpus-dialog";
import { CorpusEntryCard } from "@/components/corpus-entry-card";

export default async function CorpusPage() {
  let entries: any[] = [];
  let stats = { total: 0, byCategory: {} as Record<string, number>, byIndustry: {} as Record<string, number> };

  try {
    entries = await prisma.corpusEntry.findMany({
      orderBy: { createdAt: "desc" },
    });

    stats.total = entries.length;
    entries.forEach((e: any) => {
      if (e.category) {
        stats.byCategory[e.category] = (stats.byCategory[e.category] || 0) + 1;
      }
      if (e.industry) {
        stats.byIndustry[e.industry] = (stats.byIndustry[e.industry] || 0) + 1;
      }
    });
  } catch {
    // DB not connected
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Training Corpus</h1>
          <p className="text-muted-foreground">
            Manage discovery call transcripts and training data.
          </p>
        </div>
        <UploadCorpusDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Entries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(stats.byCategory).length === 0 ? (
                <span className="text-sm text-muted-foreground">None yet</span>
              ) : (
                Object.entries(stats.byCategory).map(([cat, count]) => (
                  <Badge key={cat} variant="secondary" className="text-xs">
                    {cat} ({count})
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Industries</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {Object.keys(stats.byIndustry).length === 0 ? (
                <span className="text-sm text-muted-foreground">None yet</span>
              ) : (
                Object.entries(stats.byIndustry).map(([ind, count]) => (
                  <Badge key={ind} variant="outline" className="text-xs">
                    {ind} ({count})
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Corpus Entries</CardTitle>
          <CardDescription>
            Upload and manage past discovery call transcripts to train REX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No corpus entries yet. Upload transcripts or paste content to
                build your training data.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry) => (
                <CorpusEntryCard
                  key={entry.id}
                  entry={{
                    ...entry,
                    createdAt: entry.createdAt.toISOString(),
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
