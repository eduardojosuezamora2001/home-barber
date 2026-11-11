import { Skeleton } from "@workspace/ui/components/skeleton"

export function BookingSkeleton() {
  return <section className="booking-section booking-skeleton" aria-label="Cargando reservas"><div className="section-heading-row"><Skeleton className="skeleton-heading" /><Skeleton className="skeleton-copy" /></div><div className="booking-layout"><Skeleton className="skeleton-photo" /><div className="skeleton-form"><div className="form-grid"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><Skeleton /><div className="form-grid"><Skeleton /><Skeleton /></div><Skeleton className="skeleton-note" /><Skeleton className="skeleton-button" /></div></div></section>
}

export function AreaSkeleton() {
  return <div className="area-shell area-skeleton" role="status" aria-label="Cargando tu espacio"><div className="area-header"><strong className="area-brand">HOME<span>Barbería</span></strong><Skeleton className="skeleton-area-nav" /></div><div className="area-main"><Skeleton className="skeleton-area-title" /><Skeleton className="skeleton-area-subtitle" /><div className="metrics-strip"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div><div className="area-columns"><Skeleton className="skeleton-area-panel" /><Skeleton className="skeleton-area-panel" /></div></div></div>
}
