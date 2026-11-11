import { useState, type FormEvent } from "react"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@workspace/ui/components/dialog"
import { LoaderCircle, Pencil, Plus } from "lucide-react"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { toast } from "sonner"
import { api } from "../lib/api"
import { discountLabel } from "../lib/discounts"
import { costaRicaToday, dateChoices, toUtc } from "../lib/booking"
import { couponLabel, promotionLabels, rewardDate, useRewardTime } from "../lib/loyalty"
import { collectionDate, matchesSearch, useCollectionState } from "../lib/collections"
import type { Coupon, Profile, Promotion, PublicData, Referral } from "../lib/types"
import { CollectionControls, CollectionPagination } from "./CollectionControls"

interface Props {
  data: PublicData | null
  promotions: Promotion[]
  coupons: Coupon[]
  referrals: Referral[]
  profiles: Profile[]
  onRefresh: () => Promise<void>
}

const descriptions: Record<Promotion["kind"], string> = {
  legacy: "Campaña anterior. Puedes actualizar su información y vigencia conservando las condiciones originales.",
  welcome: "Después de su primera visita atendida, el cliente recibe un cupón para volver.",
  frequency: "Cada vez que el cliente completa la cantidad de visitas indicada, recibe otro cupón. Se cuenta su historial total en HOME.",
  referral: "La persona invitada registra el código antes de su primera visita. Al completarla, ambas personas reciben su cupón.",
  targeted: "Cupón personal emitido desde una audiencia del CRM.",
}

function campaignStatus(promotion: Promotion, now: number) {
  if (Date.parse(promotion.ends_at) <= now) return "ended"
  if (!promotion.active) return "paused"
  return Date.parse(promotion.starts_at) > now ? "scheduled" : "active"
}
const campaignStatuses = { active: "Activa", paused: "Pausada", scheduled: "Programada", ended: "Finalizada" }

