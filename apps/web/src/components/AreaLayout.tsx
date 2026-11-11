import type { ReactNode } from "react"
import { ArrowLeft, LogOut } from "lucide-react"
import { Button } from "@workspace/ui/components/button"

interface Props {
  title: string
  subtitle: string
  role: string
  onHome: () => void
  onSignOut: () => void | Promise<void>
  compact?: boolean
  children: ReactNode
}

export function AreaLayout({ title, subtitle, role, onHome, onSignOut, compact = false, children }: Props) {
  return (
    <div className={`area-shell${compact ? " area-shell-compact" : ""}`} data-ui>
      <header className="area-header"><button type="button" className="area-brand" onClick={onHome}>HOME<span>Barbería</span></button><div className="area-header-actions"><span>{role}</span><Button variant="ghost" onClick={onHome}><ArrowLeft data-icon="inline-start" />Ver sitio</Button><Button variant="ghost" onClick={() => void onSignOut()}><LogOut data-icon="inline-start" />Salir</Button></div></header>
      <main className="area-main"><div className="area-title"><h1>{title}</h1><p>{subtitle}</p></div>{children}</main>
    </div>
  )
}
