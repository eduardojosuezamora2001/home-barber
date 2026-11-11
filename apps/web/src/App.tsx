import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router"
import { Button } from "@workspace/ui/components/button"
import { Toaster } from "sonner"
import { PublicPage } from "./components/PublicPage"
import { AreaSkeleton } from "./components/LoadingSkeleton"
import { api } from "./lib/api"
import { pendingInvitation } from "./lib/loyalty"
import { loadPublicData, loadSession } from "./lib/data"
import type { LoyaltyAccount, Profile, PublicData, Role, SessionData, SessionUser } from "./lib/types"
import type { AuthMode } from "./components/AuthDialog"

const ClientArea = lazy(() => import("./components/ClientArea").then((module) => ({ default: module.ClientArea })))
const OwnerArea = lazy(() => import("./components/OwnerArea").then((module) => ({ default: module.OwnerArea })))
const StaffArea = lazy(() => import("./components/StaffArea").then((module) => ({ default: module.StaffArea })))
const ManagerArea = lazy(() => import("./components/ManagerArea").then((module) => ({ default: module.ManagerArea })))
const AuthDialog = lazy(() => import("./components/AuthDialog").then((module) => ({ default: module.AuthDialog })))

const rolePath: Record<Role, string> = { owner: "/admin", barber: "/barbero", manager: "/encargado", client: "/cliente" }