export function OwnerPromotions({ data, promotions, coupons, referrals, profiles, onRefresh }: Props) {
  const [kind, setKind] = useState<Promotion["kind"]>("welcome")
  const [editing, setEditing] = useState<Promotion | null>(null)
  const [discountType, setDiscountType] = useState<"" | "fixed" | "percentage">("percentage")
  const [referralDiscountType, setReferralDiscountType] = useState<"" | "fixed" | "percentage">("percentage")
  const [working, setWorking] = useState("")
  const [code, setCode] = useState("")
  const [redemption, setRedemption] = useState("")
  const [campaignOpen, setCampaignOpen] = useState(false)
  const [campaignError, setCampaignError] = useState("")
  const now = useRewardTime()
  const filters = useCollectionState("promociones", "grid")
  const filtered = promotions.filter((promotion) => matchesSearch(filters.get("q"), promotion.title, promotion.description, promotion.benefit_text) &&
    (!filters.get("status") || campaignStatus(promotion, now) === filters.get("status")) &&
    (!filters.get("kind") || promotion.kind === filters.get("kind")) &&
    (!filters.get("branch") || !promotion.branch_id || promotion.branch_id === filters.get("branch"))
  ).sort((a, b) => filters.get("sort") === "ending" ? Date.parse(a.ends_at) - Date.parse(b.ends_at) : filters.get("sort") === "name" ? a.title.localeCompare(b.title, "es-CR") : Date.parse(b.created_at) - Date.parse(a.created_at))
  const page = filters.paginate(filtered)

  function openEditor(promotion: Promotion | null) {
    setEditing(promotion)
    setKind(promotion?.kind ?? "welcome")
    setDiscountType(promotion ? promotion.discount_type === "none" ? "" : promotion.discount_type : "percentage")
    setReferralDiscountType(promotion ? promotion.referral_discount_type === "none" ? "" : promotion.referral_discount_type : "percentage")
    setCampaignError("")
    setCampaignOpen(true)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (working) return
    const element = event.currentTarget
    const form = new FormData(element)
    setWorking("create")
    setCampaignError("")
    try {
      const payload = {
        kind, title: String(form.get("title")).trim(), description: String(form.get("description") ?? "").trim(),
        benefitText: String(form.get("benefit")).trim(), branchId: String(form.get("branch") ?? "") || null,
        visitsEvery: kind === "frequency" ? Number(form.get("visits")) : null,
        rewardValidDays: Number(form.get("days")),
        discountType, discountValue: Number(form.get("discount_value")),
        referralDiscountType: kind === "referral" ? referralDiscountType : null,
        referralDiscountValue: kind === "referral" ? Number(form.get("referral_discount_value")) : null,
        referralBenefitText: kind === "referral" ? String(form.get("referrer_benefit")).trim() : null,
        startsAt: editing && collectionDate(editing.starts_at) === String(form.get("start")) ? editing.starts_at : toUtc(String(form.get("start")), "00:00"),
        endsAt: editing && collectionDate(editing.ends_at) === String(form.get("end")) ? editing.ends_at : toUtc(String(form.get("end")), "23:59"),
      }
      if (editing) await api.patch(`/owner/promotions/${editing.id}`, payload)
      else await api.post("/owner/promotions", payload)
      element.reset()
      await onRefresh()
      setCampaignOpen(false)
      toast.success(editing ? "Campaña actualizada." : "Campaña publicada. Las recompensas se entregarán automáticamente al completar las visitas.")
    } catch (error) { setCampaignError(error instanceof Error ? error.message : "No se pudo publicar. Intenta de nuevo.") }
    finally { setWorking("") }
  }

  async function toggle(promotion: Promotion) {
    setWorking(promotion.id)
    try {
      await api.patch(`/owner/promotions/${promotion.id}`, { active: !promotion.active })
      await onRefresh()
      toast.success(promotion.active ? "Campaña pausada. Sus cupones no se podrán canjear mientras esté pausada." : "Campaña activada.")
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo actualizar la campaña.") }
    finally { setWorking("") }
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking("redeem")
    setRedemption("")
    try {
      await api.post("/owner/coupons/redeem", { code: code.trim() })
      setCode("")
      setRedemption("Cupón canjeado correctamente.")
      await onRefresh()
      toast.success("Cupón canjeado.")
    } catch (error) { setRedemption(error instanceof Error ? error.message : "No se pudo canjear. Intenta de nuevo.") }
    finally { setWorking("") }
  }

  const selectedCoupon = coupons.find((coupon) => coupon.code === code.trim().toUpperCase())
  const selectedPromotion = promotions.find((promotion) => promotion.id === selectedCoupon?.promotion_id)
  const rewardedReferrals = referrals.filter((referral) => referral.rewarded_at).length

  return <Dialog open={campaignOpen} onOpenChange={(open) => { if (working !== "create") setCampaignOpen(open) }}>
      <section>
        <div className="panel-heading"><div><h2>Campañas y recompensas</h2><p className="section-subtitle">Administra los beneficios de bienvenida, visitas y referidos.</p></div><DialogTrigger render={<Button disabled={!!working} />} onClick={() => openEditor(null)}><Plus data-icon="inline-start" />Crear campaña</DialogTrigger></div>
        <CollectionControls state={filters} searchLabel="Buscar promoción o beneficio" sorts={[{ value: "newest", label: "Más recientes" }, { value: "ending", label: "Próximas a vencer" }, { value: "name", label: "Nombre A–Z" }]}>
          <Field><FieldLabel htmlFor="promociones-status">Estado</FieldLabel><NativeSelect id="promociones-status" value={filters.get("status")} onChange={(event) => filters.update("status", event.target.value)}><NativeSelectOption value="">Todos los estados</NativeSelectOption>{Object.entries(campaignStatuses).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="promociones-kind">Tipo</FieldLabel><NativeSelect id="promociones-kind" value={filters.get("kind")} onChange={(event) => filters.update("kind", event.target.value)}><NativeSelectOption value="">Todos los tipos</NativeSelectOption>{Object.entries(promotionLabels).map(([value, label]) => <NativeSelectOption key={value} value={value}>{label}</NativeSelectOption>)}</NativeSelect></Field>
          <Field><FieldLabel htmlFor="promociones-branch">Sucursal</FieldLabel><NativeSelect id="promociones-branch" value={filters.get("branch")} onChange={(event) => filters.update("branch", event.target.value)}><NativeSelectOption value="">Todas las sucursales</NativeSelectOption>{data?.branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
        </CollectionControls>
        {page.items.length ? <div className="collection-results promotion-results" data-layout={filters.layout}>{page.items.map((promotion) => {
          const issued = coupons.filter((coupon) => coupon.promotion_id === promotion.id)
          return <article className="collection-item" key={promotion.id}>
            <div className="collection-item-main"><Badge variant="secondary">{promotionLabels[promotion.kind]}</Badge><h3>{promotion.title}</h3><p>{discountLabel(promotion)}</p><p>{promotion.benefit_text}</p>
            {promotion.kind === "referral" && <p>Quien invita: {discountLabel({ discount_type: promotion.referral_discount_type, discount_value: promotion.referral_discount_value })} · {promotion.referral_benefit_text}</p>}
            {promotion.kind === "frequency" && <p>Cada {promotion.visits_every} visitas atendidas.</p>}
            <p className="muted-line">{promotion.branch_id ? data?.branches.find((branch) => branch.id === promotion.branch_id)?.name ?? "Sucursal" : "Todas las sucursales"}</p></div>
            <div className="collection-item-meta"><Badge variant="secondary">{campaignStatuses[campaignStatus(promotion, now)]}</Badge><span>Hasta {rewardDate(promotion.ends_at)}</span><small>{issued.length} emitidos · {issued.filter((coupon) => coupon.status === "redeemed").length} canjeados</small></div>
            {promotion.kind === "targeted" ? <div className="collection-item-actions"><span className="muted-line">Gestionada desde Campañas del CRM</span></div> : <div className="collection-item-actions"><Button type="button" size="sm" variant="outline" disabled={!!working} onClick={() => openEditor(promotion)}><Pencil data-icon="inline-start" />Editar</Button><Button type="button" size="sm" variant="outline" disabled={!!working || Date.parse(promotion.ends_at) <= now} onClick={() => void toggle(promotion)}>{working === promotion.id ? "Guardando…" : promotion.active ? "Pausar" : "Activar"}</Button></div>}
          </article>
        })}</div> : <div className="empty-state">{promotions.length ? "No hay promociones que coincidan con los filtros." : "Crea una campaña para empezar a entregar beneficios de bienvenida, visitas o referidos."}</div>}
        <CollectionPagination state={filters} result={page} />
      </section>
      <section className="campaign-redemption">
        <h2>Canjear cupón</h2>
        <form onSubmit={redeem} className="coupon-redeem"><FieldGroup>
          <Field><FieldLabel htmlFor="coupon-code">Código presentado por el cliente</FieldLabel><Input id="coupon-code" value={code} onChange={(event) => { setCode(event.target.value); setRedemption("") }} placeholder="HOME-XXXXXXXXXX" maxLength={15} required /></Field>
          {selectedCoupon && <div className="coupon-preview"><strong>{discountLabel(selectedCoupon)} · {selectedCoupon.benefit_text}</strong><p>{profiles.find((profile) => profile.id === selectedCoupon.client_id)?.full_name || "Cliente"} · {couponLabel(selectedCoupon, selectedPromotion, now)}</p><p>Vence el {rewardDate(selectedCoupon.expires_at)}{selectedPromotion?.branch_id ? ` · ${data?.branches.find((branch) => branch.id === selectedPromotion.branch_id)?.name ?? "Sucursal"}` : ""}</p></div>}
          {redemption && <p role="status" className="form-message">{redemption}</p>}
          <Button type="submit" variant="outline" disabled={!!working}>{working === "redeem" ? "Canjeando…" : "Validar y canjear"}</Button>
        </FieldGroup></form>
        <p className="muted-line">{referrals.length} invitaciones registradas · {rewardedReferrals} convertidas en una primera visita.</p>
      </section>
      <DialogContent className="team-create-dialog campaign-create-dialog" showCloseButton={working !== "create"}>
        <DialogHeader><DialogTitle>{editing ? "Editar campaña" : "Crear campaña"}</DialogTitle><DialogDescription>{editing ? "Actualiza la información y vigencia. Los cupones emitidos conservan su beneficio y vencimiento; al canjearlos se valida también la sucursal y vigencia de la campaña." : "Elige qué acción quieres premiar y define el beneficio."}</DialogDescription></DialogHeader>
        <form key={editing?.id ?? "new"} onSubmit={create} aria-busy={working === "create"}><fieldset className="campaign-fields" disabled={working === "create"}><FieldGroup>
          <Field><FieldLabel htmlFor="promo-kind">Tipo de campaña</FieldLabel><NativeSelect id="promo-kind" value={kind} disabled={!!editing} onChange={(event) => setKind(event.target.value as typeof kind)} className="w-full">
            {kind === "legacy" && <NativeSelectOption value="legacy">Campaña anterior</NativeSelectOption>}
            <NativeSelectOption value="welcome">Beneficio de bienvenida</NativeSelectOption>
            <NativeSelectOption value="frequency">Recompensa por frecuencia</NativeSelectOption>
            <NativeSelectOption value="referral">Referidos para ambas personas</NativeSelectOption>
          </NativeSelect><p className="field-hint">{descriptions[kind]}</p></Field>
          <Field><FieldLabel htmlFor="promo-title">Nombre de la campaña</FieldLabel><Input id="promo-title" name="title" defaultValue={editing?.title ?? ""} minLength={3} maxLength={120} placeholder="Ej. Tu próxima visita tiene premio" required /></Field>
          <Field><FieldLabel htmlFor="promo-benefit">{kind === "referral" ? "Beneficio para la persona invitada" : "Beneficio que recibe el cliente"}</FieldLabel><Input id="promo-benefit" name="benefit" defaultValue={editing?.benefit_text ?? ""} minLength={3} maxLength={200} placeholder="Ej. ₡1.000 de descuento en su próxima visita" required /></Field>
          <div className="form-grid">
            <Field><FieldLabel htmlFor="promo-discount-type">Tipo de descuento{kind === "referral" ? " para la persona invitada" : ""}</FieldLabel><NativeSelect id="promo-discount-type" value={discountType} required onChange={(event) => setDiscountType(event.target.value as typeof discountType)}><NativeSelectOption value="">Seleccionar tipo</NativeSelectOption><NativeSelectOption value="percentage">Porcentual (%)</NativeSelectOption><NativeSelectOption value="fixed">Monto fijo (₡)</NativeSelectOption></NativeSelect></Field>
            <Field><FieldLabel htmlFor="promo-discount-value">{discountType === "fixed" ? "Monto del descuento ₡" : "Porcentaje de descuento %"}</FieldLabel><Input id="promo-discount-value" name="discount_value" type="number" min="0.01" max={discountType === "percentage" ? 100 : 120000000} step="0.01" defaultValue={editing ? editing.discount_value > 0 ? editing.discount_value : "" : 10} required /></Field>
          </div>
          <p className="field-hint">Se aplica automáticamente al subtotal al cobrar. El monto fijo no puede rebajar más que el subtotal. Cada cupón conserva el descuento configurado al emitirse.</p>
          {kind === "referral" && <div className="form-grid">
            <Field><FieldLabel htmlFor="promo-referral-discount-type">Tipo de descuento para quien invita</FieldLabel><NativeSelect id="promo-referral-discount-type" value={referralDiscountType} required onChange={(event) => setReferralDiscountType(event.target.value as typeof referralDiscountType)}><NativeSelectOption value="">Seleccionar tipo</NativeSelectOption><NativeSelectOption value="percentage">Porcentual (%)</NativeSelectOption><NativeSelectOption value="fixed">Monto fijo (₡)</NativeSelectOption></NativeSelect></Field>
            <Field><FieldLabel htmlFor="promo-referral-discount-value">{referralDiscountType === "fixed" ? "Monto para quien invita ₡" : "Porcentaje para quien invita %"}</FieldLabel><Input id="promo-referral-discount-value" name="referral_discount_value" type="number" min="0.01" max={referralDiscountType === "percentage" ? 100 : 120000000} step="0.01" defaultValue={editing ? editing.referral_discount_value > 0 ? editing.referral_discount_value : "" : 10} required /></Field>
          </div>}
          {kind === "referral" && <Field><FieldLabel htmlFor="promo-referrer">Beneficio para quien invita</FieldLabel><Input id="promo-referrer" name="referrer_benefit" defaultValue={editing?.referral_benefit_text ?? ""} minLength={3} maxLength={200} placeholder="Ej. Lavado de cortesía con su próximo corte" required /><p className="field-hint">Cada persona recibe su propio cupón. Se entrega una recompensa por cada nuevo cliente atendido.</p></Field>}
          {kind === "frequency" && <Field><FieldLabel htmlFor="promo-visits">Entregar una recompensa cada</FieldLabel><Input id="promo-visits" name="visits" type="number" min={2} max={100} defaultValue={editing?.visits_every ?? 5} required /><p className="field-hint">Visitas atendidas. Por ejemplo, cada 5 visitas se premian las visitas 5, 10 y 15. Las visitas anteriores cuentan para el progreso.</p></Field>}
          <Field><FieldLabel htmlFor="promo-description">Condiciones del beneficio</FieldLabel><Textarea id="promo-description" name="description" defaultValue={editing?.description ?? ""} maxLength={800} rows={3} placeholder="Servicios incluidos, compra mínima y otras condiciones que debe conocer el cliente." /></Field>
          <div className="form-grid">
            <Field><FieldLabel htmlFor="promo-days">Días para usar cada cupón</FieldLabel><Input id="promo-days" name="days" type="number" min={1} max={365} defaultValue={editing?.reward_valid_days ?? 30} required /></Field>
            <Field><FieldLabel htmlFor="promo-branch">Sucursal</FieldLabel><NativeSelect id="promo-branch" name="branch" defaultValue={editing?.branch_id ?? ""} className="w-full"><NativeSelectOption value="">Todas las sucursales</NativeSelectOption>{data?.branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>
          </div>
          <p className="field-hint">La visita que genera el cupón debe realizarse en la sucursal elegida. El cupón vence al terminar su plazo o la campaña, lo que ocurra primero. Solo puede haber una campaña de referidos activa a la vez.</p>
          <div className="form-grid">
            <Field><FieldLabel htmlFor="promo-start">Inicio de campaña</FieldLabel><Input id="promo-start" name="start" type="date" defaultValue={editing ? collectionDate(editing.starts_at) : costaRicaToday()} required /></Field>
            <Field><FieldLabel htmlFor="promo-end">Fin de campaña</FieldLabel><Input id="promo-end" name="end" type="date" defaultValue={editing ? collectionDate(editing.ends_at) : dateChoices(31)[30]} required /></Field>
          </div>

        </FieldGroup></fieldset>{campaignError && <p role="alert" className="form-message">{campaignError}</p>}<DialogFooter><Button type="button" variant="outline" disabled={working === "create"} onClick={() => setCampaignOpen(false)}>Cancelar</Button><Button type="submit" disabled={!!working}>{working === "create" && <LoaderCircle data-icon="inline-start" className="animate-spin" />}{working === "create" ? "Guardando…" : editing ? "Guardar cambios" : "Publicar campaña"}</Button></DialogFooter></form>
      </DialogContent>
  </Dialog>
}
