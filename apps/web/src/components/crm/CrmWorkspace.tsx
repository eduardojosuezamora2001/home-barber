import { useState } from "react"
import { useLocation } from "react-router"
import { NativeSelect, NativeSelectOption } from "@workspace/ui/components/native-select"
import { CrmToday } from "./CrmToday"
import { CrmContacts } from "./CrmContacts"
import { CrmContactDetail } from "./CrmContactDetail"
import { CrmTasks } from "./CrmTasks"
import { CrmInquiries } from "./CrmInquiries"
import { CrmCampaigns } from "./CrmCampaigns"
import { CrmImport } from "./CrmImport"
import { CrmSettings } from "./CrmSettings"
import { CrmReports } from "./CrmReports"
import type { CrmRole } from "../../lib/crm"

interface Props {
  role: CrmRole
  branches?: { id: string; name: string }[]
}

export function CrmWorkspace({ role, branches = [] }: Props) {
  const [branchId, setBranchId] = useState("")
  const location = useLocation()
  const basePath = role === "owner" ? "/admin#crm" : "/encargado#crm"
  const section = location.hash.slice("#crm".length).split("/").filter(Boolean)
  const common = { role, basePath, branches, branchId: branchId || undefined }
  const content = section[0] === "clientes" && section[1]
    ? <CrmContactDetail key={`${branchId}:${section[1]}`} {...common} id={section[1]} />
    : section[0] === "clientes" ? <CrmContacts key={branchId} {...common} />
    : section[0] === "consultas" ? <CrmInquiries key={branchId} {...common} />
    : section[0] === "seguimientos" ? <CrmTasks key={branchId} {...common} />
    : section[0] === "campanas" ? <CrmCampaigns key={branchId} {...common} />
    : section[0] === "resultados" ? <CrmReports key={branchId} role={role} branchId={branchId || undefined} />
    : section[0] === "importar" && role === "owner" ? <CrmImport key={branchId} branches={branches} branchId={branchId || undefined} />
    : section[0] === "ajustes" ? <CrmSettings role={role} />
    : <CrmToday key={branchId} role={role} basePath={basePath} branchId={branchId || undefined} />

  return <div className="crm-workspace">
    {role === "owner" && <div className="crm-toolbar"><label className="crm-branch-filter">Sede <NativeSelect value={branchId} onChange={(event) => setBranchId(event.target.value)}><NativeSelectOption value="">Todas</NativeSelectOption>{branches.map((branch) => <NativeSelectOption key={branch.id} value={branch.id}>{branch.name}</NativeSelectOption>)}</NativeSelect></label></div>}
    {content}
  </div>
}
