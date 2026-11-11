import { api } from "./api"
import type { ClientDashboard, ManagerDashboard, OwnerDashboard, PublicData, SessionData, StaffDashboard } from "./types"

export const loadPublicData = (force = false) => api.get<PublicData>("/public", { cache: force ? "reload" : "default" })
export const loadSession = () => api.get<SessionData>("/auth/session")
export const loadClientDashboard = () => api.get<ClientDashboard>("/client/dashboard")
export const loadStaffDashboard = () => api.get<StaffDashboard>("/staff/dashboard")
export const loadOwnerDashboard = () => api.get<OwnerDashboard>("/owner/dashboard")
export const loadManagerDashboard = () => api.get<ManagerDashboard>("/manager/dashboard")