function LegacyPanelRedirect({ root }: { root: "/admin" | "/encargado" }) {
  const location = useLocation()
  const oldSection = location.pathname.slice(root.length).replace(/^\/+/, "")
  const section = oldSection === "encargados" || oldSection === "sucursales/nueva" ? oldSection === "encargados" ? "equipo" : "nueva"
    : oldSection === "sucursales" ? "sedes"
      : oldSection === "crm" || oldSection.startsWith("crm/") ? oldSection
        : oldSection
  return <Navigate to={`${root}${location.search}${section ? `#${section}` : ""}`} replace />
}

function RoleGate({ loading, user, role, required, onAuth, children }: {
  loading: boolean
  user: SessionUser | null
  role: Role
  required: Role
  onAuth: () => void
  children: ReactNode
}) {
  if (loading) return <AreaSkeleton />
  if (!user) return <main className="access-page"><div><span>HOME / Acceso</span><h1>Inicia sesión para continuar</h1><p>Este espacio está disponible para las cuentas autorizadas.</p><div className="access-actions"><Button onClick={onAuth}>Entrar a mi cuenta</Button><Link to="/">Volver al sitio</Link></div></div></main>
  if (role !== required) return <Navigate to={rolePath[role]} replace />
  return children
}

export function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const [publicData, setPublicData] = useState<PublicData | null>(null)
  const [publicError, setPublicError] = useState("")
  const [user, setUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null)
  const [role, setRole] = useState<Role>("client")
  const [authLoading, setAuthLoading] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<AuthMode>("entrar")
  const [authNotice, setAuthNotice] = useState("")
  const bootstrapped = useRef(false)

  const refreshPublic = useCallback(async (force = true) => {
    try {
      setPublicData(await loadPublicData(force))
      setPublicError("")
    } catch (error) {
      setPublicError(error instanceof Error ? error.message : "No se pudieron cargar los horarios.")
    }
  }, [])

  const refreshIdentity = useCallback(async (): Promise<SessionData | null> => {
    try {
      const identity = await loadSession()
      setUser(identity.user)
      setProfile(identity.profile)
      setLoyalty(identity.loyalty)
      setRole(identity.role)
      return identity
    } catch {
      setUser(null)
      setProfile(null)
      setLoyalty(null)
      setRole("client")
      return null
    } finally {
      setAuthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    pendingInvitation()
    const fragment = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = fragment.get("access_token")
    const refreshToken = fragment.get("refresh_token")
    const authType = fragment.get("type")
    const linkError = fragment.get("error_description") || fragment.get("error")
    if (accessToken || refreshToken || linkError) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    }
    void refreshPublic(false)
    if (accessToken && refreshToken) {
      void api.post("/auth/complete", { accessToken, refreshToken }).then(async () => {
        const identity = await refreshIdentity()
        if (authType === "recovery") {
          setAuthMode("nueva-clave")
          setAuthOpen(true)
        } else if (identity?.user) {
          navigate(rolePath[identity.role], { replace: true })
        }
      }).catch((error) => {
        setAuthLoading(false)
        setAuthMode(authType === "recovery" ? "recuperar" : "entrar")
        setAuthNotice(error instanceof Error ? error.message : "No pudimos validar el enlace.")
        setAuthOpen(true)
      })
    } else {
      void Promise.resolve().then(refreshIdentity)
      if (linkError || accessToken || refreshToken) {
        queueMicrotask(() => {
          setAuthMode(authType === "recovery" ? "recuperar" : "entrar")
          setAuthNotice("El enlace venció o no es válido. Puedes volver a entrar o solicitar uno nuevo.")
          setAuthOpen(true)
        })
      }
    }
  }, [refreshPublic, refreshIdentity, navigate])

  const openAuth = () => {
    setAuthMode("entrar")
    setAuthNotice("")
    setAuthOpen(true)
  }

  const showArea = () => {
    if (!user) return openAuth()
    navigate(rolePath[role])
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const showHome = () => {
    navigate("/")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const signOut = async () => {
    await api.post("/auth/signout")
    setUser(null)
    setProfile(null)
    setLoyalty(null)
    setRole("client")
    showHome()
  }

  const authenticated = async () => {
    const identity = await refreshIdentity()
    if (!identity?.user) return
    const current = location.pathname
    const allowedCurrent = identity.role === "owner" ? current.startsWith("/admin") : identity.role === "manager" ? current.startsWith("/encargado") : current === rolePath[identity.role]
    if (!allowedCurrent) navigate(rolePath[identity.role], { replace: true })
  }

  return <>
    <Toaster position="top-right" theme="dark" closeButton richColors />
    <Suspense fallback={<AreaSkeleton />}>
      <Routes>
        <Route path="/" element={<PublicPage data={publicData} error={publicError} user={user} role={role} profile={profile} onArea={showArea} onAuth={openAuth} onRefresh={refreshPublic} />} />
        <Route path="/admin" element={<RoleGate loading={authLoading} user={user} role={role} required="owner" onAuth={openAuth}>{user && <OwnerArea data={publicData} user={user} profile={profile} onHome={showHome} onSignOut={signOut} onRefresh={refreshPublic} />}</RoleGate>} />
        <Route path="/admin/*" element={<LegacyPanelRedirect root="/admin" />} />
        <Route path="/barbero" element={<RoleGate loading={authLoading} user={user} role={role} required="barber" onAuth={openAuth}>{user && <StaffArea data={publicData} user={user} profile={profile} onHome={showHome} onSignOut={signOut} onRefresh={refreshPublic} />}</RoleGate>} />
        <Route path="/encargado/crm/*" element={<LegacyPanelRedirect root="/encargado" />} />
        <Route path="/encargado/*" element={<RoleGate loading={authLoading} user={user} role={role} required="manager" onAuth={openAuth}>{user && <ManagerArea user={user} onHome={showHome} onSignOut={signOut} />}</RoleGate>} />
        <Route path="/cliente" element={<RoleGate loading={authLoading} user={user} role={role} required="client" onAuth={openAuth}>{user && <ClientArea data={publicData} user={user} profile={profile} loyalty={loyalty} onHome={showHome} onSignOut={signOut} onRefresh={async () => { await refreshIdentity() }} />}</RoleGate>} />
        <Route path="*" element={<main className="access-page"><div><span>HOME / Página no encontrada</span><h1>Esta página no existe</h1><Link to="/">Volver al sitio</Link></div></main>} />
      </Routes>
    </Suspense>
    {authOpen && <Suspense fallback={null}><AuthDialog key={authMode} initialMode={authMode} initialMessage={authNotice} open={authOpen} onOpenChange={setAuthOpen} onAuthenticated={authenticated} /></Suspense>}
  </>
}
