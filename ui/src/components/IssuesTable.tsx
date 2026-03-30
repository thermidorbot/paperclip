import { useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { Link } from "@/lib/router";
import { cn } from "../lib/utils";
import { usePretext } from "../hooks/usePretext";
import { timeAgo } from "../lib/timeAgo";
import { StatusIcon } from "./StatusIcon";
import { PriorityIcon } from "./PriorityIcon";
import { InlineEdit } from "./InlineEdit";
import { AssigneePicker } from "./AssigneePicker";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Issue } from "@paperclipai/shared";

interface Agent {
  id: string;
  name: string;
}

export interface IssuesTableHandle {
  /** Focus a row by index */
  focusRow: (index: number) => void;
}

interface IssuesTableProps {
  issues: Issue[];
  agents?: Agent[];
  currentUserId?: string | null;
  agentName: (id: string | null) => string | null;
  liveIssueIds?: Set<string>;
  issueLinkState?: unknown;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  sortField?: string;
  sortDir?: "asc" | "desc";
  onSort?: (field: string) => void;
  selectedIssueId?: string | null;
  onSelectIssue?: (id: string) => void;
  /** Set of selected issue IDs for bulk actions */
  checkedIds?: Set<string>;
  onToggleChecked?: (id: string) => void;
  /** Sub-issues: set of expanded parent IDs */
  expandedParents?: Set<string>;
  onToggleExpand?: (id: string) => void;
  /** Map from parentId -> child issues (for sub-issue rendering) */
  childrenMap?: Map<string, Issue[]>;
}

const columns = [
  { key: "identifier", label: "ID", width: "w-[90px]" },
  { key: "title", label: "Title", width: "flex-1 min-w-[200px]" },
  { key: "status", label: "Status", width: "w-[120px]" },
  { key: "priority", label: "Priority", width: "w-[100px]" },
  { key: "assignee", label: "Assignee", width: "w-[160px]" },
  { key: "labels", label: "Labels", width: "w-[180px]" },
  { key: "updated", label: "Updated", width: "w-[100px]" },
] as const;

type SortableField = "identifier" | "title" | "status" | "priority" | "updated";
const sortableFields = new Set<string>(["identifier", "title", "status", "priority", "updated"]);

function SortArrow({ field, sortField, sortDir }: { field: string; sortField?: string; sortDir?: string }) {
  if (field !== sortField) return null;
  return <span className="ml-0.5 text-[10px]">{sortDir === "asc" ? "\u2191" : "\u2193"}</span>;
}

/* ── Table Row ── */

function TableRow({
  issue,
  agents,
  currentUserId,
  agentName,
  isLive,
  issueLinkState,
  onUpdateIssue,
  isSelected,
  onSelect,
  isChecked,
  onToggleChecked,
  indent = 0,
  hasChildren,
  isExpanded,
  onToggleExpand,
}: {
  issue: Issue;
  agents?: Agent[];
  currentUserId?: string | null;
  agentName: (id: string | null) => string | null;
  isLive?: boolean;
  issueLinkState?: unknown;
  onUpdateIssue: (id: string, data: Record<string, unknown>) => void;
  isSelected?: boolean;
  onSelect?: () => void;
  isChecked?: boolean;
  onToggleChecked?: () => void;
  indent?: number;
  hasChildren?: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const identifier = issue.identifier ?? issue.id.slice(0, 8);

  const { containerRef: titleRef, style: titleStyle } = usePretext(issue.title, {
    font: "14px Inter, system-ui, sans-serif",
    lineHeight: 20,
    maxLines: 1,
  });

  return (
    <div
      className={cn(
        "group flex items-center border-b border-border text-sm transition-colors hover:bg-accent/30",
        isSelected && "bg-accent/50",
        isChecked && "bg-blue-50 dark:bg-blue-950/20",
      )}
      onClick={onSelect}
      data-issue-id={issue.id}
    >
      {/* Checkbox */}
      <div className="w-8 shrink-0 flex items-center justify-center">
        <input
          type="checkbox"
          checked={isChecked ?? false}
          onChange={(e) => {
            e.stopPropagation();
            onToggleChecked?.();
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-3.5 w-3.5 rounded border-border opacity-0 group-hover:opacity-100 transition-opacity data-[checked]:opacity-100"
          style={{ opacity: isChecked ? 1 : undefined }}
        />
      </div>

      {/* Identifier */}
      <div className="w-[90px] shrink-0 px-2 py-1.5 flex items-center gap-1">
        {indent > 0 && <span style={{ width: indent * 16 }} className="shrink-0" />}
        {hasChildren && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
            className="shrink-0 p-0.5 rounded hover:bg-accent/50 text-muted-foreground"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
        {!hasChildren && indent > 0 && <span className="w-4 shrink-0" />}
        <Link
          to={`/issues/${issue.identifier ?? issue.id}`}
          state={issueLinkState}
          className="font-mono text-xs text-muted-foreground hover:text-foreground no-underline"
          onClick={(e) => e.stopPropagation()}
        >
          {identifier}
        </Link>
        {isLive && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
        )}
      </div>

      {/* Title (inline editable) */}
      <div className="flex-1 min-w-[200px] px-2 py-1.5 truncate">
        <span ref={titleRef} style={titleStyle}>
          <InlineEdit
            value={issue.title}
            onSave={(title) => onUpdateIssue(issue.id, { title })}
            className="text-sm"
          />
        </span>
      </div>

      {/* Status */}
      <div className="w-[120px] shrink-0 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <StatusIcon
          status={issue.status}
          onChange={(s) => onUpdateIssue(issue.id, { status: s })}
          showLabel
        />
      </div>

      {/* Priority */}
      <div className="w-[100px] shrink-0 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <PriorityIcon
          priority={issue.priority}
          onChange={(p) => onUpdateIssue(issue.id, { priority: p })}
          showLabel
        />
      </div>

      {/* Assignee */}
      <div className="w-[160px] shrink-0 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <AssigneePicker
          issue={issue}
          agents={agents}
          currentUserId={currentUserId}
          agentName={agentName}
          onAssign={(id, agentId, userId) => onUpdateIssue(id, { assigneeAgentId: agentId, assigneeUserId: userId })}
          compact
        />
      </div>

      {/* Labels */}
      <div className="w-[180px] shrink-0 px-2 py-1.5 overflow-hidden">
        <div className="flex items-center gap-1 overflow-hidden">
          {(issue.labels ?? []).slice(0, 2).map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium shrink-0"
              style={{
                borderColor: label.color,
                color: label.color,
                backgroundColor: `${label.color}1f`,
              }}
            >
              {label.name}
            </span>
          ))}
          {(issue.labels ?? []).length > 2 && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              +{(issue.labels ?? []).length - 2}
            </span>
          )}
        </div>
      </div>

      {/* Updated */}
      <div className="w-[100px] shrink-0 px-2 py-1.5 text-xs text-muted-foreground">
        {timeAgo(issue.updatedAt)}
      </div>
    </div>
  );
}

