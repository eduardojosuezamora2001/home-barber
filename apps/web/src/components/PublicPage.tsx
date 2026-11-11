import { useEffect, useState } from "react"
import { ArrowUpRight, Menu, UserRound, X } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { LazyBooking } from "./LazyBooking"
import { shortTime, WEEKDAYS } from "../lib/booking"
import type { Profile, PublicData, Role, SessionUser } from "../lib/types"

interface Props {
  data: PublicData | null
  error: string
  user: SessionUser | null
  role: Role
  profile: Profile | null
  onArea: () => void
  onAuth: () => void
  onRefresh: () => void | Promise<void>
}

const steps = [
  { title: "Elige tu momento", text: "Selecciona sede, servicio, barbero y un horario que te convenga. Cada elección se ve antes de escribirnos." },
  { title: "Hablemos por WhatsApp", text: "Tu consulta llega con los datos de la cita. HOME te confirma personalmente la disponibilidad y los detalles." },
  { title: "Vuelve a tu ritmo", text: "Cada visita atendida se suma a tu historial y te acerca a la próxima recompensa de una campaña vigente." },
  { title: "Recibe beneficios", text: "Descubre beneficios de bienvenida, recompensas por visitas e invitaciones que premian a ambas personas." },
]

const serviceImages = ["/images/home-interior.webp", "/images/home-ritual.webp", "/images/home-finish.webp"]

