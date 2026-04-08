"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  SendHorizontal,
  Bot,
  User,
  Loader2,
  Plus,
  Wrench,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { MarkdownContent } from "@/components/chat/markdown-content";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Accumulator refs for smooth streaming
  const accumulatedRef = useRef("");
  const toolsRef = useRef<ToolActivity[]>([]);
  const rafRef = useRef<number | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  // -----------------------------------------------------------------------
  // Scroll
  // -----------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/sessions");
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function loadSession(id: string) {
    if (isStreaming) return;
    try {
      const res = await fetch(`/api/chat/sessions/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setSessionId(id);
      setMessages(
        data.messages.map((m: { id: string; role: string; content: string; toolActivity?: unknown }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolActivity: m.toolActivity as ToolActivity[] | undefined,
        }))
      );
    } catch {
      // silently fail
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/sessions/${id}`, { method: "DELETE" });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setMessages([]);
      }
    } catch {
      // silently fail
    }
  }

  function handleNewChat() {
    if (isStreaming) return;
    setSessionId(null);
    setMessages([]);
    setInput("");
    textareaRef.current?.focus();
  }

  // -----------------------------------------------------------------------
  // Streaming submit
  // -----------------------------------------------------------------------

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    let currentSessionId = sessionId;

    // Create session on first message
    if (!currentSessionId) {
      try {
        const res = await fetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (res.ok) {
          const data = await res.json();
          currentSessionId = data.id;
          setSessionId(data.id);
        }
      } catch {
        // continue without persistence
      }
    }

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

    activeAssistantIdRef.current = assistantMessage.id;
    accumulatedRef.current = "";
    toolsRef.current = [];

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
          sessionId: currentSessionId,
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

      // Flush accumulated state into React on animation frame
      const scheduleFlush = () => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          const aid = activeAssistantIdRef.current;
          const text = accumulatedRef.current;
          const tools = [...toolsRef.current];
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aid
                ? { ...m, content: text, toolActivity: tools.length > 0 ? tools : undefined }
                : m
            )
          );
        });
      };

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
              accumulatedRef.current += `\n\nError: ${parsed.error}`;
            } else if (parsed.text) {
              accumulatedRef.current += parsed.text;
            } else if (parsed.tool_use) {
              const { name, status } = parsed.tool_use;
              const existing = toolsRef.current.find((t) => t.name === name);
              if (existing) {
                existing.status = status;
              } else {
                toolsRef.current = [...toolsRef.current, { name, status }];
              }
            }
          } catch {
            // skip malformed chunks
          }
        }

        scheduleFlush();
      }

      // Final flush to ensure everything is rendered
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const finalText = accumulatedRef.current;
      const finalTools = [...toolsRef.current];
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: finalText, toolActivity: finalTools.length > 0 ? finalTools : undefined }
            : m
        )
      );
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
      activeAssistantIdRef.current = null;
      loadSessions();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="flex -m-6" style={{ height: "calc(100% + 3rem)" }}>
      {/* ---- History sidebar ---- */}
      <div
        className={cn(
          "flex flex-col border-r bg-muted/30 transition-all duration-200 shrink-0",
          historyOpen ? "w-72" : "w-0 overflow-hidden border-r-0"
        )}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-foreground">History</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground text-center">
              No conversations yet
            </p>
          ) : (
            <div className="py-1">
              {sessions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => loadSession(s.id)}
                  className={cn(
                    "group flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors",
                    sessionId === s.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{s.title}</span>
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 hover:text-destructive"
                    title="Delete conversation"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Main chat area ---- */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-background">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setHistoryOpen(!historyOpen)}
            title={historyOpen ? "Close history" : "Open history"}
          >
            {historyOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">
              {sessionId
                ? sessions.find((s) => s.id === sessionId)?.title || "Chat"
                : "New conversation"}
            </h1>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleNewChat}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Button>
          )}
        </div>

        {/* Messages area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={(text) => setInput(text)} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
              {messages.map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  isStreaming={
                    isStreaming &&
                    message.role === "assistant" &&
                    message === messages[messages.length - 1]
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t bg-background/95 backdrop-blur px-4 py-3">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2 rounded-xl border border-input bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background transition-shadow">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Rex something..."
                rows={1}
                disabled={isStreaming}
                className={cn(
                  "flex-1 resize-none bg-transparent px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming}
                className="h-9 w-9 shrink-0 rounded-lg"
              >
                {isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <SendHorizontal className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground text-center">
              Enter to send, Shift+Enter for new line
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const suggestions = [
    "What industries have we worked in?",
    "What integration patterns do we commonly use?",
    "Summarize the discovery calls in the corpus",
    "What HubSpot implementations have we done?",
  ];

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center py-12 px-4">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <Bot className="h-7 w-7 text-primary" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-xl font-semibold">What can I help with?</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Ask about discovery calls, project patterns, implementation details,
          or anything in the corpus.
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

// ---------------------------------------------------------------------------
// Tool labels
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Chat Bubble
// ---------------------------------------------------------------------------

function ChatBubble({
  message,
  isStreaming,
}: {
  message: Message;
  isStreaming: boolean;
}) {
  const isUser = message.role === "user";
  const hasActiveTools = message.toolActivity?.some((t) => t.status !== "done");

  if (isUser) {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[75%]">
          <div className="rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </div>
        </div>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary mt-0.5">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 justify-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] space-y-2">
        {/* Tool activity badges */}
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

        {/* Message content */}
        <div className="text-sm leading-relaxed">
          {isStreaming && !message.content && !hasActiveTools ? (
            <div className="flex items-center gap-1 py-2">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : isStreaming && !message.content && hasActiveTools ? (
            <p className="text-muted-foreground italic text-xs py-1">
              Working with Slack...
            </p>
          ) : message.content ? (
            <MarkdownContent content={message.content} />
          ) : null}
          {isStreaming && message.content && (
            <span className="inline-block w-0.5 h-4 bg-primary/60 animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      </div>
    </div>
  );
}
