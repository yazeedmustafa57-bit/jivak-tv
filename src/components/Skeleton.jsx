// Skeleton-Loader für Seitenwechsel und Ladezustände
export function Skeleton({ className = '', style }) {
  return <span className={`skeleton ${className}`} style={style} aria-hidden="true" />
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-cover" />
      <div className="skeleton-card-body">
        <div className="skeleton skeleton-line" style={{ width: '36%' }} />
        <div className="skeleton skeleton-line" style={{ width: '94%' }} />
        <div className="skeleton skeleton-line" style={{ width: '68%' }} />
        <div className="skeleton skeleton-line" style={{ width: '44%' }} />
      </div>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="container" style={{ paddingTop: 64, paddingBottom: 64 }}>
      <div className="skeleton skeleton-hero" />
      <div className="grid-3" style={{ marginTop: 40 }}>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
