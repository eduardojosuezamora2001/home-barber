import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from "react"
import { useSearchParams } from "react-router"
import { CalendarDays, Gift, ReceiptText, Ticket, UserRound, Users } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { ClientProfile } from "./ClientProfile"
import { AppointmentDetails } from "./AppointmentDetails"
import { ClientReceipts } from "./ClientReceipts"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import { displayDate, displayTime } from "../lib/booking"
import { campaignIsActive, couponLabel, pendingInvitation, promotionLabels, rewardDate, saveInvitation, useRewardTime } from "../lib/loyalty"
import { api } from "../lib/api"
import { discountLabel } from "../lib/discounts"
import { loadClientDashboard } from "../lib/data"
import type { Appointment, Coupon, LoyaltyAccount, Profile, Promotion, PublicData, Referral, SessionUser } from "../lib/types"
import { AreaLayout } from "./AreaLayout"
import { AreaSkeleton } from "./LoadingSkeleton"

interface Props {
  data: PublicData | null
  user: SessionUser
  profile: Profile | null
  loyalty: LoyaltyAccount | null
  onHome: () => void
  onSignOut: () => void | Promise<void>
  onRefresh: () => void | Promise<void>
}

const statusText: Record<Appointment["status"], string> = {
  pending: "Por confirmar", confirmed: "Confirmada", completed: "Atendida", cancelled: "Cancelada",
}

const BookingSection = lazy(() => import("./BookingSection").then((module) => ({ default: module.BookingSection })))

