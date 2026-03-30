import { useMemo, useState } from "react";
import { Link } from "@/lib/router";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { Identity } from "./Identity";
import { usePretext } from "../hooks/usePretext";
import { timeAgo } from "../lib/timeAgo";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Issue } from "@paperclipai/shared";

const boardStatuses = [
  "backlog",
  "todo",
  "in_progress",
  "in_review",
  "blocked",
  "done",
  "cancelled",
];

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Agent {
  id: string;
  name: string;
}

interface KanbanBoardProps {
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  childrenMap?: Map<string, Issue[]>;
  expandedParents?: Set<string>;
  onToggleExpand?: (id: string) => void;
}

/* ── Droppable Column ─�� */

function KanbanColumn({
  status,
  issues,
  agents,
  liveIssueIds,
  childrenMap,
  expandedParents,
  onToggleExpand,
}: {
  status: string;
  issues: Issue[];
  agents?: Agent[];
  liveIssueIds?: Set<string>;
  childrenMap?: Map<string, Issue[]>;
  expandedParents?: Set<string>;
  onToggleExpand?: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col min-w-[260px] w-[260px] shrink-0">
      <div className="flex items-center gap-2 px-2 py-2 mb-1">
        <StatusIcon status={status} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {statusLabel(status)}
        </span>
        <span className="text-xs text-muted-foreground/60 ml-auto tabular-nums">
          {issues.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 min-h-[120px] rounded-md p-1 space-y-1 transition-colors ${
          isOver ? "bg-accent/40" : "bg-muted/20"
        }`}
      >
        <SortableContext
          items={issues.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {issues.map((issue) => {
            const children = childrenMap?.get(issue.id);
            const hasChildren = !!children && children.length > 0;
            const isExpanded = expandedParents?.has(issue.id) ?? false;
            return (
              <div key={issue.id}>
                <KanbanCard
                  issue={issue}
                  agents={agents}
                  isLive={liveIssueIds?.has(issue.id)}
                  hasChildren={hasChildren}
                  isExpanded={isExpanded}
                  onToggleExpand={() => onToggleExpand?.(issue.id)}
                />
                {hasChildren && isExpanded && children!.map((child) => (
                  <SubIssueCard
                    key={child.id}
                    issue={child}
                    agents={agents}
                    isLive={liveIssueIds?.has(child.id)}
                  />
                ))}
              </div>
            );
          })}
        </SortableContext>
      </div>
    </div>
  );
}

/* ── Draggable Card (improved) ── */

function KanbanCard({
  issue,
  agents,
  isLive,
  isOverlay,
  hasChildren,
  isExpanded,
  onToggleExpand,
}: {
  issue: Issue;
  agents?: Agent[];
  isLive?: boolean;
  isOverlay?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue.id, data: { issue } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? "transform 200ms cubic-bezier(0.2, 0, 0, 1)",
  };

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  // Pretext for title (2-line max)
  const { containerRef: titleRef, style: titleStyle } = usePretext(issue.title, {
    font: "14px Inter, system-ui, sans-serif",
    lineHeight: 20,
    maxLines: 2,
  });

  // Pretext for description preview (2-line max)
  const descText = issue.description?.slice(0, 200) ?? "";
  const { containerRef: descRef, style: descStyle, lineCount: descLines } = usePretext(descText, {
    font: "12px Inter, system-ui, sans-serif",
    lineHeight: 16,
    maxLines: 2,
    disabled: !descText,
  });

  // Age indicator
  const age = timeAgo(issue.createdAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`rounded-md border bg-card p-2.5 cursor-grab active:cursor-grabbing transition-all duration-200 ${
        isDragging && !isOverlay ? "opacity-30 scale-95" : ""
      } ${isOverlay ? "shadow-lg ring-1 ring-primary/20 rotate-1 scale-105" : "hover:shadow-sm"}`}
    >
      <Link
        to={`/issues/${issue.identifier ?? issue.id}`}
        className="block no-underline text-inherit"
        onClick={(e) => {
          if (isDragging) e.preventDefault();
        }}
      >
        {/* Header: identifier + live dot + age */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          )}
          <span className="text-[10px] text-muted-foreground/50 ml-auto">{age}</span>
        </div>

        {/* Title with Pretext */}
        <p ref={titleRef} className="text-sm leading-snug mb-1" style={titleStyle}>
          {issue.title}
        </p>

        {/* Description preview with Pretext */}
        {descText && (
          <p
            ref={descRef}
            className="text-xs text-muted-foreground leading-4 mb-2"
            style={descStyle}
          >
            {descText}
          </p>
        )}

        {/* Labels */}
        {(issue.labels ?? []).length > 0 && (
          <div className="flex items-center gap-1 mb-2 flex-wrap">
            {(issue.labels ?? []).slice(0, 3).map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium"
                style={{
                  borderColor: label.color,
                  color: label.color,
                  backgroundColor: `${label.color}1f`,
                }}
              >
                {label.name}
              </span>
            ))}
            {(issue.labels ?? []).length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{(issue.labels ?? []).length - 3}
              </span>
            )}
          </div>
        )}

        {/* Footer: priority + assignee + sub-issues toggle */}
        <div className="flex items-center gap-2">
          <PriorityIcon priority={issue.priority} />
          {issue.assigneeAgentId && (() => {
            const name = agentName(issue.assigneeAgentId);
            return name ? (
              <Identity name={name} size="xs" />
            ) : (
              <span className="text-xs text-muted-foreground font-mono">
                {issue.assigneeAgentId.slice(0, 8)}
              </span>
            );
          })()}
          {hasChildren && (
            <button
              className="ml-auto flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleExpand?.();
              }}
            >
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <span>sub</span>
            </button>
          )}
        </div>
      </Link>
    </div>
  );
}

/* ── Sub-issue card (smaller, indented) ── */

function SubIssueCard({
  issue,
  agents,
  isLive,
}: {
  issue: Issue;
  agents?: Agent[];
  isLive?: boolean;
}) {
  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  return (
    <Link
      to={`/issues/${issue.identifier ?? issue.id}`}
      className="block no-underline text-inherit ml-3 mt-0.5"
    >
      <div className="rounded border border-dashed bg-card/50 p-2 text-xs hover:bg-accent/30 transition-colors">
        <div className="flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority} className="scale-90" />
          <span className="font-mono text-muted-foreground text-[10px]">
            {issue.identifier ?? issue.id.slice(0, 8)}
          </span>
          {isLive && (
            <span className="relative flex h-1.5 w-1.5 shrink-0">
              <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
          )}
        </div>
        <p className="line-clamp-1 mt-0.5">{issue.title}</p>
      </div>
    </Link>
  );
}

/* ── Main Board ── */

export function KanbanBoard({
  issues,
  agents,
  liveIssueIds,
  onUpdateIssue,
  childrenMap,
  expandedParents,
  onToggleExpand,
}: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Only show top-level issues in columns; sub-issues appear nested under parents
  const columnIssues = useMemo(() => {
    const grouped: Record<string, Issue[]> = {};
    for (const status of boardStatuses) {
      grouped[status] = [];
    }
    for (const issue of issues) {
      // Skip sub-issues from main columns (they render under their parent)
      if (issue.parentId) continue;
      if (grouped[issue.status]) {
        grouped[issue.status].push(issue);
      }
    }
    return grouped;
  }, [issues]);

  const activeIssue = useMemo(
    () => (activeId ? issues.find((i) => i.id === activeId) : null),
    [activeId, issues]
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const issueId = active.id as string;
    const issue = issues.find((i) => i.id === issueId);
    if (!issue) return;

    let targetStatus: string | null = null;

    if (boardStatuses.includes(over.id as string)) {
      targetStatus = over.id as string;
    } else {
      const targetIssue = issues.find((i) => i.id === over.id);
      if (targetIssue) {
        targetStatus = targetIssue.status;
      }
    }

    if (targetStatus && targetStatus !== issue.status) {
      onUpdateIssue(issueId, { status: targetStatus });
    }
  }

  function handleDragOver(_event: DragOverEvent) {
    // Visual feedback placeholder
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {boardStatuses.map((status) => (
          <KanbanColumn
            key={status}
            status={status}
            issues={columnIssues[status] ?? []}
            agents={agents}
            liveIssueIds={liveIssueIds}
            childrenMap={childrenMap}
            expandedParents={expandedParents}
            onToggleExpand={onToggleExpand}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <KanbanCard issue={activeIssue} agents={agents} isOverlay />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
