import { useMemo, useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { availableSlots, costaRicaToday, dateChoices, displayDate, toUtc, whatsappUrl } from "../lib/booking"
import { api } from "../lib/api"
import type { Profile, PublicData, SessionUser } from "../lib/types"

interface Props {
  data: PublicData | null
  user: SessionUser | null
  profile: Profile | null
  preferredServiceId: string
  branchId: string
  onBranchChange: (branchId: string) => void
  compact?: boolean
  onCreated?: () => void | Promise<void>
}

export function BookingSection({ data, user, profile, preferredServiceId, branchId, onBranchChange, compact = false, onCreated }: Props) {
  const [serviceId, setServiceId] = useState("")
  const [barberId, setBarberId] = useState("")
  const [date, setDate] = useState(costaRicaToday())
  const [time, setTime] = useState("")
  const [name, setName] = useState(profile?.full_name || "")
  const [phone, setPhone] = useState(profile?.phone || "")
  const [notes, setNotes] = useState("")
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState("")
  const [fallbackUrl, setFallbackUrl] = useState("")
  const [marketingConsent, setMarketingConsent] = useState(false)

  const selectedBranchId = branchId || data?.branches[0]?.id || ""
  const selectedServiceId = serviceId || preferredServiceId || data?.services[0]?.id || ""
  const branch = data?.branches.find((item) => item.id === selectedBranchId)
  const service = data?.services.find((item) => item.id === selectedServiceId)
  const eligibleBarbers = data?.barbers.filter((item) =>
    data.barberBranches.some((member) => member.branch_id === selectedBranchId && member.barber_id === item.id)
  ) ?? []
  const selectedBarberId = eligibleBarbers.some((item) => item.id === barberId) ? barberId : eligibleBarbers[0]?.id || ""
  const barber = eligibleBarbers.find((item) => item.id === selectedBarberId)
  const days = useMemo(() => dateChoices(), [])
  const slots = data ? availableSlots(date, selectedBranchId, selectedBarberId, service, data.branchHours, data.barberHours, data.barberBlocks) : []
  const selectedTime = slots.includes(time) ? time : ""

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const customerName = (name || profile?.full_name || "").trim()
    const enteredPhone = phone.replace(/\D/g, "")
    const customerPhone = enteredPhone.length === 8 ? `506${enteredPhone}` : enteredPhone
    if (!branch || !service || !barber || !selectedTime || !customerName || customerPhone.length < 8 || customerPhone.length > 15) {
      setMessage("Completa los datos y elige un horario disponible para consultar.")
      return
    }
    const appointmentTime = toUtc(date, selectedTime)
    const whatsappMessage = [
      "Hola, quiero consultar una cita en HOME.",
      `Sede: ${branch.name}`,
      `Servicio: ${service.name}`,
      `Barbero: ${barber.display_name}`,
      `Fecha: ${displayDate(date)}`,
      `Hora: ${selectedTime}`,
      `Nombre: ${customerName}`,
      `Mi WhatsApp: +${customerPhone}`,
      notes.trim() ? `Nota: ${notes.trim()}` : "",
      "Quedo pendiente de su confirmación.",
    ].filter(Boolean).join("\n")
    const url = whatsappUrl(branch.whatsapp, whatsappMessage)
    const popup = window.open("about:blank", "_blank")
    if (popup) popup.opener = null
    setWorking(true)
    setMessage("")
    setFallbackUrl("")
    if (user) {
      try {
        await api.post("/appointments", { branchId: branch.id, barberId: barber.id, serviceId: service.id, requestedAt: appointmentTime, customerName, customerWhatsapp: customerPhone, notes: notes.trim() })
        setMessage("Solicitud guardada. Confirma la cita con el negocio por WhatsApp.")
        setTime("")
        void onCreated?.()
      } catch (error) {
        popup?.close()
        setMessage(`No se guardó la solicitud en tu cuenta (${error instanceof Error ? error.message : "Error inesperado"}). Inténtalo de nuevo o continúa por WhatsApp sin guardarla.`)
        setFallbackUrl(url)
        setWorking(false)
        return
      }
    } else {
      try {
        await api.post("/inquiries", {
          branchId: branch.id,
          barberId: barber.id,
          serviceId: service.id,
          requestedAt: appointmentTime,
          customerName,
          customerWhatsapp: customerPhone,
          notes: notes.trim(),
          marketingConsent,
        })
        setMessage("Consulta registrada. HOME confirmará la disponibilidad contigo por WhatsApp.")
      } catch {
        setMessage("WhatsApp abierto. No pudimos guardar tu consulta en HOME; envía el mensaje para coordinarla.")
      }
    }
    if (popup) popup.location.href = url
    else window.location.assign(url)
    setWorking(false)
  }

  return (
    <section className="booking-section" data-compact={compact} aria-labelledby={compact ? undefined : "booking-title"} aria-label={compact ? "Solicitar una nueva cita" : undefined}>
      {!compact && <div className="section-heading-row">
        <h2 id="booking-title">Haz espacio para ti</h2>
        <p>Elige el momento. Nosotros confirmamos los detalles contigo por WhatsApp.</p>
      </div>}
      <div className="booking-layout">
        {!compact && <div className="booking-aside">
          <img src="/images/home-finish.webp" alt="Acabado de un corte de cabello, imagen ilustrativa" loading="lazy" width="1024" height="1280" decoding="async" />
          <p>Tu próxima visita empieza aquí.</p>
        </div>}
        <form onSubmit={submit} className="booking-form">
          <FieldGroup>
            <div className="form-grid">
              <Field><FieldLabel htmlFor="branch">Sucursal</FieldLabel><NativeSelect className="w-full" id="branch" value={selectedBranchId} onChange={(event) => { onBranchChange(event.target.value); setBarberId(""); setTime("") }} required>{data?.branches.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name}</NativeSelectOption>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="service">Servicio</FieldLabel><NativeSelect className="w-full" id="service" value={selectedServiceId} onChange={(event) => { setServiceId(event.target.value); setTime("") }} required>{data?.services.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.name} · {item.duration_minutes} min</NativeSelectOption>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="barber">Barbero</FieldLabel><NativeSelect className="w-full" id="barber" value={selectedBarberId} onChange={(event) => { setBarberId(event.target.value); setTime("") }} required>{eligibleBarbers.map((item) => <NativeSelectOption key={item.id} value={item.id}>{item.display_name}</NativeSelectOption>)}</NativeSelect></Field>
              <Field><FieldLabel htmlFor="date">Fecha</FieldLabel><NativeSelect className="w-full" id="date" value={date} onChange={(event) => { setDate(event.target.value); setTime("") }} required>{days.map((item) => <NativeSelectOption key={item} value={item}>{displayDate(item)}</NativeSelectOption>)}</NativeSelect></Field>
            </div>
            <Field><FieldLabel htmlFor="time">Hora para consultar</FieldLabel><NativeSelect className="w-full" id="time" value={selectedTime} onChange={(event) => setTime(event.target.value)} required><NativeSelectOption value="">Selecciona una hora</NativeSelectOption>{slots.map((item) => <NativeSelectOption key={item} value={item}>{item}</NativeSelectOption>)}</NativeSelect><p className="field-hint">{slots.length ? "Los horarios están sujetos a confirmación por WhatsApp." : "No hay horarios de consulta para esta combinación. Prueba otra fecha o barbero."}</p></Field>
            <div className="form-grid">
              <Field><FieldLabel htmlFor="customer-name">Tu nombre</FieldLabel><Input id="customer-name" value={name} onChange={(event) => setName(event.target.value)} placeholder={profile?.full_name || "Nombre y apellido"} required={!profile?.full_name} /></Field>
              <Field><FieldLabel htmlFor="customer-phone">Tu WhatsApp</FieldLabel><Input id="customer-phone" inputMode="tel" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+506 0000 0000" required /></Field>
            </div>
            <Field><FieldLabel htmlFor="booking-notes">¿Algo que debamos saber? <span className="field-optional">Opcional</span></FieldLabel><Textarea id="booking-notes" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Cuéntanos si tienes alguna preferencia." rows={3} /></Field>
            {!user && <Field orientation="horizontal"><Checkbox id="booking-marketing-consent" checked={marketingConsent} onCheckedChange={setMarketingConsent} /><FieldLabel htmlFor="booking-marketing-consent">Acepto recibir por WhatsApp recordatorios de regreso y ofertas de HOME. Puedo pedir que dejen de enviármelos.</FieldLabel></Field>}
            {message && <p role="status" className="form-message">{message}</p>}
            {fallbackUrl && <a className="booking-fallback" href={fallbackUrl} target="_blank" rel="noopener noreferrer">Continuar por WhatsApp sin guardar la solicitud</a>}
            <Button type="submit" disabled={working || !data || !slots.length} className="booking-submit">{working ? "Preparando solicitud…" : "Consultar por WhatsApp"}</Button>
            <p className="booking-disclaimer">La cita queda confirmada cuando HOME te responde. {user ? "Tu solicitud también se guarda en tu cuenta." : "Puedes reservar sin cuenta; al registrarte podrás acceder a beneficios."}</p>
          </FieldGroup>
        </form>
      </div>
    </section>
  )
}