export function ClientArea({ data, user, profile, loyalty: initialLoyalty, onHome, onSignOut, onRefresh }: Props) {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingBranchId, setBookingBranchId] = useState("")
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [workingId, setWorkingId] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [loyalty, setLoyalty] = useState(initialLoyalty)
  const [referrals, setReferrals] = useState<Referral[]>([])
  const [invitation, setInvitation] = useState(pendingInvitation)
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get("tab") === "facturas" ? "comprobantes" : searchParams.get("tab") ?? "beneficios"
  const tab = ["beneficios", "cupones", "citas", "comprobantes", "referidos", "datos"].includes(requestedTab) ? requestedTab : "beneficios"
  const now = useRewardTime()
  const activePromotions = promotions.filter((promotion) => campaignIsActive(promotion, now) && (promotion.kind !== "welcome" || (loyalty?.visits ?? 0) === 0))
  const availableCouponCount = coupons.filter((coupon) => coupon.status === "available"
    && couponLabel(coupon, promotions.find((promotion) => promotion.id === coupon.promotion_id), now) === "Disponible").length
  const hasUpcomingAppointments = appointments.some((appointment) =>
    (appointment.status === "pending" || appointment.status === "confirmed")
    && Date.parse(appointment.requested_at) >= now)
  const frequencyPromotions = activePromotions.filter((promotion) => promotion.kind === "frequency")
  const referralPromotion = activePromotions.find((promotion) => promotion.kind === "referral")
  const receivedInvitation = referrals.find((referral) => referral.invited_id === user.id)
  const sentInvitations = referrals.filter((referral) => referral.referrer_id === user.id)

  const refresh = useCallback(async () => {
    try {
      const dashboard = await loadClientDashboard()
      setAppointments(dashboard.appointments)
      setPromotions(dashboard.promotions)
      setCoupons(dashboard.coupons)
      setLoyalty(dashboard.loyalty)
      setReferrals(dashboard.referrals)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo actualizar tu cuenta.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh, user.id])

  async function claim(promotionId: string) {
    setWorkingId(promotionId)
    setMessage("")
    try { await api.post("/client/coupons", { promotionId }); setMessage("Cupón añadido a tu cuenta.") }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el cupón.") }
    await refresh()
    setWorkingId("")
  }

  async function registerInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorkingId("invitation")
    setMessage("")
    try {
      await api.post("/client/referrals", { code: invitation.trim() })
      saveInvitation("")
      await refresh()
      setMessage("Invitación registrada. Al completar tu primera visita, ambas personas recibirán su beneficio.")
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo registrar la invitación. Intenta de nuevo.") }
    finally { setWorkingId("") }
  }

  async function copyInvitation() {
    if (!loyalty?.referral_code) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?ref=${loyalty.referral_code}`)
      setMessage("Enlace copiado. Compártelo con alguien que todavía no haya visitado HOME.")
    } catch { setMessage(`Tu código es ${loyalty.referral_code}. Puedes copiarlo y compartirlo.`) }
  }

  if (loading) return <AreaSkeleton />

  return <AreaLayout title="Mi cuenta" subtitle="Consulta tus beneficios y citas, comparte recompensas y actualiza tus datos." role="Cliente" onHome={onHome} onSignOut={onSignOut}>
    {message && <p role="status" className="area-message">{message}</p>}
    <Tabs className="client-tabs" value={tab} onValueChange={(value) => {
      setSearchParams((current) => { const next = new URLSearchParams(current); next.set("tab", String(value)); return next })
    }}>
      <TabsList aria-label="Secciones de mi cuenta">
        <TabsTrigger value="beneficios"><Gift />Beneficios<Badge variant="secondary" aria-label={`${activePromotions.length} beneficios disponibles`}>{activePromotions.length}</Badge></TabsTrigger>
        <TabsTrigger value="cupones"><Ticket />Cupones<Badge variant="secondary" aria-label={`${availableCouponCount} cupones disponibles`}>{availableCouponCount}</Badge></TabsTrigger>
        <TabsTrigger value="citas" aria-label={hasUpcomingAppointments ? "Citas: tienes citas próximas" : "Citas"}><CalendarDays />Citas{hasUpcomingAppointments && <span className="client-appointment-dot" aria-hidden="true" />}</TabsTrigger>
        <TabsTrigger value="comprobantes"><ReceiptText />Comprobantes</TabsTrigger>
        <TabsTrigger value="referidos"><Users />Referidos</TabsTrigger>
        <TabsTrigger value="datos"><UserRound />Mis datos</TabsTrigger>
      </TabsList>
      <TabsContent value="beneficios">
    <section className="loyalty-summary" aria-label="Tu historial en HOME"><h2>Cada visita cuenta</h2><p><strong>{loyalty?.visits ?? 0}</strong> visitas atendidas <span>·</span> <strong>{loyalty?.points_total ?? 0}</strong> puntos acumulados</p><Button type="button" variant="outline" disabled={!!workingId} onClick={async () => { setWorkingId("refresh"); await refresh(); setWorkingId("") }}>{workingId === "refresh" ? "Actualizando…" : "Actualizar mis beneficios"}</Button></section>
    <div className="loyalty-progress-list">{frequencyPromotions.map((promotion) => {
      const every = promotion.visits_every ?? 5
      const visits = loyalty?.visits ?? 0
      const progress = visits % every
      return <section className="loyalty-progress" key={promotion.id}>
        <h2>{promotion.title}</h2><p>{promotion.benefit_text}</p>
        <Progress value={progress / every * 100} aria-label={progress + " de " + every + " visitas hacia tu próxima recompensa"} />
        <p>{every - progress} {every - progress === 1 ? "visita para tu próxima recompensa" : "visitas para tu próxima recompensa"}. Recibes un cupón cada {every} visitas atendidas.</p>
        <p className="muted-line">{promotion.branch_id ? "La visita que completa el objetivo debe ser en " + (data?.branches.find((branch) => branch.id === promotion.branch_id)?.name ?? "la sucursal de la campaña") + "." : "Válido en todas las sucursales."} Hasta {rewardDate(promotion.ends_at)}.</p>
      </section>
    })}</div>
      <h2 className="stacked-heading">Beneficios que puedes conseguir</h2>
      {activePromotions.length ? <div className="campaign-list">{activePromotions.map((promotion) => <article className="campaign-row" key={promotion.id}>
        <Badge variant="secondary">{promotionLabels[promotion.kind]}</Badge><h3>{promotion.title}</h3><p>{discountLabel(promotion)}</p><p>{promotion.benefit_text}</p><p>{promotion.description}</p>
        {promotion.kind === "welcome" && <p>Completa tu primera visita y recibe este cupón para la siguiente.</p>}
        {promotion.kind === "frequency" && <p>Se entrega automáticamente cada {promotion.visits_every} visitas atendidas.</p>}
        {promotion.kind === "referral" && <p>Si invitas: {promotion.referral_benefit_text}. Ambos reciben su cupón al completar la primera visita de la persona invitada.</p>}
        <p className="muted-line">Hasta {rewardDate(promotion.ends_at)} · {promotion.branch_id ? data?.branches.find((branch) => branch.id === promotion.branch_id)?.name ?? "Sucursal" : "Todas las sucursales"}{promotion.kind !== "legacy" ? " · Cupón válido por " + promotion.reward_valid_days + " días como máximo, sin superar el fin de la campaña" : ""}</p>
        {promotion.kind === "legacy" && !coupons.some((coupon) => coupon.promotion_id === promotion.id) && <Button type="button" variant="outline" disabled={!!workingId} onClick={() => void claim(promotion.id)}>{workingId === promotion.id ? "Guardando…" : "Reclamar cupón"}</Button>}
      </article>)}</div> : <div className="empty-state">No hay campañas vigentes. Tus visitas y puntos siguen guardados en tu cuenta.</div>}
      </TabsContent>
      <TabsContent value="cupones">
<section><h2>Mis cupones</h2>
      {coupons.length ? <div className="area-list">{coupons.map((coupon) => {
        const promotion = promotions.find((item) => item.id === coupon.promotion_id)
        const status = couponLabel(coupon, promotion, now)
        return <Card key={coupon.id}><CardHeader><div className="appointment-line"><Badge variant="secondary">{promotion ? promotionLabels[promotion.kind] : "Beneficio"}</Badge><Badge variant={status === "Disponible" ? "default" : "secondary"}>{status}</Badge></div><CardTitle>{promotion?.title ?? "Tu recompensa"}</CardTitle><CardDescription>{coupon.benefit_text}</CardDescription></CardHeader><CardContent>
          <p>{discountLabel(coupon)}</p>
          {promotion?.description && <p>{promotion.description}</p>}
          <p className="muted-line">Vence el {rewardDate(coupon.expires_at)}{promotion?.branch_id ? " · " + (data?.branches.find((branch) => branch.id === promotion.branch_id)?.name ?? "Sucursal") : " · Todas las sucursales"}</p>
          <div className="coupon-line"><span>Presenta este código en HOME</span><code>{coupon.code}</code></div>
        </CardContent></Card>
      })}</div> : <div className="empty-state">Aquí aparecerán tus cupones cuando completes las visitas de una campaña vigente.</div>}
    </section>
      </TabsContent>
      <TabsContent value="citas">
      <section><div className="panel-heading"><h2>Mis citas</h2><Button type="button" aria-expanded={bookingOpen} aria-controls="client-new-appointment" onClick={() => setBookingOpen((current) => !current)}>{bookingOpen ? "Cerrar formulario" : "Nueva cita"}</Button></div>
      {bookingOpen && <Card id="client-new-appointment" className="client-booking-card"><CardHeader><CardTitle>Solicitar una cita</CardTitle><CardDescription>Elige sede, servicio, barbero y horario. Tu solicitud se guarda en tu cuenta y HOME la confirma por WhatsApp.</CardDescription></CardHeader><CardContent>{data ? <Suspense fallback={<p role="status">Cargando formulario…</p>}><BookingSection compact data={data} user={user} profile={profile} preferredServiceId="" branchId={bookingBranchId} onBranchChange={setBookingBranchId} onCreated={refresh} /></Suspense> : <div><p>No se pudo cargar la agenda.</p><Button type="button" variant="outline" onClick={() => void onRefresh()}>Volver a cargar agenda</Button></div>}</CardContent></Card>}
      {appointments.length ? <div className="area-list">{appointments.map((appointment) => <Card key={appointment.id}><CardHeader><CardTitle>{data?.services.find((service) => service.id === appointment.service_id)?.name ?? "Servicio"}</CardTitle><CardDescription>{data?.branches.find((branch) => branch.id === appointment.branch_id)?.name ?? "Sucursal"} · {data?.barbers.find((barber) => barber.id === appointment.barber_id)?.display_name ?? "Barbero"}</CardDescription></CardHeader><CardContent><div className="appointment-line"><span>{displayDate(appointment.requested_at.slice(0, 10))} · {displayTime(appointment.requested_at)}</span><Badge variant="secondary">{statusText[appointment.status]}</Badge></div><div className="row-actions"><AppointmentDetails appointment={appointment} data={data} email={profile?.email} /></div></CardContent></Card>)}</div> : <div className="empty-state">Aún no tienes solicitudes guardadas. Pulsa Nueva cita para elegir tu próxima visita.</div>}</section>
      </TabsContent>
      <TabsContent value="comprobantes"><ClientReceipts /></TabsContent>
      <TabsContent value="referidos">
    <section className="referral-section" aria-labelledby="referral-title">
      <div><h2 id="referral-title">Invita a alguien a HOME</h2>
        {referralPromotion ? <><p>Comparte tu enlace. La persona invitada debe registrar tu código antes de su primera visita.</p><p>Para ti: {referralPromotion.referral_benefit_text}. Para la persona invitada: {referralPromotion.benefit_text}.</p><div className="referral-share"><code>{loyalty?.referral_code}</code><Button type="button" variant="outline" onClick={() => void copyInvitation()}>Copiar enlace de invitación</Button></div></> : <p>No hay una campaña de referidos vigente. Cuando se publique una, podrás compartir tu código.</p>}
        <p className="muted-line">{sentInvitations.length} invitaciones registradas · {sentInvitations.filter((referral) => referral.rewarded_at).length} primeras visitas con recompensa.</p>
      </div>
      <div><h3>¿Alguien te invitó?</h3>
        {receivedInvitation ? <p role="status">{receivedInvitation.rewarded_at ? "Tu primera visita ya generó las recompensas para ambos. Revisa tus cupones." : "Tu invitación está registrada. Recibirán sus cupones al completar tu primera visita durante la campaña y en la sucursal indicada."}</p>
          : (loyalty?.visits ?? 0) === 0 ? <form onSubmit={registerInvitation}><FieldGroup><Field><FieldLabel htmlFor="invitation-code">Código de quien te invitó</FieldLabel><Input id="invitation-code" value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder="INV-XXXXXXXXXXXX" maxLength={16} pattern="[Ii][Nn][Vv]-[a-fA-F0-9]{12}" required /><p className="field-hint">Puedes registrarlo una sola vez, antes de tu primera visita. Debe haber una campaña de referidos vigente.</p></Field><Button type="submit" disabled={!!workingId}>{workingId === "invitation" ? "Registrando…" : "Registrar invitación"}</Button></FieldGroup></form>
          : <p>Los códigos de invitación se registran antes de la primera visita.</p>}
      </div>
    </section>
      </TabsContent>
      <TabsContent value="datos" keepMounted><ClientProfile key={user.id} user={user} profile={profile} onRefresh={onRefresh} /></TabsContent>
    </Tabs>
  </AreaLayout>
}
