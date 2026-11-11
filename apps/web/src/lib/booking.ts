import type { BarberBlock, BarberHour, BranchHour, Service } from "./types"

export const WEEKDAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
const OFFSET = "-06:00"

export function costaRicaToday() {
  return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function dateChoices(count = 14) {
  const base = new Date(`${costaRicaToday()}T12:00:00Z`)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(base)
    date.setUTCDate(date.getUTCDate() + index)
    return date.toISOString().slice(0, 10)
  })
}

export function weekdayOf(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay()
}

export function toUtc(date: string, time: string) {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString()
}

export function displayDate(value: string) {
  return new Intl.DateTimeFormat("es-CR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Costa_Rica",
  }).format(new Date(`${value}T12:00:00${OFFSET}`))
}

export function displayTime(value: string) {
  return new Intl.DateTimeFormat("es-CR", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "America/Costa_Rica",
  }).format(new Date(value))
}

export function shortTime(value: string | null) {
  if (!value) return "—"
  return value.slice(0, 5)
}

function toMinutes(time: string) {
  const [hour, minute] = time.split(":").map(Number)
  return hour * 60 + minute
}

function fromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
}

export function availableSlots(
  date: string,
  branchId: string,
  barberId: string,
  service: Service | undefined,
  branchHours: BranchHour[],
  barberHours: BarberHour[],
  blocks: BarberBlock[]
) {
  if (!service) return []
  const weekday = weekdayOf(date)
  const branch = branchHours.find((hour) => hour.branch_id === branchId && hour.weekday === weekday)
  const barber = barberHours.find(
    (hour) => hour.branch_id === branchId && hour.barber_id === barberId && hour.weekday === weekday
  )
  if (!branch || branch.closed || !branch.opens_at || !branch.closes_at || !barber) return []
  const start = Math.max(toMinutes(branch.opens_at), toMinutes(barber.opens_at))
  const end = Math.min(toMinutes(branch.closes_at), toMinutes(barber.closes_at))
  const slots: string[] = []
  for (let minute = start; minute + service.duration_minutes <= end; minute += 30) {
    const time = fromMinutes(minute)
    const startsAt = Date.parse(toUtc(date, time))
    const endsAt = startsAt + service.duration_minutes * 60_000
    if (startsAt <= Date.now() + 30 * 60_000) continue
    if (blocks.some((block) => block.barber_id === barberId && block.branch_id === branchId &&
      startsAt < Date.parse(block.ends_at) && endsAt > Date.parse(block.starts_at))) continue
    slots.push(time)
  }
  return slots
}

export function whatsappUrl(number: string, message: string) {
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`
}
