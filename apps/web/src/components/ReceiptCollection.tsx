import type { ReactNode } from "react"
import { Link } from "react-router"
import { ArrowUpRight } from "lucide-react"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { matchesSearch, useCollectionState, withinDates } from "../lib/collections"
import type { Branch, ReceiptSummary } from "../lib/types"
import { CollectionControls, CollectionPagination } from "./CollectionControls"

interface Props {
  receipts: (ReceiptSummary & { branch_name?: string })[]
  branches: Pick<Branch, "id" | "name">[]
  loading: boolean
  error: string
  onRetry: () => void | Promise<void>
  receiptUrl: (id: string) => string
  title: string
  subtitle: string
  actions?: ReactNode
}

const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(Number(value))
const dateTime = (value: string) => new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(new Date(value))

export function ReceiptCollection({ receipts, branches, loading, error, onRetry, receiptUrl, title, subtitle, actions }: Props) {
  const filters = useCollectionState("comprobantes")
  const branchName = (item: Props["receipts"][number]) => item.branch_name ?? branches.find((branch) => branch.id === item.branch_id)?.name ?? "Sucursal"
  const filtered = receipts.filter((item) => matchesSearch(filters.get("q"), `HOME-I-${String(item.number).padStart(6, "0")}`, item.client_name, item.barber_name, branchName(item)) &&
    (!filters.get("branch") || item.branch_id === filters.get("branch")) && withinDates(item.issued_at, filters.get("from"), filters.get("to"))
  ).sort((a, b) => filters.get("sort") === "oldest" ? Date.parse(a.issued_at) - Date.parse(b.issued_at) : filters.get("sort") === "total-desc" ? b.total - a.total : filters.get("sort") === "total-asc" ? a.total - b.total : Date.parse(b.issued_at) - Date.parse(a.issued_at))
  const page = filters.paginate(filtered)

  return <section><div className="panel-heading"><div><h2>{title}</h2><p className="section-subtitle">{subtitle}</p></div><div className="owner-receipt-heading-actions"><Badge variant="secondary">{receipts.length} registros</Badge>{actions}</div></div>
    <CollectionControls state={filters} searchLabel="Buscar número, cliente o barbero" sorts={[{ value: "newest", label: "Más recientes" }, { value: "oldest", label: "Más antiguos" }, { value: "total-desc", label: "Mayor total" }, { value: "total-asc", label: "Menor total" }]}>
      <Field><FieldLabel htmlFor="comprobantes-branch">Sucursal</FieldLabel><NativeSelect id="comprobantes-branch" value={filters.get("branch")} onChange={(event) => filters.update("branch", event.target.value)}><NativeSelectOption value="">Todas las sucursales</NativeSelectOption>{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="comprobantes-from">Desde</FieldLabel><Input id="comprobantes-from" type="date" max={filters.get("to") || undefined} value={filters.get("from")} onChange={(event) => filters.update("from", event.target.value)} /></Field>
      <Field><FieldLabel htmlFor="comprobantes-to">Hasta</FieldLabel><Input id="comprobantes-to" type="date" min={filters.get("from") || undefined} value={filters.get("to")} onChange={(event) => filters.update("to", event.target.value)} /></Field>
    </CollectionControls>
    {loading ? <div className="owner-receipt-skeleton" aria-label="Cargando comprobantes" aria-busy="true">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-20 w-full" />)}</div> : error ? <div className="empty-state" role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={() => void onRetry()}>Volver a intentar</Button></div> : page.items.length ? <div className="collection-results" data-layout={filters.layout}>{page.items.map((item) => <Link className="collection-item receipt-collection-item" key={item.id} to={receiptUrl(item.id)}>
      <div className="collection-item-main"><h3>HOME-I-{String(item.number).padStart(6, "0")}</h3><p>{item.client_name}</p><p className="muted-line">Atendió: {item.barber_name}</p></div><div className="collection-item-meta"><strong>{money(item.total)}</strong><span>{dateTime(item.issued_at)}</span><span>{branchName(item)}</span></div><span className="collection-item-actions">Ver comprobante<ArrowUpRight aria-hidden="true" /></span>
    </Link>)}</div> : <div className="empty-state">{receipts.length ? "No hay comprobantes que coincidan con los filtros." : "Aún no hay comprobantes internos emitidos."}</div>}
    {!loading && !error && <CollectionPagination state={filters} result={page} />}
  </section>
}
