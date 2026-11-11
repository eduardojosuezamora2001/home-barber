import type { ReactNode } from "react"
import { LayoutGrid, List, Search, X, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from "@workspace/ui/components/pagination"
import { pageWindow, type CollectionPage, type CollectionState } from "../lib/collections"

interface Props {
  state: CollectionState
  searchLabel: string
  sorts: { value: string; label: string }[]
  children?: ReactNode
}

export function CollectionControls({ state, searchLabel, sorts, children }: Props) {
  const id = state.scope
  return <div className="collection-controls" role="search" aria-label={`Filtros de ${id}`}>
    <div className="collection-toolbar">
      <Field className="collection-search"><FieldLabel htmlFor={`${id}-search`}>{searchLabel}</FieldLabel><div className="collection-search-input"><Search aria-hidden="true" /><Input id={`${id}-search`} type="search" value={state.get("q")} onChange={(event) => state.update("q", event.target.value)} placeholder="Escribe para buscar…" /></div></Field>
      <Field><FieldLabel htmlFor={`${id}-sort`}>Ordenar por</FieldLabel><NativeSelect id={`${id}-sort`} value={state.get("sort") || sorts[0]?.value} onChange={(event) => state.update("sort", event.target.value)}>{sorts.map((sort) => <NativeSelectOption key={sort.value} value={sort.value}>{sort.label}</NativeSelectOption>)}</NativeSelect></Field>
      <div className="collection-view"><span id={`${id}-view-label`}>Vista</span><div role="group" aria-labelledby={`${id}-view-label`}><Button type="button" size="sm" variant={state.layout === "list" ? "secondary" : "outline"} aria-pressed={state.layout === "list"} onClick={() => state.update("view", "list")}><List data-icon="inline-start" />Lista</Button><Button type="button" size="sm" variant={state.layout === "grid" ? "secondary" : "outline"} aria-pressed={state.layout === "grid"} onClick={() => state.update("view", "grid")}><LayoutGrid data-icon="inline-start" />Cuadrícula</Button></div></div>
    </div>
    <div className="collection-filters">{children}<Button type="button" variant="ghost" size="sm" onClick={state.clear}><X data-icon="inline-start" />Limpiar filtros</Button></div>
  </div>
}

export function CollectionPagination({ state, result }: { state: CollectionState; result: CollectionPage }) {
  return <div className="collection-pagination">
    <p role="status" aria-live="polite">{result.first}–{result.last} de {result.total} resultados</p>
    <Field className="collection-page-size"><FieldLabel htmlFor={`${state.scope}-size`}>Por página</FieldLabel><NativeSelect id={`${state.scope}-size`} value={state.pageSize} onChange={(event) => state.update("size", event.target.value)}>{[6, 12, 24].map((size) => <NativeSelectOption key={size} value={size}>{size}</NativeSelectOption>)}</NativeSelect></Field>
    <Pagination aria-label={`Páginas de ${state.scope}`}><PaginationContent>
      <PaginationItem><Button type="button" variant="outline" size="sm" aria-label="Página anterior" disabled={result.page <= 1} onClick={() => state.update("page", String(result.page - 1))}><ChevronLeft data-icon="inline-start" /><span className="collection-page-word">Anterior</span></Button></PaginationItem>
      {pageWindow(result.pages, result.page).map((page, index) => <PaginationItem key={page === "gap" ? `gap-${index}` : page}>{page === "gap" ? <PaginationEllipsis /> : <Button type="button" variant={page === result.page ? "secondary" : "ghost"} size="sm" aria-current={page === result.page ? "page" : undefined} aria-label={`Página ${page}`} onClick={() => state.update("page", String(page))}>{page}</Button>}</PaginationItem>)}
      <PaginationItem><Button type="button" variant="outline" size="sm" aria-label="Página siguiente" disabled={result.page >= result.pages} onClick={() => state.update("page", String(result.page + 1))}><span className="collection-page-word">Siguiente</span><ChevronRight data-icon="inline-end" /></Button></PaginationItem>
    </PaginationContent></Pagination>
  </div>
}
