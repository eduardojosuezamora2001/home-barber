import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import type { ClientReceipt, ClientReceiptPage } from "../lib/types"
import { ReceiptCollection } from "./ReceiptCollection"
import { ReceiptDocument } from "./ReceiptDocument"

export function ClientReceipts() {
  const [params] = useSearchParams()
  const receiptId = params.get("comprobante") ?? params.get("factura")
  const [retry, setRetry] = useState(0)
  const [list, setList] = useState<{ retry: number; receipts?: ClientReceiptPage["receipts"]; error?: string } | null>(null)
  const [detail, setDetail] = useState<{ id: string; receipt?: ClientReceipt; error?: string } | null>(null)
  const listParams = new URLSearchParams(params)
  listParams.set("tab", "comprobantes")
  listParams.delete("comprobante")
  listParams.delete("factura")
  listParams.delete("facturasPagina")
  const listUrl = `/cliente?${listParams}`

  useEffect(() => {
    let active = true
    async function load() {
      const receipts: ClientReceiptPage["receipts"] = []
      for (let page = 1; ; page++) {
        const batch = await api.get<ClientReceiptPage>(`/client/receipts?page=${page}`)
        if (!active) return
        receipts.push(...batch.receipts)
        if (!batch.hasMore) break
      }
      if (active) setList({ retry, receipts })
    }
    void load().catch((error: unknown) => { if (active) setList({ retry, error: error instanceof Error ? error.message : "No se pudieron cargar los comprobantes." }) })
    return () => { active = false }
  }, [retry])

  useEffect(() => {
    if (!receiptId) return
    let active = true
    void api.get<ClientReceipt>(`/client/receipts/${encodeURIComponent(receiptId)}`).then(
      (receipt) => { if (active) setDetail({ id: receiptId, receipt }) },
      (error: unknown) => { if (active) setDetail({ id: receiptId, error: error instanceof Error ? error.message : "No se pudo cargar el comprobante." }) },
    )
    return () => { active = false }
  }, [receiptId])

  if (receiptId) return detail?.id === receiptId ? detail.receipt ? <ReceiptDocument receipt={detail.receipt} backTo={listUrl} /> : <div className="empty-state" role="alert"><p>{detail.error}</p><Link to={listUrl}>Volver al listado</Link></div> : <div className="owner-receipt-skeleton" aria-label="Cargando comprobante" aria-busy="true"><Skeleton className="h-8 w-52" /><Skeleton className="h-48 w-full" /><Skeleton className="h-28 w-full" /></div>

  const receipts = list?.receipts ?? []
  const branches = [...new Map(receipts.map((receipt) => [receipt.branch_id, { id: receipt.branch_id, name: receipt.branch_name }])).values()]
  return <ReceiptCollection title="Comprobantes" subtitle="Revisa cada atención registrada en tu cuenta." receipts={receipts} branches={branches} loading={list?.retry !== retry} error={list?.error ?? ""} onRetry={() => setRetry((value) => value + 1)} receiptUrl={(id) => {
    const next = new URLSearchParams(listParams)
    next.set("comprobante", id)
    return `/cliente?${next}`
  }} />
}
