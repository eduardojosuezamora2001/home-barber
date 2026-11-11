import { useState, type FormEvent } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@workspace/ui/components/input-group"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { api } from "../lib/api"
import { pendingInvitation, saveInvitation } from "../lib/loyalty"

export type AuthMode = "entrar" | "registro" | "recuperar" | "reenviar" | "nueva-clave"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAuthenticated: () => Promise<void>
  initialMode: AuthMode
  initialMessage?: string
}

export function AuthDialog({ open, onOpenChange, onAuthenticated, initialMode, initialMessage = "" }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [working, setWorking] = useState(false)
  const [message, setMessage] = useState(initialMessage)
  const [messageIsError, setMessageIsError] = useState(false)
  const [invitation, setInvitation] = useState(pendingInvitation)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setWorking(true)
    setMessage("")
    setMessageIsError(false)
    try {
      if (mode === "reenviar") {
        await api.post("/auth/resend-confirmation", { email: email.trim() })
        setMessage("Si tu cuenta está pendiente de confirmación, recibirás un enlace nuevo.")
      } else if (mode === "recuperar") {
        await api.post("/auth/password/reset-request", { email: email.trim() })
        setMessage("Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña.")
      } else if (mode === "nueva-clave") {
        await api.post("/auth/password", { password })
        await onAuthenticated()
        onOpenChange(false)
      } else if (mode === "registro") {
        saveInvitation(invitation)
        const result = await api.post<{ needsConfirmation: boolean }>("/auth/signup", { email: email.trim(), password, fullName: name.trim() })
        if (!result.needsConfirmation) {
          await onAuthenticated()
          onOpenChange(false)
        } else {
          setMode("reenviar")
          setMessage("Te enviamos un enlace de confirmación. Al abrirlo, entrarás a tu cuenta. Si no llega, puedes reenviarlo aquí.")
        }
      } else {
        await api.post("/auth/signin", { email: email.trim(), password })
        await onAuthenticated()
        onOpenChange(false)
      }
    } catch (error) {
      const authMessage = error instanceof Error ? error.message : "No fue posible continuar."
      setMessageIsError(true)
      setMessage(authMessage)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setPasswordVisible(false); onOpenChange(nextOpen) }}>
      <DialogContent className="home-dialog">
        <DialogHeader>
          <DialogTitle>{mode === "nueva-clave" ? "Crea una nueva contraseña" : mode === "recuperar" ? "Recupera tu cuenta" : mode === "reenviar" ? "Confirma tu correo" : "Tu espacio en HOME"}</DialogTitle>
          <DialogDescription>{mode === "nueva-clave" ? "Elige una contraseña nueva para seguir usando tu cuenta." : mode === "recuperar" ? "Te enviaremos un enlace al correo de tu cuenta." : mode === "reenviar" ? "Solicita un enlace nuevo si no llegó el correo de confirmación." : "Guarda tus solicitudes, sigue tus visitas y recibe beneficios cuando estén disponibles."}</DialogDescription>
        </DialogHeader>
        {(mode === "entrar" || mode === "registro") && <Tabs value={mode} onValueChange={(value) => { setMode(value as AuthMode); setMessage(""); setPasswordVisible(false) }}>
          <TabsList className="w-full">
            <TabsTrigger value="entrar">Iniciar sesión</TabsTrigger>
            <TabsTrigger value="registro">Crear cuenta</TabsTrigger>
          </TabsList>
        </Tabs>}
        <form onSubmit={submit} className="mt-6">
          <FieldGroup>
            {mode === "registro" && <Field><FieldLabel htmlFor="auth-name">Nombre</FieldLabel><Input id="auth-name" value={name} onChange={(event) => setName(event.target.value)} required /></Field>}
            {mode === "registro" && <Field><FieldLabel htmlFor="auth-invitation">Código de invitación (opcional)</FieldLabel><Input id="auth-invitation" value={invitation} onChange={(event) => setInvitation(event.target.value)} placeholder="INV-XXXXXXXXXXXX" maxLength={16} pattern="[Ii][Nn][Vv]-[a-fA-F0-9]{12}" /><p className="field-hint">Al entrar a tu cuenta, confirma la invitación antes de tu primera visita.</p></Field>}
            {mode !== "nueva-clave" && <Field><FieldLabel htmlFor="auth-email">Correo</FieldLabel><Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>}
            {mode !== "recuperar" && mode !== "reenviar" && <Field><FieldLabel htmlFor="auth-password">{mode === "nueva-clave" ? "Nueva contraseña" : "Contraseña"}</FieldLabel><InputGroup>
              <InputGroupInput id="auth-password" type={passwordVisible ? "text" : "password"} autoComplete={mode === "registro" || mode === "nueva-clave" ? "new-password" : "current-password"} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
              <InputGroupAddon align="inline-end"><InputGroupButton type="button" size="icon-sm" aria-label={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"} title={passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={passwordVisible} aria-controls="auth-password" onClick={() => setPasswordVisible((visible) => !visible)}>{passwordVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</InputGroupButton></InputGroupAddon>
            </InputGroup></Field>}
            {message && <p role={messageIsError ? "alert" : "status"} data-error={messageIsError} className="form-message">{message}</p>}
            <Button type="submit" disabled={working} className="w-full">{working ? "Un momento…" : mode === "registro" ? "Crear mi cuenta" : mode === "recuperar" ? "Enviar enlace" : mode === "reenviar" ? "Reenviar confirmación" : mode === "nueva-clave" ? "Guardar contraseña" : "Entrar"}</Button>
          </FieldGroup>
        </form>
        {mode === "entrar" && <button type="button" className="auth-link" onClick={() => { setMode("recuperar"); setMessage("") }}>¿Olvidaste tu contraseña?</button>}
        {mode === "entrar" && <button type="button" className="auth-link" onClick={() => { setMode("reenviar"); setMessage("") }}>¿No recibiste la confirmación?</button>}
        {(mode === "recuperar" || mode === "reenviar") && <button type="button" className="auth-link" onClick={() => { setMode("entrar"); setMessage("") }}>Volver a iniciar sesión</button>}
      </DialogContent>
    </Dialog>
  )
}
