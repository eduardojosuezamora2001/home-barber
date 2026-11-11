import { api } from "./api"

export type CrmRole = "owner" | "manager"

export interface CrmContactRef {
  id: string
  full_name: string
  phone: string | null
  is_demo?: boolean
}

export interface CrmContact extends CrmContactRef {
  profile_id: string | null
  email: string | null
  source: string
  created_at: string
  updated_at: string
  spent?: number
  attendances?: number
}

export interface CrmConsent {
  channel: string
  status: string
  source: string
  evidence: string | null
  updated_at: string
}

export interface CrmInquiry {
  id: string
  contact_id: string
  branch_id: string
  service_id: string | null
  preferred_at: string | null
  message: string | null
  status: string
  source: string
  created_at: string
  updated_at: string
  contact?: CrmContactRef | null
}

export interface CrmTask {
  id: string
  contact_id: string
  branch_id: string
  title: string
  description: string | null
  due_at: string
  status: "open" | "done" | "cancelled"
  assigned_to: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
  contact?: CrmContactRef | null
}

export interface CrmActivity {
  id: string
  contact_id: string
  branch_id: string
  kind: string
  body: string
  is_marketing?: boolean
  occurred_at: string
  created_at: string
}

export interface CrmCampaign {
  id: string
  branch_id: string
  name: string
  goal: string
  channel: string
  message_template: string
  status: string
  promotion_id: string | null
  discount_type: "none" | "fixed" | "percentage"
  discount_value: number
  coupon_valid_days: number
  created_at: string
  updated_at: string
}

export interface CrmCampaignRecipient {
  id: string
  campaign_id: string
  contact_id: string
  branch_id: string
  status: string
  contacted_at: string | null
  notes: string | null
  created_at: string
  contact?: CrmContactRef | null
  coupon_code?: string | null
}

export interface CrmSummary {
  contactsTotal: number
  inquiriesOpen: number
  tasksDue: number
  tasksOverdue: number
  campaignsActive: number
}

export interface CrmOpportunities {
  rebooking: { contact_id: string; branch_id: string; name: string; phone: string | null; due_at: string; is_demo_interval: boolean }[]
  inactive: { contact_id: string; branch_id: string; name: string; phone: string | null; due_at: string; is_demo_interval: boolean }[]
  cancellations: { id: string; branch_id: string; barber_id: string; service_id: string; requested_at: string }[]
  sampleLimited: boolean
}

export interface CrmReport {
  periodDays: number
  paidReceipts: number
  documentedRevenue: number
  customers: number
  customersWithMultipleReceipts: number
  contacted: number
  bookedReported: number
  returnedReported: number
  months: { month: string; receipts: number; revenue: number }[]
  sampleLimited: boolean
}

export interface CrmPage<T> {
  total: number
  page: number
  pageSize: number
  contacts?: T[]
  tasks?: T[]
  inquiries?: T[]
}

export interface CrmContactDetail {
  contact: CrmContact
  branches: { id: string; name?: string }[]
  consents: CrmConsent[]
  inquiries: CrmInquiry[]
  tasks: CrmTask[]
  activities: CrmActivity[]
  appointments: Record<string, unknown>[]
  receipts: Record<string, unknown>[]
  summary?: {
    completedAppointments: number
    walkInReceipts: number
    documentedReceipts: number
  }
  hasMore?: boolean
}

export interface CrmListQuery {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  branchId?: string
  includeDemo?: boolean
  marketingEligible?: boolean
  minSpent?: number
  maxSpent?: number
  spentFrom?: string
  spentTo?: string
  minAttendances?: number
  maxAttendances?: number
  attendanceFrom?: string
  attendanceTo?: string
}

export interface CrmContactInput {
  fullName: string
  email?: string | null
  phone?: string | null
  source?: string
  branchId?: string
}

export interface CrmTaskInput {
  contactId: string
  branchId?: string
  title: string
  description?: string
  dueAt: string
  assignedTo?: string
}

export interface CrmCampaignInput {
  name: string
  goal: string
  messageTemplate: string
  branchId?: string
  discountType?: "none" | "fixed" | "percentage"
  discountValue?: number
  couponValidDays?: number
}

function queryString(query: CrmListQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value))
  }
  const result = params.toString()
  return result ? `?${result}` : ""
}

const prefix = (role: CrmRole) => `/${role}/crm`

