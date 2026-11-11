import { useEffect, useState, type FormEvent } from "react"
import { toast } from "sonner"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { crmApi, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading } from "./CrmCommon"

type Interval = { service_id: string; return_days: number; is_demo: boolean; service?: { name: string } }
type Settings = { max_contacts_7_days: number; max_contacts_30_days: number; is_demo: boolean }

export function CrmSettings({ role }: { role: CrmRole }) {
  const [intervals, setIntervals] = useState<Interval[] | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    void Promise.all([crmApi.intervals(role), crmApi.marketingSettings(role)]).then(([a, b]) => {
      if (!active) return
      setIntervals(a.intervals); setSettings(b.settings); setError("")
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudieron cargar los ajustes.") })
    return () => { active = false }
  }, [role, refresh])

  async function saveInterval(event: FormEvent<HTMLFormElement>, interval: Interval) {
    event.preventDefault()
    const days = Number(new FormData(event.currentTarget).get("days"))
    setBusy(interval.service_id)
    try { await crmApi.updateInterval(interval.service_id, days, false); setRefresh((value) => value + 1); toast.success("Intervalo actualizado.") }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo guardar.") }
    finally { setBusy("") }
  }

  async function saveLimits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy("limits")
    try { await crmApi.updateMarketingSettings(Number(form.get("seven")), Number(form.get("thirty")), false); setRefresh((value) => value + 1); toast.success("Límites actualizados.") }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudieron guardar los límites.") }
    finally { setBusy("") }
  }

  return <div className="crm-screen"><CrmHeading title="Ajustes de marketing" description="Intervalos de regreso por servicio y frecuencia de contacto. Los valores iniciales son DEMO." />
    {error && !intervals ? <CrmError message={error} onRetry={() => setRefresh((value) => value + 1)} /> : !intervals || !settings ? <CrmLoading /> : <>
      <Card><CardHeader><CardTitle>Próxima visita sugerida</CardTitle><CardDescription>Úsala como guía para programar seguimientos al terminar una atención. Ajusta cada servicio cuando tengas el intervalo real.</CardDescription></CardHeader><CardContent><div className="crm-settings-list">{intervals.map((interval) => <form key={interval.service_id} onSubmit={(event) => void saveInterval(event, interval)}><Field><FieldLabel htmlFor={`interval-${interval.service_id}`}>{interval.service?.name || "Servicio"} {interval.is_demo && <Badge variant="outline">DEMO</Badge>}</FieldLabel><Input id={`interval-${interval.service_id}`} name="days" type="number" min={7} max={180} defaultValue={interval.return_days} disabled={role !== "owner" || !!busy} /></Field>{role === "owner" && <Button type="submit" size="sm" variant="outline" disabled={!!busy}>Guardar</Button>}</form>)}</div></CardContent></Card>
      <Card><CardHeader><CardTitle>Frecuencia comercial</CardTitle><CardDescription>El CRM avisa cuando un contacto alcanza estos límites. Usa 0 para desactivar el aviso de un período. La revisión humana sigue siendo necesaria.</CardDescription></CardHeader><CardContent><form key={settings.max_contacts_7_days + ":" + settings.max_contacts_30_days} onSubmit={(event) => void saveLimits(event)}><FieldGroup><Field><FieldLabel htmlFor="crm-max-seven">Máximo en 7 días</FieldLabel><Input id="crm-max-seven" name="seven" type="number" min={0} max={30} defaultValue={settings.max_contacts_7_days} disabled={role !== "owner" || !!busy} /></Field><Field><FieldLabel htmlFor="crm-max-thirty">Máximo en 30 días</FieldLabel><Input id="crm-max-thirty" name="thirty" type="number" min={0} max={100} defaultValue={settings.max_contacts_30_days} disabled={role !== "owner" || !!busy} /></Field>{settings.is_demo && <Badge variant="outline">Valores DEMO</Badge>}{role === "owner" && <Button type="submit" disabled={!!busy}>Guardar límites</Button>}</FieldGroup></form></CardContent></Card>
    </>}
  </div>
}
