export type Role = "owner" | "barber" | "manager" | "client"
export type DiscountType = "none" | "fixed" | "percentage"
export interface DiscountDefinition { discount_type: DiscountType; discount_value: number }
export interface SessionUser { id: string; email: string | null }
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled"

export interface Branch {
  id: string
  slug: string
  name: string
  location_label: string
  address: string | null
  whatsapp: string
  timezone: string
  active: boolean
}

export interface BranchHour {
  id: string
  branch_id: string
  weekday: number
  opens_at: string | null
  closes_at: string | null
  closed: boolean
}

export interface Service {
  id: string
  name: string
  description: string
  duration_minutes: number
  price: number | null
  points: number
  active: boolean
  sort_order: number
}

export interface Barber {
  id: string
  user_id: string | null
  display_name: string
  specialty: string
  bio: string
  is_demo: boolean
  active: boolean
}

export interface BarberBranch {
  barber_id: string
  branch_id: string
}

export interface BarberHour {
  id: string
  barber_id: string
  branch_id: string
  weekday: number
  opens_at: string
  closes_at: string
}

export interface BarberBlock {
  id: string
  barber_id: string
  branch_id: string
  appointment_id: string | null
  starts_at: string
  ends_at: string
  label: string
}

export interface Profile {
  id: string
  email: string | null
  full_name: string
  phone: string | null
}

export interface LoyaltyAccount {
  client_id: string
  visits: number
  points_total: number
  referral_code: string
  last_visit_at: string | null
}

export interface Appointment {
  id: string
  client_id: string | null
  contact_id?: string | null
  branch_id: string
  barber_id: string
  service_id: string
  requested_at: string
  ends_at: string
  customer_name: string
  customer_whatsapp: string
  notes: string
  status: AppointmentStatus
  created_at: string
}

export interface Promotion extends DiscountDefinition {
  id: string
  title: string
  description: string
  benefit_text: string
  branch_id: string | null
  kind: "legacy" | "welcome" | "frequency" | "referral" | "targeted"
  visits_every: number | null
  reward_valid_days: number
  referral_benefit_text: string | null
  referral_discount_type: DiscountType
  referral_discount_value: number
  min_visits: number
  max_visits: number | null
  min_points: number
  inactive_days: number | null
  starts_at: string
  ends_at: string
  active: boolean
  created_at: string
}

export interface Coupon extends DiscountDefinition {
  id: string
  promotion_id: string
  client_id: string
  code: string
  status: "available" | "redeemed"
  claimed_at: string
  redeemed_at: string | null
  reward_key: string
  benefit_text: string
  expires_at: string
}

export interface Referral {
  invited_id: string
  referrer_id: string
  promotion_id: string
  joined_at: string
  rewarded_at: string | null
}

export interface PublicData {
  branches: Branch[]
  branchHours: BranchHour[]
  services: Service[]
  barbers: Barber[]
  barberBranches: BarberBranch[]
  barberHours: BarberHour[]
  barberBlocks: BarberBlock[]
}

export interface SessionData {
  user: SessionUser | null
  profile: Profile | null
  loyalty: LoyaltyAccount | null
  role: Role
  branchId?: string | null
}

export interface ManagerAssignment { user_id: string; branch_id: string }
export interface ReceiptLine { serviceId: string; name: string; quantity: number; unitPrice: number; lineTotal: number; points: number }
export interface ReceiptSummary { id: string; number: number; branch_id: string; appointment_id?: string | null; client_name: string; barber_name: string; total: number; issued_at: string }
export interface ServiceReceipt extends ReceiptSummary {
  client_id: string | null; contact_id?: string | null; barber_id: string; issued_by: string; appointment_id: string | null
  client_email: string | null; branch_name: string; items: ReceiptLine[]; subtotal: number; currency: "CRC"; note: string
  coupon_id?: string | null; coupon_code?: string | null; discount_amount?: number; discount_description?: string | null
  discount_type?: DiscountType; discount_value?: number
}
export interface ReceiptCoupon extends DiscountDefinition { id: string; code: string; benefit_text: string; expires_at: string; title: string }
export type ClientReceipt = Omit<ServiceReceipt, "issued_by">
export interface ClientReceiptPage { receipts: (ReceiptSummary & { branch_name: string })[]; hasMore: boolean }
export interface ManagerDashboard {
  branch: Branch
  barbers: Pick<Barber, "id" | "display_name" | "specialty" | "active">[]
  assignments: BarberBranch[]
  services: Pick<Service, "id" | "name" | "price" | "points" | "active">[]
  appointments: Pick<Appointment, "id" | "client_id" | "contact_id" | "barber_id" | "branch_id" | "requested_at" | "status" | "customer_name">[]
  receipts: ReceiptSummary[]
}

export interface ClientDashboard { appointments: Appointment[]; promotions: Promotion[]; coupons: Coupon[]; referrals: Referral[]; loyalty: LoyaltyAccount }
export interface StaffDashboard { appointments: Appointment[] }
export interface OwnerDashboard extends Omit<ClientDashboard, "loyalty"> { profiles: Profile[]; loyaltyAccounts: LoyaltyAccount[]; managers: ManagerAssignment[]; catalog: PublicData }

