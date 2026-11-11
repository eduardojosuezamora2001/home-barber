import { useSearchParams } from "react-router"

export type CollectionLayout = "grid" | "list"
export const normalizeText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-CR")
export const matchesSearch = (query: string, ...values: (string | null | undefined)[]) => !query.trim() || normalizeText(values.join(" ")).includes(normalizeText(query.trim()))
export const collectionDate = (value: string) => new Date(Date.parse(value) - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
export const withinDates = (value: string, from: string, to: string) => (!from || collectionDate(value) >= from) && (!to || collectionDate(value) <= to)

export function pageWindow(total: number, current: number): (number | "gap")[] {
  const pages = [...new Set([1, current - 1, current, current + 1, total].filter((page) => page > 0 && page <= total))].sort((a, b) => a - b)
  const result: (number | "gap")[] = []
  let previous = 0
  for (const page of pages) {
    if (previous && page - previous > 1) result.push("gap")
    result.push(page)
    previous = page
  }
  return result
}

export function useCollectionState(scope: string, defaultLayout: CollectionLayout = "list") {
  const [params, setParams] = useSearchParams()
  const get = (name: string) => params.get(`${scope}.${name}`) ?? ""
  const layout: CollectionLayout = get("view") === "grid" ? "grid" : get("view") === "list" ? "list" : defaultLayout
  const size = Number(get("size"))
  const pageSize = [6, 12, 24].includes(size) ? size : 6

  function update(name: string, value: string) {
    setParams((current) => {
      const next = new URLSearchParams(current)
      if (value) next.set(`${scope}.${name}`, value)
      else next.delete(`${scope}.${name}`)
      if (name !== "page" && name !== "view") next.delete(`${scope}.page`)
      return next
    }, { replace: name !== "page" })
  }

  function clear() {
    setParams((current) => {
      const next = new URLSearchParams(current)
      for (const key of [...next.keys()]) if (key.startsWith(`${scope}.`) && ![`${scope}.view`, `${scope}.size`].includes(key)) next.delete(key)
      return next
    }, { replace: true })
  }

  function paginate<T>(items: T[]) {
    const total = items.length
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const requested = Number(get("page"))
    const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total, pages, page, first: total ? (page - 1) * pageSize + 1 : 0, last: Math.min(page * pageSize, total) }
  }

  return { scope, get, layout, pageSize, update, clear, paginate }
}

export type CollectionState = ReturnType<typeof useCollectionState>
export interface CollectionPage { total: number; pages: number; page: number; first: number; last: number }
