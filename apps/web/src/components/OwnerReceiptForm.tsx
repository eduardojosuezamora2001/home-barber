import { useEffect, useMemo, useRef, useState, type FormEvent } from "react"
import { Link, useLocation, useNavigate } from "react-router"
import { LoaderCircle, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@workspace/ui/components/field"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { api } from "../lib/api"
import { calculateDiscount, discountLabel } from "../lib/discounts"
import type { CrmContactPickerValue } from "./crm/CrmContactPicker"
import { CrmContactAutocomplete } from "./crm/CrmContactAutocomplete"
import type { Appointment, PublicData, ReceiptCoupon, ReceiptSummary } from "../lib/types"

interface Props { data: PublicData; appointments: Appointment[]; receipts: ReceiptSummary[]; onCreated: () => void | Promise<void> }
interface Line { key: number; serviceId: string; quantity: string; unitPrice: string }
interface Client { id: string; full_name: string; email: string }
const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 2 }).format(value)
const dateTime = (value: string) => new Intl.DateTimeFormat("es-CR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Costa_Rica" }).format(new Date(value))

export function OwnerReceiptForm({ data, appointments, receipts, onCreated }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const [openedAt] = useState(() => Date.now())
  const today = new Date(openedAt - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [branchId, setBranchId] = useState("")
  const [client, setClient] = useState<Client | null>(null)
  const [crmContact, setCrmContact] = useState<CrmContactPickerValue | null>(null)
  const [barberId, setBarberId] = useState("")
  const [appointmentId, setAppointmentId] = useState("")
  const [lines, setLines] = useState<Line[]>([{ key: 1, serviceId: "", quantity: "1", unitPrice: "" }])
  const [saving, setSaving] = useState(false)
  const [couponResult, setCouponResult] = useState<{ key: string; coupons?: ReceiptCoupon[]; error?: string } | null>(null)
  const [selectedCoupon, setSelectedCoupon] = useState<ReceiptCoupon | null>(null)
  const [discountCode, setDiscountCode] = useState("")
  const [checkingCode, setCheckingCode] = useState(false)
  const [codeError, setCodeError] = useState("")
  const [couponRetry, setCouponRetry] = useState(0)
  const couponKey = `${client?.id ?? ""}:${branchId}:${couponRetry}`
  const couponContext = useRef(couponKey)
  const assigned = new Set(data.barberBranches.filter((item) => item.branch_id === branchId).map((item) => item.barber_id))
  const barbers = data.barbers.filter((item) => item.active && assigned.has(item.id))
  const billed = new Set(receipts.map((item) => item.appointment_id).filter(Boolean))
  const matches = appointments.filter((item) => item.branch_id === branchId && ((crmContact && item.contact_id === crmContact.id) || (client && item.client_id === client.id)) && item.barber_id === barberId && ["confirmed", "completed"].includes(item.status) && !billed.has(item.id) && Date.parse(item.requested_at) <= openedAt && new Date(Date.parse(item.requested_at) - 6 * 60 * 60 * 1000).toISOString().slice(0, 10) === today)
  const total = useMemo(() => lines.reduce((sum, item) => sum + (Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100), 0) / 100, [lines])
  const discount = calculateDiscount(total, selectedCoupon)

  useEffect(() => {
    couponContext.current = couponKey
    if (!client || !branchId) return
    let active = true
    void api.get<{ coupons: ReceiptCoupon[] }>(`/owner/receipt-coupons?clientId=${client.id}&branchId=${branchId}`).then(
      ({ coupons }) => { if (active) setCouponResult({ key: couponKey, coupons }) },
      (error: unknown) => { if (active) setCouponResult({ key: couponKey, error: error instanceof Error ? error.message : "No pudimos cargar los cupones." }) },
    )
    return () => { active = false }
  }, [client, branchId, couponKey])

  function clearCoupon() {
    setSelectedCoupon(null)
    setDiscountCode("")
    setCodeError("")
  }

  async function validateCode() {
    if (!client || !branchId || checkingCode) return
    const context = couponKey
    setCheckingCode(true)
    setCodeError("")
    setSelectedCoupon(null)
    try {
      const { coupons } = await api.get<{ coupons: ReceiptCoupon[] }>(`/owner/receipt-coupons?clientId=${client.id}&branchId=${branchId}&code=${encodeURIComponent(discountCode.trim().toUpperCase())}`)
      if (couponContext.current !== context) return
      setSelectedCoupon(coupons[0])
      setDiscountCode(coupons[0].code)
    } catch (error) { if (couponContext.current === context) setCodeError(error instanceof Error ? error.message : "No se pudo validar el código.") }
    finally { setCheckingCode(false) }
  }

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || checkingCode) return
    if (!branchId || (!client && !crmContact) || !barberId) { toast.error("Selecciona sucursal, cliente y empleado."); return }
    if (!barbers.some((item) => item.id === barberId)) { toast.error("El empleado no pertenece a esta sucursal."); return }
    if (matches.length && !appointmentId) { toast.error("Vincula la cita de hoy antes de emitir el comprobante."); return }
    const items = lines.map((item) => ({ serviceId: item.serviceId, quantity: Number(item.quantity), unitPrice: Number(item.unitPrice) }))
    if (items.some((item) => !item.serviceId || !Number.isInteger(item.quantity) || item.quantity < 1 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) { toast.error("Revisa los servicios, cantidades y precios."); return }
    if (!Number.isFinite(discount) || discount < 0 || discount > total) { toast.error("El descuento no puede superar el subtotal."); return }
    if (discountCode.trim() && !selectedCoupon) { setCodeError("Valida el código o bórralo antes de emitir."); return }
    const note = String(new FormData(event.currentTarget).get("note") || "").trim()
    setSaving(true)
    try {
      const receipt = await api.post<{ id: string; number: number }>("/owner/receipts", { branchId, clientId: client?.id ?? null, crmContactId: crmContact?.id ?? null, barberId, appointmentId: appointmentId || null, items, note, couponCode: selectedCoupon?.code ?? null })
      await onCreated()
      toast.success(`Comprobante HOME-I-${String(receipt.number).padStart(6, "0")} emitido.`)
      navigate(`/admin${location.search}#comprobantes/${receipt.id}`)
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo emitir el comprobante.") }
    finally { setSaving(false) }
  }

  return <section className="owner-receipt-form"><div className="panel-heading"><div><h2>Nuevo comprobante interno</h2><p className="section-subtitle">Registra una atención en cualquiera de las sucursales.</p></div><Link to={`/admin${location.search}#comprobantes`}>Volver al listado</Link></div>
    <Card><CardHeader><CardTitle>1. Seleccionar cliente</CardTitle><CardDescription>Busca en el CRM por nombre, correo o teléfono y selecciona al cliente. Los clientes sin cuenta no reciben puntos ni cupones.</CardDescription></CardHeader><CardContent><FieldGroup>
      <CrmContactAutocomplete role="owner" value={crmContact} disabled={saving || checkingCode} onChange={(value) => {
        setCrmContact(value)
        setClient(value?.profile_id ? { id: value.profile_id, full_name: value.full_name, email: value.email || "" } : null)
        setBranchId(""); setBarberId(""); setAppointmentId("")
        setLines([{ key: 1, serviceId: "", quantity: "1", unitPrice: "" }])
        clearCoupon()
      }} />
      {crmContact && <div className="manager-found-client" role="status"><Badge variant="secondary">{client ? "Cuenta seleccionada" : "Cliente de mostrador"}</Badge><strong>{crmContact.full_name}</strong><span>{crmContact.email || crmContact.phone || "Sin dato de contacto"}</span></div>}
    </FieldGroup></CardContent></Card>
    {(client || crmContact) && <form onSubmit={create}><Card><CardHeader><CardTitle>2. Servicios y cobro</CardTitle><CardDescription>Registra la atención y aplica un cupón antes de emitir el comprobante.</CardDescription></CardHeader><CardContent><FieldSet disabled={saving}><FieldGroup>
      <Field><FieldLabel htmlFor="owner-receipt-branch">Sucursal</FieldLabel><NativeSelect id="owner-receipt-branch" value={branchId} onChange={(event) => { setBranchId(event.target.value); setBarberId(""); setAppointmentId(""); clearCoupon() }} required><NativeSelectOption value="">Seleccionar sucursal</NativeSelectOption>{data.branches.map((item) => <NativeSelectOption value={item.id} key={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field>
      <Field><FieldLabel htmlFor="owner-receipt-barber">Empleado que realizó el servicio</FieldLabel><NativeSelect id="owner-receipt-barber" value={barberId} onChange={(event) => { setBarberId(event.target.value); setAppointmentId("") }} required><NativeSelectOption value="">Seleccionar empleado</NativeSelectOption>{barbers.map((item) => <NativeSelectOption value={item.id} key={item.id}>{item.display_name}</NativeSelectOption>)}</NativeSelect></Field>
      {(client || crmContact) && barberId && <Field><FieldLabel htmlFor="owner-receipt-appointment">Cita relacionada</FieldLabel><NativeSelect id="owner-receipt-appointment" value={appointmentId} onChange={(event) => setAppointmentId(event.target.value)} required={matches.length > 0}><NativeSelectOption value="">{matches.length ? "Selecciona la cita de hoy" : "Atención sin cita previa"}</NativeSelectOption>{matches.map((item) => <NativeSelectOption value={item.id} key={item.id}>{dateTime(item.requested_at)} · {item.status === "completed" ? "Atendida" : "Confirmada"}</NativeSelectOption>)}</NativeSelect></Field>}
      {lines.map((line, index) => <div className="manager-service-row" key={line.key}><Field><FieldLabel htmlFor={`owner-service-${line.key}`}>Servicio {index + 1}</FieldLabel><NativeSelect id={`owner-service-${line.key}`} value={line.serviceId} onChange={(event) => { const service = data.services.find((item) => item.id === event.target.value); updateLine(line.key, { serviceId: event.target.value, unitPrice: service?.price == null ? "" : String(service.price) }) }} required><NativeSelectOption value="">Seleccionar servicio</NativeSelectOption>{data.services.filter((item) => item.active).map((item) => <NativeSelectOption value={item.id} key={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field><Field><FieldLabel htmlFor={`owner-quantity-${line.key}`}>Cantidad</FieldLabel><Input id={`owner-quantity-${line.key}`} type="number" min="1" max="10" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required /></Field><Field><FieldLabel htmlFor={`owner-price-${line.key}`}>Precio ₡</FieldLabel><Input id={`owner-price-${line.key}`} type="number" min="0" max="1000000" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })} required /></Field><Button type="button" size="icon" variant="ghost" aria-label={`Quitar servicio ${index + 1}`} disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 /></Button></div>)}
      <Button type="button" variant="outline" disabled={lines.length >= 12} onClick={() => setLines((current) => [...current, { key: Math.max(...current.map((item) => item.key)) + 1, serviceId: "", quantity: "1", unitPrice: "" }])}><Plus data-icon="inline-start" />Añadir servicio</Button>
      <FieldSet><FieldLegend>Cupones y descuentos</FieldLegend><FieldDescription>Aplica un beneficio disponible de este cliente. Se canjea al emitir el comprobante.</FieldDescription>
        {!client ? <p>Los cupones requieren una cuenta registrada.</p> : !branchId ? <p>Selecciona una sucursal para consultar los cupones aplicables.</p> : couponResult?.key !== couponKey ? <p role="status">Cargando cupones…</p> : couponResult.error ? <div><FieldError>{couponResult.error}</FieldError><Button type="button" variant="outline" onClick={() => setCouponRetry((value) => value + 1)}>Volver a cargar cupones</Button></div> : <Field><FieldLabel htmlFor="receipt-coupon">Cupones disponibles</FieldLabel><NativeSelect id="receipt-coupon" value={selectedCoupon?.id ?? ""} disabled={checkingCode} onChange={(event) => { const coupon = couponResult.coupons?.find((item) => item.id === event.target.value); clearCoupon(); if (coupon) { setSelectedCoupon(coupon); setDiscountCode(coupon.code) } }}><NativeSelectOption value="">{couponResult.coupons?.length ? "Sin cupón aplicado" : "Este cliente no tiene cupones aplicables"}</NativeSelectOption>{couponResult.coupons?.map((coupon) => <NativeSelectOption key={coupon.id} value={coupon.id}>{discountLabel(coupon)} · {coupon.benefit_text} · {coupon.code}</NativeSelectOption>)}</NativeSelect></Field>}
        {client && <Field data-invalid={!!codeError}><FieldLabel htmlFor="receipt-discount-code">Código de descuento</FieldLabel><InputGroup><InputGroupInput id="receipt-discount-code" value={discountCode} maxLength={15} placeholder="HOME-XXXXXXXXXX" disabled={!branchId || checkingCode} onChange={(event) => { setDiscountCode(event.target.value); setSelectedCoupon(null); setCodeError("") }} aria-invalid={!!codeError} aria-describedby={codeError ? "receipt-code-error" : undefined} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void validateCode() } }} /><InputGroupAddon align="inline-end"><InputGroupButton type="button" disabled={!branchId || !discountCode.trim() || checkingCode} onClick={() => void validateCode()}>{checkingCode && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{checkingCode ? "Validando…" : "Aplicar código"}</InputGroupButton></InputGroupAddon></InputGroup>{codeError && <FieldError id="receipt-code-error">{codeError}</FieldError>}</Field>}
        {selectedCoupon && <><p role="status"><strong>{discountLabel(selectedCoupon)}</strong> · {selectedCoupon.title}: {selectedCoupon.benefit_text}. Vence {dateTime(selectedCoupon.expires_at)}.</p><FieldDescription>El descuento se calcula automáticamente sobre el subtotal, hasta cubrir su importe.</FieldDescription><Button type="button" variant="outline" onClick={clearCoupon}>Quitar cupón</Button></>}
      </FieldSet>
      <Field><FieldLabel htmlFor="owner-receipt-note">Nota interna</FieldLabel><Textarea id="owner-receipt-note" name="note" rows={2} maxLength={500} placeholder="Opcional" /></Field>
      {selectedCoupon && <p>Subtotal: {money(total)} · Descuento: {money(discount || 0)}</p>}
      <div className="manager-total"><span>Total del comprobante</span><strong>{money(Math.max(0, total - (discount || 0)))}</strong></div>
      <Button type="submit" disabled={saving || checkingCode || !barberId || !branchId}>{saving && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{saving ? "Emitiendo…" : "Emitir comprobante interno"}</Button>
    </FieldGroup></FieldSet></CardContent></Card></form>}
  </section>
}
