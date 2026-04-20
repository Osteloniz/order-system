import Link from 'next/link'
import { ClipboardList, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function EntryChoicePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(34,192,212,0.18),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(248,207,64,0.22),transparent_34%),#fffaf2] px-4 py-10 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl items-center justify-center">
        <Card className="w-full overflow-hidden border-[#AF6E2A]/20 shadow-xl">
          <CardContent className="grid gap-0 p-0 md:grid-cols-[1fr_1.05fr]">
            <div className="bg-[#2D2D2B] p-8 text-white md:p-10">
              <div className="mb-12 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#22C0D4] text-[#2D2D2B]">
                <Store className="h-7 w-7" />
              </div>
              <h1 className="text-3xl font-bold md:text-4xl">Brookie Pregiato</h1>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/75">
                Escolha como deseja acessar o sistema. O catalogo continua ativo para clientes, e o painel admin segue como central de operacao interna.
              </p>
            </div>

            <div className="space-y-5 p-8 md:p-10">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#AF6E2A]">Entrar no sistema</p>
                <h2 className="mt-2 text-2xl font-bold">O que voce quer abrir agora?</h2>
              </div>

              <div className="grid gap-4">
                <Link href="/menu" className="block">
                  <div className="rounded-2xl border border-[#22C0D4]/35 bg-[#22C0D4]/10 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold">Ver catalogo</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Abrir a experiencia do cliente para montar pedidos.</p>
                      </div>
                      <Store className="h-6 w-6 text-[#22C0D4]" />
                    </div>
                  </div>
                </Link>

                <Link href="/admin" className="block">
                  <div className="rounded-2xl border border-[#FF6BBB]/35 bg-[#FF6BBB]/10 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold">Abrir painel admin</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Gerir pedidos, producao, estoque, produtos e relatorios.</p>
                      </div>
                      <ClipboardList className="h-6 w-6 text-[#FF6BBB]" />
                    </div>
                  </div>
                </Link>
              </div>

              <div className="pt-2">
                <Button asChild className="w-full">
                  <Link href="/admin">Continuar para admin</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
