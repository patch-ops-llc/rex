"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Contact {
  id: string;
  email: string;
  name: string | null;
  role: string | null;
}

export function EngagementContacts({
  engagementId,
  initialContacts,
}: {
  engagementId: string;
  initialContacts: Contact[];
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setAdding(true);
    try {
      const res = await fetch(`/api/engagements/${engagementId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      });
      if (res.ok) {
        const contact = await res.json();
        setContacts((prev) => {
          const exists = prev.find((c) => c.id === contact.id);
          if (exists) return prev.map((c) => (c.id === contact.id ? contact : c));
          return [contact, ...prev];
        });
        setEmail("");
        setName("");
        setShowForm(false);
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(contactId: string) {
    const res = await fetch(
      `/api/engagements/${engagementId}/contacts?contactId=${contactId}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            Contacts
          </CardTitle>
          <CardDescription className="text-xs">
            Add client email addresses so Rex can auto-associate calendar meetings
            with this engagement.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm(!showForm)}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <form onSubmit={handleAdd} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Input
                placeholder="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-8 text-sm"
              />
            </div>
            <div className="w-36 space-y-1">
              <Input
                placeholder="Name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button type="submit" size="sm" disabled={adding} className="h-8">
              {adding ? "..." : "Add"}
            </Button>
          </form>
        )}

        {contacts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            No contacts added yet.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {contacts.map((contact) => (
              <Badge
                key={contact.id}
                variant="secondary"
                className="pl-2 pr-1 py-1 gap-1.5 text-xs"
              >
                <span>
                  {contact.name ? `${contact.name} ` : ""}
                  <span className="text-muted-foreground">
                    {contact.name ? `(${contact.email})` : contact.email}
                  </span>
                </span>
                <button
                  onClick={() => handleRemove(contact.id)}
                  className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
