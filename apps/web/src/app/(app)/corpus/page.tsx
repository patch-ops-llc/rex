import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function CorpusPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Training Corpus</h1>
        <p className="text-muted-foreground">
          Manage discovery call transcripts and training data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Corpus Entries</CardTitle>
          <CardDescription>
            Upload and manage past discovery call transcripts to train REX.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            No corpus entries yet. Upload transcripts or complete discovery calls
            to build your training data.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
