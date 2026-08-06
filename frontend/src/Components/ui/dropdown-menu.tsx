import * as React from "react"
import { cn } from "../../lib/utils"

interface DropdownMenuProps {
  children: React.ReactNode
}

interface DropdownMenuTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

interface DropdownMenuContentProps {
  children: React.ReactNode
  className?: string
}

interface DropdownMenuItemProps extends React.HTMLAttributes<HTMLDivElement> {}

const DropdownMenuContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
}>({ open: false, setOpen: () => {} })

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  return (
    <DropdownMenuContext.Provider value={{ open, setOpen }}>
      <div className="relative inline-block text-left">{children}</div>
    </DropdownMenuContext.Provider>
  )
}

export function DropdownMenuTrigger({ children }: DropdownMenuTriggerProps) {
  const { setOpen, open } = React.useContext(DropdownMenuContext)
  return (
    <div onClick={() => setOpen(!open)}>{children}</div>
  )
}

export function DropdownMenuContent({ children, className }: DropdownMenuContentProps) {
  const { open } = React.useContext(DropdownMenuContext)
  if (!open) return null
  return (
    <div className={cn(
      "absolute right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-lg py-1 z-50 min-w-[8rem]",
      className
    )}>
      {children}
    </div>
  )
}

export function DropdownMenuItem({ className, ...props }: DropdownMenuItemProps) {
  return (
    <div
      className={cn("px-4 py-2 text-sm cursor-pointer hover:bg-gray-800", className)}
      {...props}
    />
  )
}
