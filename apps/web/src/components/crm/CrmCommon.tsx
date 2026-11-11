import type { ReactNode } from "react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Skeleton } from "@workspace/ui/components/skeleton"

export function CrmHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="crm-heading">
    <div><h2>{title}</h2><p>{description}</p></div>
    {action && <div className="crm-heading-action">{action}</div>}
  </header>
}

export function CrmState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <Card className="crm-state-card">
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader>
    {action && <CardContent>{action}</CardContent>}
  </Card>
}

export function CrmError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <CrmState title="No se pudieron cargar los datos" description={message} action={<Button type="button" variant="outline" onClick={onRetry}>Reintentar</Button>} />
}

export function CrmLoading({ rows = 4 }: { rows?: number }) {
  return <Card className="crm-loading-card" aria-label="Cargando datos">
    <CardHeader><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-64 max-w-full" /></CardHeader>
    <CardContent className="crm-loading-rows">{Array.from({ length: rows }, (_, index) => <Skeleton key={index} className="h-12 w-full" />)}</CardContent>
  </Card>
}

export function CrmPager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  if (!total) return null
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  return <div className="crm-pager">
    <span>{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} de {total}</span>
    <div><Button type="button" size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>Anterior</Button>
      <span aria-label={`Página ${page} de ${lastPage}`}>{page} / {lastPage}</span>
      <Button type="button" size="sm" variant="outline" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>Siguiente</Button></div>
  </div>
}

export function CrmMetric({ label, value }: { label: string; value: number | string }) {
  return <div className="crm-metric"><span>{label}</span><strong>{value}</strong></div>
}
