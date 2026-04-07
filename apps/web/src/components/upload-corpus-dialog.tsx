"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileText, X } from "lucide-react";

interface ParsedEntry {
  name: string;
  transcript: any;
  source: string;
}

function parseFileContent(
  fileName: string,
  content: string
): ParsedEntry {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const baseName = fileName.replace(/\.[^/.]+$/, "");

  if (ext === "json") {
    const parsed = JSON.parse(content);
    return {
      name: baseName,
      transcript: parsed,
      source: "json-upload",
    };
  }

  if (ext === "vtt") {
    return {
      name: baseName,
      transcript: { vtt: content },
      source: "vtt-upload",
    };
  }

  return {
    name: baseName,
    transcript: { raw: content },
    source: "text-upload",
  };
}

export function UploadCorpusDialog() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [sharedMeta, setSharedMeta] = useState({
    industry: "",
    category: "",
    complexity: "",
    outcome: "",
    tags: "",
  });
  const [pasteForm, setPasteForm] = useState({
    name: "",
    content: "",
  });
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...selected]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const tags = sharedMeta.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const meta = {
        industry: sharedMeta.industry || null,
        category: sharedMeta.category || null,
        complexity: sharedMeta.complexity || null,
        outcome: sharedMeta.outcome || null,
        tags,
      };

      if (mode === "paste") {
        if (!pasteForm.name || !pasteForm.content) {
          setResult({ success: false, message: "Name and content are required" });
          return;
        }

        const res = await fetch("/api/corpus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: pasteForm.name,
            transcript: { raw: pasteForm.content },
            source: "manual-paste",
            ...meta,
          }),
        });

        if (!res.ok) throw new Error("Failed to create entry");
        setResult({ success: true, message: "Entry created successfully" });
      } else {
        if (files.length === 0) {
          setResult({ success: false, message: "Select at least one file" });
          return;
        }

        const entries = await Promise.all(
          files.map(async (file) => {
            const content = await file.text();
            const parsed = parseFileContent(file.name, content);
            return { ...parsed, ...meta };
          })
        );

        if (entries.length === 1) {
          const res = await fetch("/api/corpus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entries[0]),
          });
          if (!res.ok) throw new Error("Failed to create entry");
        } else {
          const res = await fetch("/api/corpus", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entries),
          });
          if (!res.ok) throw new Error("Failed to create entries");
        }

        setResult({
          success: true,
          message: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} uploaded successfully`,
        });
      }

      setTimeout(() => {
        setOpen(false);
        setFiles([]);
        setPasteForm({ name: "", content: "" });
        setSharedMeta({ industry: "", category: "", complexity: "", outcome: "", tags: "" });
        setResult(null);
        router.refresh();
      }, 1200);
    } catch (error: any) {
      setResult({
        success: false,
        message: error.message || "Upload failed",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload Training Data
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Upload Training Data</DialogTitle>
            <DialogDescription>
              Upload transcript files (JSON, VTT, TXT) or paste content directly.
              You can upload multiple files at once.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 py-4">
            <Button
              type="button"
              variant={mode === "file" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("file")}
            >
              <Upload className="mr-2 h-3 w-3" />
              Upload Files
            </Button>
            <Button
              type="button"
              variant={mode === "paste" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("paste")}
            >
              <FileText className="mr-2 h-3 w-3" />
              Paste Content
            </Button>
          </div>

          <div className="grid gap-4 pb-4">
            {mode === "file" ? (
              <div className="space-y-3">
                <div
                  className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm font-medium">
                    Click to select files or drag & drop
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    JSON, VTT, TXT — select multiple at once
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,.vtt,.txt,.text"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {files.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      {files.length} file{files.length !== 1 ? "s" : ""} selected
                    </Label>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {files.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {(file.size / 1024).toFixed(1)}KB
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(i)}
                            className="ml-2 text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="paste-name">Entry Name</Label>
                  <Input
                    id="paste-name"
                    placeholder="e.g. FlyGuys Discovery Call #3"
                    value={pasteForm.name}
                    onChange={(e) =>
                      setPasteForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="paste-content">Content</Label>
                  <Textarea
                    id="paste-content"
                    placeholder="Paste transcript or notes here..."
                    className="min-h-[120px]"
                    value={pasteForm.content}
                    onChange={(e) =>
                      setPasteForm((f) => ({ ...f, content: e.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <div className="border-t pt-4">
              <Label className="text-sm font-medium">
                Categorization
              </Label>
              <p className="text-xs text-muted-foreground mb-3">
                Applied to all entries in this upload
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="category" className="text-xs">Category</Label>
                  <Select
                    value={sharedMeta.category}
                    onValueChange={(v) =>
                      setSharedMeta((m) => ({ ...m, category: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="discovery-call">Discovery Call</SelectItem>
                      <SelectItem value="implementation-review">Implementation Review</SelectItem>
                      <SelectItem value="qa-session">QA Session</SelectItem>
                      <SelectItem value="training-session">Training Session</SelectItem>
                      <SelectItem value="support-call">Support Call</SelectItem>
                      <SelectItem value="internal-notes">Internal Notes</SelectItem>
                      <SelectItem value="process-doc">Process Documentation</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="industry" className="text-xs">Industry</Label>
                  <Input
                    id="industry"
                    placeholder="e.g. SaaS, Construction"
                    value={sharedMeta.industry}
                    onChange={(e) =>
                      setSharedMeta((m) => ({ ...m, industry: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="complexity" className="text-xs">Complexity</Label>
                  <Select
                    value={sharedMeta.complexity}
                    onValueChange={(v) =>
                      setSharedMeta((m) => ({ ...m, complexity: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select complexity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="complex">Complex</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="outcome" className="text-xs">Outcome</Label>
                  <Select
                    value={sharedMeta.outcome}
                    onValueChange={(v) =>
                      setSharedMeta((m) => ({ ...m, outcome: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="reference">Reference Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-1.5 mt-3">
                <Label htmlFor="tags" className="text-xs">Tags</Label>
                <Input
                  id="tags"
                  placeholder="Comma-separated, e.g. hubspot, integration, netsuite"
                  value={sharedMeta.tags}
                  onChange={(e) =>
                    setSharedMeta((m) => ({ ...m, tags: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {result && (
            <div
              className={`rounded-lg px-4 py-3 text-sm mb-4 ${
                result.success
                  ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                  : "bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200"
              }`}
            >
              {result.message}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading
                ? "Uploading..."
                : mode === "file"
                  ? `Upload ${files.length || ""} File${files.length !== 1 ? "s" : ""}`
                  : "Create Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
