'use client'

import { useEffect, useState } from 'react'
import { Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type TenantOption = { id: string; nome: string; slug: string; isOpen: boolean }

export function TenantSelectPage() {
  const [tenants, setTenants] = useState<TenantOption[]>([])

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/tenants')
      const data = await res.json()
      setTenants(Array.isArray(data) ? data : [])
    }
    load()
  }, [])

  const handleSelect = async (slug: string) => {
    await fetch('/api/tenant/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    })
    window.location.reload()
  }

  const handleAdmin = (slug: string) => {
    window.location.href = `/admin/login?tenant=${encodeURIComponent(slug)}`
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-4">
        <div className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
            <Store className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Escolha a loja</h1>
          <p className="text-muted-foreground">Selecione a empresa para fazer seu pedido</p>
        </div>

        <div className="grid gap-3">
          {tenants.map(t => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="text-base">{t.nome}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className={`text-sm ${t.isOpen ? 'text-success' : 'text-destructive'}`}>
                  {t.isOpen ? 'Aberto' : 'Fechado'}
                </span>
                <div className="flex items-center gap-2">
                  <Button onClick={() => handleSelect(t.slug)} disabled={!t.isOpen} variant="secondary">
                    Cardápio
                  </Button>
                  <Button onClick={() => handleAdmin(t.slug)}>
                    Entrar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
