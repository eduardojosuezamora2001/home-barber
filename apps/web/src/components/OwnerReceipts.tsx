import { useCallback, useEffect, useState } from "react"
import { Link, useLocation } from "react-router"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { api } from "../lib/api"
import type { Appointment, PublicData, ReceiptSummary, ServiceReceipt } from "../lib/types"
import { ReceiptDocument } from "./ReceiptDocument"
import { OwnerReceiptForm } from "./OwnerReceiptForm"
import { ReceiptCollection } from "./ReceiptCollection"

export function OwnerReceipts({ data, appointments, onCreated }: { data: PublicData | null; appointments: Appointment[]; onCreated: () => void | Promise<void> }) {
  const location = useLocation()
  const isNew = location.hash === "#comprobantes/nuevo"
  const receiptId = location.hash.startsWith("#comprobantes/") && !isNew ? location.hash.slice("#comprobantes/".length) : null
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([])
  const [receipt, setReceipt] = useState<ServiceReceipt | null>(null)
  const [failedReceiptId, setFailedReceiptId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState("")

  const listUrl = `/admin${location.search}#comprobantes`
  const refresh = useCallback(async () => {
    try {
      const all: ReceiptSummary[] = []
      // Fetch every batch instead of silently hiding receipts after record 200.
      for (let offset = 0; ; offset += 200) {
        const batch = (await api.get<{ receipts: ReceiptSummary[] }>(`/owner/receipts?offset=${offset}`)).receipts
        all.push(...batch)
        if (batch.length < 200) break
      }
      setReceipts(all)
      setLoadError("")
    }
    catch (error) { setLoadError(error instanceof Error ? error.message : "No se pudieron cargar los comprobantes.") }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])
  useEffect(() => {
    if (!receiptId) return
    void api.get<ServiceReceipt>(`/owner/receipts/${encodeURIComponent(receiptId)}`).then(setReceipt).catch((error) => { setFailedReceiptId(receiptId); toast.error(error instanceof Error ? error.message : "No se pudo cargar el comprobante.") })
  }, [receiptId])

  const errorMessage = loadError ? <div className="empty-state" role="alert"><p>{loadError}</p><Button type="button" variant="outline" onClick={() => void refresh()}>Volver a intentar</Button></div> : null

  if (isNew) return errorMessage ?? (data && !loading ? <OwnerReceiptForm data={data} appointments={appointments} receipts={receipts} onCreated={async () => { await onCreated(); await refresh() }} /> : <div className="owner-receipt-skeleton"><Skeleton className="h-48 w-full" /><Skeleton className="h-48 w-full" /></div>)
  if (receiptId) return receipt?.id === receiptId ? <ReceiptDocument receipt={receipt} backTo={listUrl} /> : failedReceiptId === receiptId ? <div className="empty-state">No se pudo cargar el comprobante. <Link to={listUrl}>Volver al listado</Link></div> : <div className="owner-receipt-skeleton"><Skeleton className="h-8 w-52" /><Skeleton className="h-48 w-full" /><Skeleton className="h-28 w-full" /></div>
  return <ReceiptCollection title="Comprobantes de todas las sucursales" subtitle="El propietario puede revisar cada atención registrada." receipts={receipts} branches={data?.branches ?? []} loading={loading} error={loadError} onRetry={refresh} receiptUrl={(id) => `/admin${location.search}#comprobantes/${id}`} actions={<Link className="owner-receipt-create" to={`/admin${location.search}#comprobantes/nuevo`}>Nuevo comprobante</Link>} />
}
