import { useState, type ChangeEvent } from "react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@workspace/ui/components/table"
import { crmApi, type CrmContactInput } from "../../lib/crm"
import { CrmHeading, CrmState } from "./CrmCommon"

interface Props { branchId?: string; branches?: { id: string; name: string }[] }
interface Preview { rows: CrmContactInput[]; invalid: { row: number; reason: string }[]; fileName: string }

function splitCsv(source: string): string[][] {
  const text = source.replace(/^\uFEFF/, "")
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ""
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ","
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++ }
      else quoted = !quoted
    } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = "" }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++
      row.push(cell.trim()); cell = ""
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else { cell += char }
  }
  if (quoted) throw new Error("Hay una comilla sin cerrar en el CSV.")
  row.push(cell.trim())
  if (row.some(Boolean)) rows.push(row)
  return rows
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
}

function parseContacts(source: string, fileName: string, branches: { id: string; name: string }[], defaultBranchId?: string): Preview {
  const [header, ...lines] = splitCsv(source)
  if (!header) throw new Error("El archivo está vacío.")
  const normalized = header.map(normalize)
  const find = (...aliases: string[]) => normalized.findIndex((value) => aliases.includes(value))
  const nameIndex = find("nombre", "nombrecompleto", "fullname", "name", "cliente")
  const emailIndex = find("correo", "email", "correoelectronico")
  const phoneIndex = find("telefono", "celular", "whatsapp", "phone", "movil")
  const branchIndex = find("sucursal", "branch", "sede")
  if (nameIndex < 0 || (emailIndex < 0 && phoneIndex < 0)) throw new Error("El CSV necesita una columna Nombre y otra Teléfono/WhatsApp o Correo.")
  const rows: CrmContactInput[] = []
  const invalid: Preview["invalid"] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const fullName = line[nameIndex]?.trim() ?? ""
    const email = emailIndex >= 0 ? line[emailIndex]?.trim() ?? "" : ""
    const phone = phoneIndex >= 0 ? line[phoneIndex]?.trim() ?? "" : ""
    const branchValue = branchIndex >= 0 ? line[branchIndex]?.trim() ?? "" : ""
    const matchedBranch = branchValue ? branches.find((branch) => branch.id === branchValue || normalize(branch.name) === normalize(branchValue)) : undefined
    if (!fullName || (!email && !phone)) { invalid.push({ row: index + 2, reason: "Falta nombre o dato de contacto" }); continue }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { invalid.push({ row: index + 2, reason: "Correo inválido" }); continue }
    if (branchValue && !matchedBranch) { invalid.push({ row: index + 2, reason: `Sucursal desconocida: ${branchValue}` }); continue }
    rows.push({ fullName, email: email || null, phone: phone || null, source: "csv", branchId: matchedBranch?.id || defaultBranchId })
  }
  if (rows.length + invalid.length > 5000) throw new Error("El archivo supera 5.000 contactos. Divídelo en archivos más pequeños.")
  return { rows, invalid, fileName }
}

function batches(rows: CrmContactInput[]) {
  const encoder = new TextEncoder()
  const result: CrmContactInput[][] = []
  let current: CrmContactInput[] = []
  for (const row of rows) {
    const candidate = [...current, row]
    if (candidate.length > 200 || encoder.encode(JSON.stringify({ rows: candidate })).length > 24_000) {
      if (current.length === 0) throw new Error("Una fila es demasiado larga para importar.")
      result.push(current)
      current = [row]
    } else current = candidate
  }
  if (current.length) result.push(current)
  return result
}

