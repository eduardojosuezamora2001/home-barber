import { useRef, useState, type FormEvent } from "react"
import { LoaderCircle, Save } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@workspace/ui/components/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { api } from "../lib/api"
import type { Profile, SessionUser } from "../lib/types"

const normalizePhone = (value: string) => value.trim().replace(/[\s()+.-]/g, "")

export function ClientProfile({ user, profile, onRefresh }: { user: SessionUser; profile: Profile | null; onRefresh: () => void | Promise<void> }) {
  const [saved, setSaved] = useState({ fullName: profile?.full_name ?? "", phone: profile?.phone ?? "" })
  const [fullName, setFullName] = useState(saved.fullName)
  const [phone, setPhone] = useState(saved.phone)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const nameInput = useRef<HTMLInputElement>(null)
  const phoneInput = useRef<HTMLInputElement>(null)
  const changed = fullName.trim() !== saved.fullName || normalizePhone(phone) !== normalizePhone(saved.phone)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const name = fullName.trim()
    const contact = normalizePhone(phone)
    const invalid = {
      ...(name.length < 2 || name.length > 100 ? { fullName: "Escribe tu nombre, entre 2 y 100 caracteres." } : {}),
      ...(contact && !/^\d{8,15}$/.test(contact) ? { phone: "Ingresa un WhatsApp de 8 a 15 dígitos, con código de país si corresponde." } : {}),
    }
    setErrors(invalid)
    setError("")
    setNotice("")
    if (invalid.fullName) { nameInput.current?.focus(); return }
    if (invalid.phone) { phoneInput.current?.focus(); return }
    setSaving(true)
    try {
      const updated = await api.patch<Profile>("/client/profile", { fullName: name, phone: contact || null })
      const next = { fullName: updated.full_name, phone: updated.phone ?? "" }
      setSaved(next)
      setFullName(next.fullName)
      setPhone(next.phone)
      setNotice("Tus datos se guardaron correctamente.")
      await onRefresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar tus datos. Intenta de nuevo.") }
    finally { setSaving(false) }
  }

  function reset() {
    setFullName(saved.fullName)
    setPhone(saved.phone)
    setErrors({})
    setError("")
    setNotice("")
  }

  return <section className="client-profile" aria-labelledby="client-profile-title"><Card>
    <CardHeader><CardTitle id="client-profile-title">Mis datos</CardTitle><CardDescription>Actualiza tu nombre y el WhatsApp donde podemos contactarte sobre tus citas.</CardDescription></CardHeader>
    <CardContent><form onSubmit={submit} noValidate aria-busy={saving}><FieldGroup>
      <Field><FieldLabel htmlFor="client-email">Correo de la cuenta</FieldLabel><Input id="client-email" type="email" value={profile?.email ?? user.email ?? ""} readOnly autoComplete="email" aria-describedby="client-email-help" /><FieldDescription id="client-email-help">Correo vinculado a tu cuenta y a tus beneficios.</FieldDescription></Field>
      <Field data-invalid={!!errors.fullName} data-disabled={saving}><FieldLabel htmlFor="client-name">Nombre completo</FieldLabel><Input ref={nameInput} id="client-name" name="fullName" autoComplete="name" value={fullName} onChange={(event) => { setFullName(event.target.value); setErrors((current) => ({ ...current, fullName: undefined })); setError(""); setNotice("") }} maxLength={100} required disabled={saving} aria-invalid={!!errors.fullName} aria-describedby={errors.fullName ? "client-name-error" : undefined} />{errors.fullName && <FieldError id="client-name-error">{errors.fullName}</FieldError>}</Field>
      <Field data-invalid={!!errors.phone} data-disabled={saving}><FieldLabel htmlFor="client-phone">WhatsApp</FieldLabel><Input ref={phoneInput} id="client-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => { setPhone(event.target.value); setErrors((current) => ({ ...current, phone: undefined })); setError(""); setNotice("") }} maxLength={40} placeholder="+506 8888 8888" disabled={saving} aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "client-phone-help client-phone-error" : "client-phone-help"} /><FieldDescription id="client-phone-help">Opcional. Incluye el código de país si corresponde.</FieldDescription>{errors.phone && <FieldError id="client-phone-error">{errors.phone}</FieldError>}</Field>
      {error && <FieldError>{error}</FieldError>}
      {notice && <p role="status" className="client-profile-notice">{notice}</p>}
      <div className="client-profile-actions"><Button type="submit" disabled={saving || !changed}>{saving ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <Save data-icon="inline-start" />}{saving ? "Guardando…" : "Guardar cambios"}</Button><Button type="button" variant="outline" disabled={saving || !changed} onClick={reset}>Descartar cambios</Button></div>
    </FieldGroup></form></CardContent>
  </Card></section>
}
