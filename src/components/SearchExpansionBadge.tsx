import React from "react";

/**
 * Small indicator shown in the search results header when the backend
 * expanded the query (synonym/fuzzy layer). Renders nothing when the
 * query was not expanded.
 */
export const SearchExpansionBadge: React.FC<{ expanded: boolean }> = ({
  expanded,
}) => {
  if (!expanded) return null;
  return (
    <span
      className="search-expansion-badge"
      title="Query expanded with synonyms / fuzzy matches"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "2px 6px",
        fontSize: "0.7rem",
        fontWeight: 600,
        borderRadius: "8px",
        background: "var(--accent-soft, rgba(120, 120, 255, 0.15))",
        color: "var(--accent)",
        border: "1px solid var(--border)",
        whiteSpace: "nowrap",
      }}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 12h16" />
        <path d="M14 6l6 6-6 6" />
      </svg>
      expanded
    </span>
  );
};