export function PublicPage({ data, error, user, role, profile, onArea, onAuth, onRefresh }: Props) {
  const [selectedService, setSelectedService] = useState(0)
  const [activeStep, setActiveStep] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bookingBranchId, setBookingBranchId] = useState("")
  const services = data?.services ?? []
  const currentService = services[selectedService] ?? services[0]
  const accountLabel = user ? role === "client" ? "Mi club" : "Mi panel" : "Iniciar sesión"

  function openAccount() {
    setMenuOpen(false)
    if (user) onArea()
    else onAuth()
  }

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    }, { threshold: 0.08 })
    document.querySelectorAll('.reveal-block').forEach((element) => observer.observe(element))
    document.body.setAttribute('data-motion-ready', '')
    return () => { observer.disconnect(); document.body.removeAttribute('data-motion-ready') }
  }, [])

  function goToService(index: number) {
    setSelectedService(index)
    document.getElementById("reservar")?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="site-shell">
      <main>
        <div className="mobile-bar"><a href="#top" className="mobile-wordmark">HOME</a><div className="mobile-bar-actions"><Button className="nav-account" onClick={openAccount}><UserRound data-icon="inline-start" aria-hidden="true" />{accountLabel}</Button><button className="mobile-menu-toggle" type="button" aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button></div></div>
        {menuOpen && <nav id="mobile-navigation" className="mobile-menu" aria-label="Menú móvil"><a onClick={() => setMenuOpen(false)} href="#servicios">Servicios</a><a onClick={() => setMenuOpen(false)} href="#experiencia">Experiencia</a><a onClick={() => setMenuOpen(false)} href="#club">Club</a><a onClick={() => setMenuOpen(false)} href="#sedes">Sedes</a><Button className="nav-account" onClick={openAccount}><UserRound data-icon="inline-start" aria-hidden="true" />{accountLabel}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Button><a onClick={() => setMenuOpen(false)} href="#reservar">Solicitar cita</a></nav>}
        <section id="top" className="hero-grid" aria-labelledby="hero-title">
          <div className="hero-name"><h1 id="hero-title">HOME</h1></div>
          <nav className="hero-nav" aria-label="Navegación principal">
            <a href="#servicios">Servicios</a><a href="#experiencia">Experiencia</a><a href="#club">Club</a><a href="#sedes">Sedes</a>
            <Button className="nav-account" onClick={openAccount}><UserRound data-icon="inline-start" aria-hidden="true" />{accountLabel}<ArrowUpRight data-icon="inline-end" aria-hidden="true" /></Button>
          </nav>
          <div className="hero-side-photo"><img src="/images/home-ritual.webp" alt="Detalle de un ritual de barba, imagen ilustrativa" width="1024" height="1280" decoding="async" /></div>
          <div className="hero-facts"><p>Un oficio.<br />Tu momento.</p><p>El detalle<br />cambia todo.</p></div>
          <div className="hero-main-photo"><img src="/images/home-hero.webp" alt="Barbero dando los últimos detalles a un corte, imagen ilustrativa" width="1536" height="1024" fetchPriority="high" /><p className="hero-subtitle">Barbería · Citas por WhatsApp</p><div className="hero-statement"><p>El buen corte se nota.<br />La experiencia se queda.</p></div><a className="hero-mobile-action" href="#reservar">Solicitar cita <ArrowUpRight aria-hidden="true" /></a></div>
          <div className="hero-rail"><span>Precisión sin prisa</span><span>Tu estilo, a tu manera</span><span>Sedes para elegir</span><span>Agenda a tu ritmo</span><a href="#reservar" className="hero-action">Solicitar cita <ArrowUpRight aria-hidden="true" /></a></div>
        </section>

        {error && <div className="data-alert" role="alert">No pudimos cargar los datos actuales. <button type="button" onClick={() => void onRefresh()}>Volver a intentar</button><small>{error}</small></div>}

        <section id="servicios" className="services-section reveal-block" aria-labelledby="services-title">
          <div className="services-image"><img src={serviceImages[selectedService] ?? serviceImages[0]} alt="Oficio de barbería, imagen ilustrativa" loading="lazy" width="1200" height="1200" /></div>
          <div className="services-content"><div className="services-top"><h2 id="services-title">Elige tu ritual</h2><p>Un servicio bien hecho comienza por escuchar lo que buscas.</p></div>
            <div className="service-selector" role="tablist" aria-label="Servicios">{services.map((service, index) => <button key={service.id} role="tab" aria-selected={selectedService === index} onClick={() => setSelectedService(index)} type="button">{service.name}</button>)}</div>
            {currentService ? <div className="service-detail"><h3>{currentService.name}</h3><p>{currentService.description}</p><div><span>{currentService.duration_minutes} minutos</span><span>{currentService.price == null ? "Precio a confirmar" : new Intl.NumberFormat("es-CR", { style: "currency", currency: "CRC", maximumFractionDigits: 0 }).format(currentService.price)}</span></div></div> : <div className="service-detail service-skeleton" aria-label="Cargando servicios"><Skeleton /><Skeleton /><Skeleton /></div>}
            <div className="services-actions"><Button onClick={() => goToService(selectedService)} disabled={!currentService}>Solicitar cita</Button><a href="#sedes">Ver horarios</a></div>
          </div>
        </section>

        <section id="experiencia" className="experience-section reveal-block" aria-labelledby="experience-title"><div className="section-heading-row"><h2 id="experience-title">Tu tiempo importa</h2><p>Un recorrido claro, desde la elección del servicio hasta el próximo encuentro.</p></div><div className="experience-panels">{steps.map((step, index) => <button key={step.title} type="button" className={activeStep === index ? "experience-panel is-open" : "experience-panel"} onClick={() => setActiveStep(index)} aria-expanded={activeStep === index}><span className="experience-panel-title">{step.title}</span>{activeStep === index && <span className="experience-panel-body">{step.text}</span>}</button>)}</div></section>

        <div className="marquee-band" aria-hidden="true"><div>HOME · EL DETALLE SE QUEDA · HOME · EL DETALLE SE QUEDA ·&nbsp;</div></div>

        <section id="club" className="club-section reveal-block" aria-labelledby="club-title"><div className="club-intro"><h2 id="club-title">Volver tiene valor</h2><p>Tu primera visita, tu próxima cita y las personas que invitas pueden tener recompensa. Crea tu cuenta y consulta las campañas disponibles para ti.</p><Button onClick={user ? onArea : onAuth}>{user ? "Ver mis beneficios" : "Crear mi cuenta"}</Button></div><div className="club-benefits"><img src="/images/home-interior.webp" alt="Estación de barbería, imagen ilustrativa" loading="lazy" width="1536" height="1024" decoding="async" /><div className="benefit-list"><div><strong>Bienvenida</strong><span>Un beneficio para volver después de tu primera visita.</span></div><div><strong>Cada visita suma</strong><span>Completa visitas y recibe recompensas por tu frecuencia.</span></div><div><strong>Inviten y ganen</strong><span>Tu invitado y tú reciben un beneficio después de su primera visita.</span></div></div><p>Beneficios sujetos a campañas vigentes. Consulta condiciones, sucursales y vencimientos en tu cuenta.</p></div></section>

        <LazyBooking data={data} user={user} profile={profile} preferredServiceId={currentService?.id ?? ""} branchId={bookingBranchId} onBranchChange={setBookingBranchId} error={error} onRetry={onRefresh} />

        <section id="sedes" className="branches-section reveal-block" aria-labelledby="branches-title"><div className="section-heading-row"><h2 id="branches-title">Encuentra tu sede</h2><p>Elige la sucursal que mejor te quede y encuentra tu próximo horario.</p></div><div className="branches-grid">{data?.branches.map((branch) => { const hours = data.branchHours.filter((hour) => hour.branch_id === branch.id); return <article key={branch.id} className="branch-block"><h3>{branch.name}</h3><p>{branch.location_label}</p><div className="branch-hours">{WEEKDAYS.map((day, index) => { const hour = hours.find((item) => item.weekday === index); return <div key={day}><span>{day}</span><span>{hour && !hour.closed ? `${shortTime(hour.opens_at)} – ${shortTime(hour.closes_at)}` : "Cerrado"}</span></div> })}</div><a href="#reservar" onClick={() => setBookingBranchId(branch.id)}>Elegir esta sede <ArrowUpRight aria-hidden="true" /></a></article> }) ?? [0,1].map((index) => <article key={index} className="branch-block branch-skeleton" aria-label="Cargando sucursales"><Skeleton /><Skeleton /><div className="branch-hours">{WEEKDAYS.map((day) => <Skeleton key={day} />)}</div></article>)}</div></section>

        <footer className="site-footer"><div className="footer-top"><div><strong>HOME</strong><span>Barbería con oficio.</span></div><div><strong>Explora</strong><a href="#servicios">Servicios</a><a href="#club">Club</a><a href="#reservar">Reservas</a></div><div><strong>Contacto</strong><a href="https://wa.me/50660524368" target="_blank" rel="noreferrer">+506 6052 4368</a><span>WhatsApp Business</span></div><div><strong>Tu cuenta</strong><button type="button" onClick={user ? onArea : onAuth}>{user ? "Abrir mi espacio" : "Iniciar sesión"}</button><span>Atención por cita y WhatsApp.</span></div></div><div className="footer-name">HOME</div><div className="footer-bottom"><span>© {new Date().getFullYear()} HOME</span><span>Hecho para volver.</span></div></footer>
      </main>
    </div>
  )
}
