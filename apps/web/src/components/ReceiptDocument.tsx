import { Link } from "react-router"
import { Printer } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import type { ServiceReceipt } from "../lib/types"
import { discountLabel } from "../lib/discounts"

const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(Number(value))
const issuedAt = (value: string) => new Intl.DateTimeFormat("es-CR", { dateStyle: "long", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(new Date(value))

export function ReceiptDocument({ receipt, backTo }: { receipt: Omit<ServiceReceipt, "issued_by">; backTo: string }) {
  return <div className="receipt-page">
    <div className="receipt-actions"><Link to={backTo}>← Volver a comprobantes</Link><Button onClick={() => window.print()}><Printer data-icon="inline-start" />Imprimir o guardar PDF</Button></div>
    <article className="receipt-document" aria-label={`Comprobante interno ${receipt.number}`}>
      <header><div><strong className="receipt-brand">HOME</strong><span>Barbería · {receipt.branch_name}</span></div><div className="receipt-number"><span>Comprobante interno</span><strong>HOME-I-{String(receipt.number).padStart(6, "0")}</strong></div></header>
      <div className="receipt-meta"><div><span>Emitido</span><strong>{issuedAt(receipt.issued_at)}</strong></div><div><span>Sucursal</span><strong>{receipt.branch_name}</strong></div><div><span>Moneda</span><strong>Colones costarricenses</strong></div></div>
      <div className="receipt-parties"><div><span>Cliente</span><strong>{receipt.client_name}</strong><small>{receipt.client_email ?? "Sin correo"}</small></div><div><span>Atendió</span><strong>{receipt.barber_name}</strong></div></div>
      <div className="receipt-lines"><div className="receipt-lines-head"><span>Servicio</span><span>Cant.</span><span>Precio</span><span>Total</span></div>{receipt.items.map((item, index) => <div className="receipt-line" key={`${item.serviceId}-${index}`}><strong>{item.name}</strong><span>{item.quantity}</span><span>{money(item.unitPrice)}</span><strong>{money(item.lineTotal)}</strong></div>)}</div>
      {receipt.coupon_code && <div className="receipt-discount"><p>Subtotal: {money(receipt.subtotal)}</p><p>{discountLabel({ discount_type: receipt.discount_type ?? "none", discount_value: receipt.discount_value ?? 0 })}: −{money(receipt.discount_amount ?? 0)}</p><p>{receipt.coupon_code} · {receipt.discount_description}</p></div>}
      <div className="receipt-total"><span>Total</span><strong>{money(receipt.total)}</strong></div>
      {receipt.note && <p className="receipt-note"><strong>Nota:</strong> {receipt.note}</p>}
      <footer>Registro interno de HOME. Este documento no es una factura electrónica ni un comprobante tributario autorizado por Hacienda.</footer>
    </article>
  </div>
}