export function CrmImport({ branchId, branches = [] }: Props) {
  const [selectedBranch, setSelectedBranch] = useState(branchId || "")
  const effectiveBranch = selectedBranch || branchId || branches[0]?.id || ""
  const [preview, setPreview] = useState<Preview | null>(null)
  const [reading, setReading] = useState(false)
  const [working, setWorking] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ created: number; duplicates: number; failed: number; errors: { row: number; message: string }[] } | null>(null)

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    setPreview(null); setResult(null); setProgress(0)
    if (!file) return
    if (file.size > 1_000_000) { toast.error("El archivo debe pesar menos de 1 MB."); return }
    setReading(true)
    try {
      const parsed = parseContacts(await file.text(), file.name, branches, effectiveBranch || undefined)
      setPreview(parsed)
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo leer el CSV.") }
    finally { setReading(false) }
  }

  async function confirm() {
    if (!preview?.rows.length || working) return
    setWorking(true)
    let created = 0, duplicates = 0, failed = 0, offset = 0
    const errors: { row: number; message: string }[] = []
    try {
      const chunks = batches(preview.rows)
      for (let index = 0; index < chunks.length; index++) {
        const batch = await crmApi.importContacts(chunks[index], false)
        created += batch.created
        duplicates += batch.duplicates
        failed += batch.failed
        errors.push(...batch.results.filter((row) => row.status === "failed").map((row) => ({ row: offset + row.row + 1, message: row.error || "No se pudo importar" })))
        offset += chunks[index].length
        setProgress(index + 1)
      }
      setResult({ created, duplicates, failed, errors })
      toast.success("Importación terminada.")
    } catch (cause) { toast.error(`${cause instanceof Error ? cause.message : "No se pudo importar."} Se procesaron ${progress} lotes; revisa el directorio antes de repetir.`) }
    finally { setWorking(false) }
  }

  return <div className="crm-screen">
    <CrmHeading title="Importar clientes" description="Revisa los registros antes de agregarlos al directorio. La importación no registra consentimiento de marketing." />
    <Card><CardHeader><CardTitle>Archivo CSV</CardTitle><CardDescription>Columnas admitidas: Nombre, Teléfono o WhatsApp, Correo y Sucursal. Máximo 1 MB o 5.000 filas.</CardDescription></CardHeader><CardContent>
      <FieldGroup>{branches.length > 0 && <Field><FieldLabel htmlFor="crm-import-branch">Sucursal predeterminada</FieldLabel><NativeSelect id="crm-import-branch" value={effectiveBranch} onChange={(event) => { setSelectedBranch(event.target.value); setPreview(null) }} className="w-full">{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></Field>}
        <Field><FieldLabel htmlFor="crm-csv-file">Seleccionar CSV</FieldLabel><Input id="crm-csv-file" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event)} disabled={working} /></Field></FieldGroup>
    </CardContent></Card>
    {reading && <p role="status" className="crm-muted">Leyendo archivo…</p>}
    {preview && <Card><CardHeader><CardTitle>Vista previa: {preview.fileName}</CardTitle><CardDescription>{preview.rows.length} contactos listos · {preview.invalid.length} filas descartadas. Los duplicados se revisan en el servidor.</CardDescription></CardHeader><CardContent>
      {preview.rows.length ? <><Table><TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Teléfono</TableHead><TableHead>Correo</TableHead></TableRow></TableHeader><TableBody>{preview.rows.slice(0, 6).map((row, index) => <TableRow key={`${row.fullName}-${index}`}><TableCell>{row.fullName}</TableCell><TableCell>{row.phone || "—"}</TableCell><TableCell>{row.email || "—"}</TableCell></TableRow>)}</TableBody></Table><p className="crm-muted">Se muestran las primeras seis filas válidas.</p></> : <CrmState title="No hay filas válidas" description="Corrige el archivo y vuelve a seleccionarlo." />}
      {preview.invalid.length > 0 && <details className="crm-import-errors"><summary>Ver filas descartadas</summary><ul>{preview.invalid.slice(0, 20).map((item) => <li key={item.row}>Fila {item.row}: {item.reason}</li>)}</ul>{preview.invalid.length > 20 && <p>Hay más filas descartadas.</p>}</details>}
      {preview.rows.length > 0 && <div className="crm-import-confirm"><Button type="button" onClick={() => void confirm()} disabled={working || !!result || !effectiveBranch}>{working ? `Importando lote ${progress + 1}…` : `Confirmar importación de ${preview.rows.length} contactos`}</Button></div>}
      {result && <p role="status" className="crm-import-result">Creados: {result.created} · Duplicados: {result.duplicates} · Fallidos: {result.failed}</p>}
      {result?.errors.length ? <details className="crm-import-errors"><summary>Ver errores de importación</summary><ul>{result.errors.slice(0, 30).map((item) => <li key={item.row}>Registro válido {item.row - 1}: {item.message}</li>)}</ul></details> : null}
    </CardContent></Card>}
  </div>
}
