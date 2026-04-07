"use client";

import { useState, useRef, useEffect, useCallback, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SendHorizontal, Bot, User, Loader2, RotateCcw, Wrench } from "lucide-react";

interface ToolActivity {
  name: string;
  status: "started" | "executing" | "done";
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolActivity?: ToolActivity[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
    };

    const updatedMessages = [...messages, userMessage];
    setMessages([...updatedMessages, assistantMessage]);
    setInput("");
    setIsStreaming(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: `Error: ${err.error || "Something went wrong"}` }
              : m
          )
        );
        setIsStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        setIsStreaming(false);
        return;
      }

      let accumulated = "";
      let tools: ToolActivity[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              accumulated += `\n\nError: ${parsed.error}`;
            } else if (parsed.text) {
              accumulated += parsed.text;
            } else if (parsed.tool_use) {
              const { name, status } = parsed.tool_use;
              const existing = tools.find((t) => t.name === name);
              if (existing) {
                existing.status = status;
              } else {
                tools = [...tools, { name, status }];
              }
            }
          } catch {
            // skip malformed chunks
          }
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id
              ? { ...m, content: accumulated, toolActivity: tools.length > 0 ? [...tools] : undefined }
              : m
          )
        );
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: `Error: ${err instanceof Error ? err.message : "Connection failed"}`,
              }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleReset() {
    setMessages([]);
    setInput("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chat with Rex</h1>
          <p className="text-muted-foreground">
            Ask questions about what Rex knows from the training corpus.
          </p>
        </div>
        {messages.length > 0 && (
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            New conversation
          </Button>
        )}
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={(text) => setInput(text)} />
          ) : (
            messages.map((message) => (
              <ChatBubble
                key={message.id}
                message={message}
                isStreaming={
                  isStreaming &&
                  message.role === "assistant" &&
                  message === messages[messages.length - 1]
                }
              />
            ))
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="border-t bg-background/95 backdrop-blur p-4"
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Rex something..."
              rows={1}
              disabled={isStreaming}
              className={cn(
                "flex-1 resize-none rounded-lg border border-input bg-background px-4 py-3 text-sm",
                "ring-offset-background placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              className="h-11 w-11 shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizontal className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Rex answers based on its ingested corpus. Press Enter to send, Shift+Enter for new line.
          </p>
        </form>
      </Card>
    </div>
  );
}

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    "What industries have we worked in?",
    "What integration patterns do we commonly use?",
    "Summarize the discovery calls in the corpus",
    "What HubSpot implementations have we done?",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center py-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Bot className="h-8 w-8 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">What would you like to know?</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Rex can answer questions based on the training corpus — discovery calls,
          project documentation, implementation notes, and more.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 max-w-lg w-full">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className={cn(
              "rounded-lg border border-input bg-background px-4 py-3 text-left text-sm",
              "transition-colors hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

const TOOL_LABELS: Record<string, string> = {
  slack_list_workspaces: "Listing Slack workspaces",
  slack_list_channels: "Listing channels",
  slack_read_messages: "Reading messages",
  slack_read_thread: "Reading thread",
  slack_search_messages: "Searching messages",
  slack_send_message: "Sending message",
  slack_add_reaction: "Adding reaction",
  slack_get_user_profile: "Looking up user",
  slack_list_users: "Listing users",
};

function ChatBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const hasActiveTools = message.toolActivity?.some((t) => t.status !== "done");

  return (
    <div
      className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}
    >
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
          <Bot className="h-4 w-4 text-primary" />
        </div>
      )}
      <div className="max-w-[75%] space-y-2">
        {message.toolActivity && message.toolActivity.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolActivity.map((tool) => (
              <span
                key={tool.name}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                  tool.status === "done"
                    ? "border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                    : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
                )}
              >
                {tool.status !== "done" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Wrench className="h-3 w-3" />
                )}
                {TOOL_LABELS[tool.name] || tool.name}
              </span>
            ))}
          </div>
        )}
        <div
          className={cn(
            "rounded-xl px-4 py-3 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          {isStreaming && !message.content && !hasActiveTools ? (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <div className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <div className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : isStreaming && !message.content && hasActiveTools ? (
            <p className="text-muted-foreground italic text-xs">Working with Slack...</p>
          ) : message.content ? (
            <div className="whitespace-pre-wrap">{message.content}</div>
          ) : null}
        </div>
      </div>
      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary mt-0.5">
          <User className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}