export const crmApi = {
  summary: (role: CrmRole, branchId?: string) =>
    api.get<CrmSummary>(`${prefix(role)}/summary${queryString({ branchId })}`),
  opportunities: (role: CrmRole, branchId?: string) =>
    api.get<CrmOpportunities>(`${prefix(role)}/opportunities${queryString({ branchId })}`),
  reports: (role: CrmRole, branchId?: string) =>
    api.get<CrmReport>(`${prefix(role)}/reports${queryString({ branchId })}`),
  contacts: (role: CrmRole, query: CrmListQuery = {}) =>
    api.get<{ contacts: CrmContact[]; total: number; page: number; pageSize: number }>(`${prefix(role)}/contacts${queryString(query)}`),
  contact: (role: CrmRole, id: string, branchId?: string) =>
    api.get<CrmContactDetail>(`${prefix(role)}/contacts/${encodeURIComponent(id)}${queryString({ branchId })}`),
  createContact: (role: CrmRole, body: CrmContactInput) =>
    api.post<{ contact: CrmContact }>(`${prefix(role)}/contacts`, body),
  updateContact: (role: CrmRole, id: string, body: Partial<CrmContactInput>) =>
    api.patch<{ contact: CrmContact }>(`${prefix(role)}/contacts/${encodeURIComponent(id)}`, body),
  tasks: (role: CrmRole, query: CrmListQuery = {}) =>
    api.get<{ tasks: CrmTask[]; total: number; page: number; pageSize: number }>(`${prefix(role)}/tasks${queryString(query)}`),
  createTask: (role: CrmRole, body: CrmTaskInput) =>
    api.post<{ task: CrmTask }>(`${prefix(role)}/tasks`, body),
  updateTask: (role: CrmRole, id: string, body: { status?: CrmTask["status"]; dueAt?: string; assignedTo?: string | null }) =>
    api.patch<{ task: CrmTask }>(`${prefix(role)}/tasks/${encodeURIComponent(id)}`, body),
  inquiries: (role: CrmRole, query: CrmListQuery = {}) =>
    api.get<{ inquiries: CrmInquiry[]; total: number; page: number; pageSize: number }>(`${prefix(role)}/inquiries${queryString(query)}`),
  updateInquiry: (role: CrmRole, id: string, status: string) =>
    api.patch<{ inquiry: CrmInquiry }>(`${prefix(role)}/inquiries/${encodeURIComponent(id)}`, { status }),
  addActivity: (role: CrmRole, contactId: string, body: { kind: string; body: string; branchId?: string; isMarketing?: boolean; occurredAt?: string }) =>
    api.post<{ activity: CrmActivity }>(`${prefix(role)}/contacts/${encodeURIComponent(contactId)}/activities`, body),
  campaigns: (role: CrmRole, branchId?: string) =>
    api.get<{ campaigns: CrmCampaign[] }>(`${prefix(role)}/campaigns${queryString({ branchId })}`),
  createCampaign: (role: CrmRole, body: CrmCampaignInput) =>
    api.post<{ campaign: CrmCampaign }>(`${prefix(role)}/campaigns`, body),
  updateCampaign: (role: CrmRole, id: string, body: Partial<CrmCampaignInput> & { status?: string }) =>
    api.patch<{ campaign: CrmCampaign }>(`${prefix(role)}/campaigns/${encodeURIComponent(id)}`, body),
  recipients: (role: CrmRole, id: string, page = 1, pageSize = 25) =>
    api.get<{ recipients: CrmCampaignRecipient[]; total: number }>(`${prefix(role)}/campaigns/${encodeURIComponent(id)}/recipients${queryString({ page, pageSize })}`),
  addRecipients: (role: CrmRole, id: string, contactIds: string[]) =>
    api.post<{ recipients: CrmCampaignRecipient[]; warnings: { contactId: string; warning: string }[] }>(`${prefix(role)}/campaigns/${encodeURIComponent(id)}/recipients`, { contactIds }),
  updateRecipient: (role: CrmRole, campaignId: string, recipientId: string, body: { status: string; notes?: string }) =>
    api.patch<{ recipient: CrmCampaignRecipient }>(`${prefix(role)}/campaigns/${encodeURIComponent(campaignId)}/recipients/${encodeURIComponent(recipientId)}`, body),
  importContacts: (rows: CrmContactInput[], dryRun = true) =>
    api.post<{ dryRun: boolean; created: number; duplicates: number; failed: number; results: { row: number; status: string; error?: string }[] }>("/owner/crm/imports", { rows, dryRun }),
  updateConsent: (role: CrmRole, id: string, body: { status: "granted" | "revoked" | "unknown"; source: string; evidence: string }) =>
    api.put<{ consent: CrmConsent }>(`${prefix(role)}/contacts/${encodeURIComponent(id)}/consents/whatsapp`, body),
  marketingEligibility: (role: CrmRole, id: string) =>
    api.get<{ eligibility: { allowed: boolean; reason: string | null; warning: string | null } }>(`${prefix(role)}/contacts/${encodeURIComponent(id)}/marketing-eligibility`),
  intervals: (role: CrmRole) =>
    api.get<{ intervals: { service_id: string; return_days: number; is_demo: boolean; service?: { name: string } }[] }>(`${prefix(role)}/service-intervals`),
  updateInterval: (serviceId: string, returnDays: number, isDemo: boolean) =>
    api.patch(`/owner/crm/service-intervals/${encodeURIComponent(serviceId)}`, { returnDays, isDemo }),
  marketingSettings: (role: CrmRole) =>
    api.get<{ settings: { max_contacts_7_days: number; max_contacts_30_days: number; is_demo: boolean } }>(`${prefix(role)}/marketing-settings`),
  updateMarketingSettings: (maxContacts7Days: number, maxContacts30Days: number, isDemo: boolean) =>
    api.patch("/owner/crm/marketing-settings", { maxContacts7Days, maxContacts30Days, isDemo }),
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
})

export const crmDateTime = (value: string | null | undefined) =>
  value ? dateTimeFormatter.format(new Date(value)) : "—"

export const whatsappLink = (phone: string | null | undefined, message: string) => {
  const digits = phone?.replace(/\D/g, "") ?? ""
  if (digits.length < 8 || digits.length > 15) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}

export const consentFor = (consents: CrmConsent[], channel = "whatsapp") =>
  consents.find((consent) => consent.channel === channel)

export const hasMarketingConsent = (consents: CrmConsent[]) => {
  const consent = consentFor(consents)
  return consent?.status === "granted" || consent?.status === "opted_in"
}
