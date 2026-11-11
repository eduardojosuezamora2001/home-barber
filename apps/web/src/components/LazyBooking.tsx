import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { Button } from "@workspace/ui/components/button"
import type { Profile, PublicData, SessionUser } from "../lib/types"
import { BookingSkeleton } from "./LoadingSkeleton"

const BookingSection = lazy(() => import("./BookingSection").then((module) => ({ default: module.BookingSection })))

interface Props {
  data: PublicData | null
  user: SessionUser | null
  profile: Profile | null
  preferredServiceId: string
  branchId: string
  onBranchChange: (branchId: string) => void
  error: string
  onRetry: () => void | Promise<void>
}

export function LazyBooking(props: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [nearby, setNearby] = useState(false)

  useEffect(() => {
    const element = container.current
    if (!element) return
    if (!("IntersectionObserver" in window)) {
      queueMicrotask(() => setNearby(true))
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) { setNearby(true); observer.disconnect() }
    }, { rootMargin: "700px 0px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!props.data && props.error) {
    return <div id="reservar" ref={container}><section className="booking-section booking-error" role="alert"><h2>La agenda no está disponible</h2><p>No pudimos cargar los horarios actuales. Vuelve a intentarlo para elegir tu cita.</p><Button onClick={() => void props.onRetry()}>Reintentar</Button></section></div>
  }

  return <div id="reservar" ref={container}>{nearby && props.data ? <Suspense fallback={<BookingSkeleton />}><BookingSection {...props} /></Suspense> : <BookingSkeleton />}</div>
}