/* ── Main Table ── */

export const IssuesTable = forwardRef<IssuesTableHandle, IssuesTableProps>(function IssuesTable(
  {
    issues,
    agents,
    currentUserId,
    agentName,
    liveIssueIds,
    issueLinkState,
    onUpdateIssue,
    sortField,
    sortDir,
    onSort,
    selectedIssueId,
    onSelectIssue,
    checkedIds,
    onToggleChecked,
    expandedParents,
    onToggleExpand,
    childrenMap,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focusRow(index: number) {
      const rows = containerRef.current?.querySelectorAll("[data-issue-id]");
      if (rows && rows[index]) {
        (rows[index] as HTMLElement).scrollIntoView({ block: "nearest" });
        const id = (rows[index] as HTMLElement).dataset.issueId;
        if (id) onSelectIssue?.(id);
      }
    },
  }));

  const handleSort = useCallback((field: string) => {
    if (sortableFields.has(field)) {
      onSort?.(field);
    }
  }, [onSort]);

  /** Render a row + its children if expanded */
  const renderRow = (issue: Issue, indent: number) => {
    const children = childrenMap?.get(issue.id);
    const hasChildren = !!children && children.length > 0;
    const isExpanded = expandedParents?.has(issue.id) ?? false;

    return (
      <div key={issue.id}>
        <TableRow
          issue={issue}
          agents={agents}
          currentUserId={currentUserId}
          agentName={agentName}
          isLive={liveIssueIds?.has(issue.id)}
          issueLinkState={issueLinkState}
          onUpdateIssue={onUpdateIssue}
          isSelected={selectedIssueId === issue.id}
          onSelect={() => onSelectIssue?.(issue.id)}
          isChecked={checkedIds?.has(issue.id)}
          onToggleChecked={() => onToggleChecked?.(issue.id)}
          indent={indent}
          hasChildren={hasChildren}
          isExpanded={isExpanded}
          onToggleExpand={() => onToggleExpand?.(issue.id)}
        />
        {hasChildren && isExpanded && children!.map((child) => renderRow(child, indent + 1))}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="border border-border rounded-md overflow-x-auto">
      {/* Header */}
      <div className="flex items-center bg-muted/30 border-b border-border text-xs font-medium text-muted-foreground sticky top-0">
        <div className="w-8 shrink-0" />
        {columns.map((col) => (
          <div
            key={col.key}
            className={cn(
              "px-2 py-2 shrink-0",
              col.width,
              sortableFields.has(col.key) && "cursor-pointer hover:text-foreground select-none",
            )}
            onClick={() => handleSort(col.key)}
          >
            {col.label}
            <SortArrow field={col.key} sortField={sortField} sortDir={sortDir} />
          </div>
        ))}
      </div>

      {/* Rows */}
      <div>
        {issues.map((issue) => renderRow(issue, issue.parentId ? 0 : 0))}
      </div>

      {issues.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No issues match the current filters.
        </div>
      )}
    </div>
  );
});
