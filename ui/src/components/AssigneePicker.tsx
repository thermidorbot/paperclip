import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Identity } from "./Identity";

interface Agent {
  id: string;
  name: string;
}

interface AssigneePickerProps {
  issue: { id: string; assigneeAgentId: string | null; assigneeUserId: string | null };
  agents?: Agent[];
  currentUserId?: string | null;
  agentName: (id: string | null) => string | null;
  onAssign: (issueId: string, assigneeAgentId: string | null, assigneeUserId: string | null) => void;
  /** Compact mode shows just the avatar, full mode shows the name */
  compact?: boolean;
  className?: string;
}

export function AssigneePicker({
  issue,
  agents,
  currentUserId,
  agentName,
  onAssign,
  compact = false,
  className,
}: AssigneePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const handleAssign = (agentId: string | null, userId: string | null) => {
    onAssign(issue.id, agentId, userId);
    setOpen(false);
    setSearch("");
  };

  const name = issue.assigneeAgentId ? agentName(issue.assigneeAgentId) : null;

  const trigger = compact ? (
    <button
      className={cn("flex items-center rounded-md transition-colors hover:bg-accent/50", className)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {name ? (
        <Identity name={name} size="xs" />
      ) : issue.assigneeUserId ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
          <User className="h-3 w-3" />
        </span>
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30 opacity-40">
          <User className="h-3 w-3" />
        </span>
      )}
    </button>
  ) : (
    <button
      className={cn("flex w-[180px] shrink-0 items-center rounded-md px-2 py-1 transition-colors hover:bg-accent/50", className)}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {name ? (
        <Identity name={name} size="sm" />
      ) : issue.assigneeUserId ? (
        <span className="inline-flex items-center gap-1.5 text-xs">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
            <User className="h-3 w-3" />
          </span>
          User
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-muted-foreground/35 bg-muted/30">
            <User className="h-3 w-3" />
          </span>
          Assignee
        </span>
      )}
    </button>
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-56 p-1"
        align="end"
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={() => setSearch("")}
      >
        <input
          className="mb-1 w-full border-b border-border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground/50"
          placeholder="Search assignees..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
        <div className="max-h-48 overflow-y-auto overscroll-contain">
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent/50",
              !issue.assigneeAgentId && !issue.assigneeUserId && "bg-accent",
            )}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssign(null, null); }}
          >
            No assignee
          </button>
          {currentUserId && (
            <button
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50",
                issue.assigneeUserId === currentUserId && "bg-accent",
              )}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssign(null, currentUserId); }}
            >
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span>Me</span>
            </button>
          )}
          {(agents ?? [])
            .filter((agent) => !search.trim() || agent.name.toLowerCase().includes(search.toLowerCase()))
            .map((agent) => (
              <button
                key={agent.id}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-accent/50",
                  issue.assigneeAgentId === agent.id && "bg-accent",
                )}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAssign(agent.id, null); }}
              >
                <Identity name={agent.name} size="sm" className="min-w-0" />
              </button>
            ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
