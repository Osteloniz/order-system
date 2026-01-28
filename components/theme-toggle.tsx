'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun, Laptop } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return null

  const icon =
    theme === 'dark' ? <Moon className="h-4 w-4" /> : theme === 'light' ? <Sun className="h-4 w-4" /> : <Laptop className="h-4 w-4" />

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Tema">
          {icon}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="h-4 w-4 mr-2" />
          Claro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="h-4 w-4 mr-2" />
          Escuro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Laptop className="h-4 w-4 mr-2" />
          Sistema
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
