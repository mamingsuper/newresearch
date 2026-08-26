type ContentSkeletonProps = {
  count?: number;
  label?: string;
  variant: "paper" | "conversation" | "library";
};

export function ContentSkeleton({ count = 3, label = "Loading content", variant }: ContentSkeletonProps) {
  return (
    <div
      className={`content-skeleton${variant === "library" ? " skeleton-library" : ""}`}
      role="status"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonItem key={index} variant={variant} index={index + 1} />
      ))}
    </div>
  );
}

function SkeletonItem({ index, variant }: { index: number; variant: ContentSkeletonProps["variant"] }) {
  if (variant === "library") {
    return (
      <div className="skeleton-item" aria-hidden="true">
        <span className="library-paper-index">{String(index).padStart(2, "0")}</span>
        <div className="skeleton-body">
          <span className="skeleton-bar skeleton-bar--meta" />
          <span className="skeleton-bar skeleton-bar--title" />
          <span className="skeleton-bar skeleton-bar--short" />
          <div className="skeleton-copy">
            <span className="skeleton-bar skeleton-bar--long" />
            <span className="skeleton-bar" />
            <span className="skeleton-bar skeleton-bar--medium" />
          </div>
          <div className="skeleton-chips"><span className="skeleton-chip" /><span className="skeleton-chip" /></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`skeleton-item skeleton-card${variant === "conversation" ? " skeleton-card--conversation" : ""}`} aria-hidden="true">
      {variant === "paper" && <span className="skeleton-dot" />}
      <div className="skeleton-body">
        <span className="skeleton-bar skeleton-bar--meta" />
        <span className="skeleton-bar skeleton-bar--title" />
        <span className="skeleton-bar skeleton-bar--short" />
        <div className="skeleton-copy">
          <span className="skeleton-bar skeleton-bar--long" />
          <span className="skeleton-bar skeleton-bar--medium" />
        </div>
        {variant === "paper" && (
          <div className="skeleton-chips"><span className="skeleton-chip" /><span className="skeleton-chip" /></div>
        )}
      </div>
    </div>
  );
}
