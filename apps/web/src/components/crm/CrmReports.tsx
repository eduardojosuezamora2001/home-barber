import { useEffect, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { crmApi, type CrmReport, type CrmRole } from "../../lib/crm"
import { CrmError, CrmHeading, CrmLoading, CrmMetric } from "./CrmCommon"

const money = (value: number) => new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(value)

export function CrmReports({ role, branchId }: { role: CrmRole; branchId?: string }) {
  const [report, setReport] = useState<CrmReport | null>(null)
  const [error, setError] = useState("")
  const [refresh, setRefresh] = useState(0)
  useEffect(() => {
    let active = true
    void crmApi.reports(role, branchId).then((result) => { if (active) { setReport(result); setError("") } })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el informe.") })
    return () => { active = false }
  }, [role, branchId, refresh])
  const maxRevenue = Math.max(1, ...(report?.months.map((month) => month.revenue) || []))
  return <div className="crm-screen"><CrmHeading title="Resultados" description="Ingresos documentados y actividad comercial de los últimos 90 días, sin contactos DEMO." action={<Button variant="outline" onClick={() => setRefresh((value) => value + 1)}>Actualizar</Button>} />
    {error && !report ? <CrmError message={error} onRetry={() => setRefresh((value) => value + 1)} /> : !report ? <CrmLoading /> : <>
      {error && <p className="crm-inline-error" role="alert">{error}</p>}
      <div className="crm-metrics crm-metrics-three"><CrmMetric label="Ingresos cobrados documentados" value={money(report.documentedRevenue)} /><CrmMetric label="Comprobantes pagados" value={report.paidReceipts} /><CrmMetric label="Clientes con 2+ comprobantes" value={`${report.customersWithMultipleReceipts} de ${report.customers}`} /></div>
      <Card><CardHeader><CardTitle>Ingresos por mes</CardTitle><CardDescription>Se usa la fecha del comprobante HOME-I. Un mes parcial incluye solo los días dentro del período.</CardDescription></CardHeader><CardContent>{report.months.length ? <div className="crm-report-bars" role="list">{report.months.map((month) => <div role="listitem" key={month.month} className="crm-report-bar"><span>{month.month}</span><div><i style={{ width: `${Math.max(2, month.revenue / maxRevenue * 100)}%` }} /></div><strong>{money(month.revenue)}</strong><small>{month.receipts} comprobantes</small></div>)}</div> : <p className="crm-list-empty">No hay comprobantes reales en este período.</p>}</CardContent></Card>
      <Card><CardHeader><CardTitle>Campañas manuales</CardTitle><CardDescription>Resultados marcados por el equipo; muestran actividad, no ventas atribuidas automáticamente.</CardDescription></CardHeader><CardContent><div className="crm-metrics crm-metrics-three"><CrmMetric label="Mensajes confirmados" value={report.contacted} /><CrmMetric label="Reservas declaradas" value={report.bookedReported} /><CrmMetric label="Regresos declarados" value={report.returnedReported} /></div><p className="crm-muted">Los regresos declarados requieren conciliación con comprobantes antes de calcular retorno de inversión.</p></CardContent></Card>
      {report.sampleLimited && <p className="crm-inline-error">El informe alcanzó el límite de 1.000 registros; los totales pueden ser menores que los reales. Filtra por sede o usa una exportación para conciliarlos.</p>}
    </>}
  </div>
}
