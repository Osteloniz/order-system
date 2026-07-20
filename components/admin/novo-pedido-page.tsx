'use client'

import { type ReactNode, useEffect, useMemo, useState } from 'react'
import useSWR from 'swr'
import { ChevronDown, CreditCard, Minus, Plus, QrCode, Save, Search, ShoppingBag, Wallet, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/components/ui/use-mobile'
import { formatarMoeda, formatarTelefone } from '@/lib/calc'
import { isCouponExpired } from '@/lib/coupon-expiry'
import { formatPhoneInput, isValidPhone, normalizePhone } from '@/lib/phone'
import type { Cliente, Configuracao, Cupom, Pedido, Produto, SeparacaoResponsavelPessoa, TipoCartao, TipoEntrega, TipoPagamento } from '@/lib/types'
import { cn } from '@/lib/utils'

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url)
  const data = await response.json()
  if (!response.ok) {
    throw new Error(data.error || `Erro ao carregar ${url}`)
  }
  return data
}

type ProdutoAdmin = Produto & { categoriaNome?: string }
type CartItem = { produto: ProdutoAdmin; quantidade: number }
type MobileTab = 'catalogo' | 'finalizar'
type ClienteLookupItem = Cliente & { totalPedidos?: number; ultimoPedidoEm?: string | null }
type ClienteModalTab = 'buscar' | 'novo'
type ClienteQuickForm = {
  nome: string
  telefone: string
  whatsapp: string
  clienteBloco: string
  clienteApartamento: string
  observacoes: string
}

function normalizeSeparacaoResponsavel(
  separacoes: SeparacaoResponsavelPessoa[],
  items: CartItem[]
): SeparacaoResponsavelPessoa[] {
  const produtosMap = new Map(items.map((item) => [item.produto.id, item.produto.nome]))
  return separacoes.map((pessoa) => ({
    nome: pessoa.nome,
    itens: items.map((item) => {
      const atual = pessoa.itens.find((separacaoItem) => separacaoItem.produtoId === item.produto.id)
      return {
        produtoId: item.produto.id,
        nomeProduto: produtosMap.get(item.produto.id) ?? item.produto.nome,
        quantidade: atual?.quantidade ?? 0,
      }
    }),
  }))
}

function criarSeparacaoVazia(items: CartItem[]): SeparacaoResponsavelPessoa {
  return {
    nome: '',
    itens: items.map((item) => ({
      produtoId: item.produto.id,
      nomeProduto: item.produto.nome,
      quantidade: 0,
    })),
  }
}

function parseCurrencyToCents(value: string) {
  const digits = value.replace(/\D/g, '')
  return digits ? Number(digits) : 0
}

function formatCurrencyInput(value: string) {
  const cents = parseCurrencyToCents(value)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100)
}

function formatDateTimeLocal(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date) + 'T' + new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function calcularDescontoCupom(subtotal: number, cupomCodigo: string, cupons?: Cupom[], currentCouponCode?: string) {
  const cupom = cupons?.find((item) => item.codigo === cupomCodigo)
  if (!cupom) return 0
  if (!cupom.ativo) return 0

  const agora = Date.now()
  if (isCouponExpired(cupom.expiraEm, new Date(agora))) return 0
  if (cupom.usos >= cupom.maxUsos && cupom.codigo !== currentCouponCode) return 0

  const bruto = cupom.tipo === 'PERCENTUAL'
    ? Math.round(subtotal * (cupom.valor / 100))
    : cupom.valor

  return Math.min(bruto, subtotal)
}

function getEntregaLabel(tipoEntrega: TipoEntrega) {
  if (tipoEntrega === 'RESERVA_PAULISTANO') return 'Condominio'
  if (tipoEntrega === 'RETIRADA') return 'Retirada'
  return 'Encomenda'
}

function getPagamentoLabel(pagamento: TipoPagamento, tipoCartao: TipoCartao) {
  if (pagamento !== 'CARTAO') return pagamento
  return `Cartao ${tipoCartao === 'CREDITO' ? 'credito' : 'debito'}`
}

function getPagamentoOptionValue(pagamento: TipoPagamento, tipoCartao: TipoCartao) {
  if (pagamento === 'DINHEIRO') return 'DINHEIRO'
  if (pagamento === 'PIX') return 'PIX'
  return tipoCartao === 'DEBITO' ? 'CARTAO_DEBITO' : 'CARTAO_CREDITO'
}

type NovoPedidoAdminPageProps = {
  compact?: boolean
  initialPedido?: Pedido | null
  onCreated?: () => void
  onSaved?: (pedido: Pedido) => void
}

export function NovoPedidoAdminPage({ compact = false, initialPedido = null, onCreated, onSaved }: NovoPedidoAdminPageProps) {
  const isEditing = Boolean(initialPedido)
  const isMobile = useIsMobile()
  const { data: produtos, isLoading } = useSWR<ProdutoAdmin[]>('/api/admin/produtos', fetcher)
  const { data: cupons } = useSWR<Cupom[]>('/api/admin/cupons', fetcher)
  const { data: config } = useSWR<Configuracao>('/api/admin/config', fetcher)
  const [mobileTab, setMobileTab] = useState<MobileTab>('catalogo')
  const [clienteModalOpen, setClienteModalOpen] = useState(false)
  const [clienteModalTab, setClienteModalTab] = useState<ClienteModalTab>('buscar')
  const [searchCliente, setSearchCliente] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [selectedCategoria, setSelectedCategoria] = useState('TODAS')
  const clientesUrl = `/api/admin/clientes?search=${encodeURIComponent(searchCliente.trim())}&take=12`
  const { data: clientes, isLoading: isLoadingClientes, mutate: mutateClientes } = useSWR<ClienteLookupItem[]>(clienteModalOpen ? clientesUrl : null, fetcher)
  const produtosAtivos = useMemo(() => (produtos || []).filter((produto) => !produto.descontinuado), [produtos])
  const produtosLookup = useMemo(() => new Map((produtos || []).map((produto) => [produto.id, produto])), [produtos])

  const [clienteId, setClienteId] = useState('')
  const [nome, setNome] = useState('')
  const [dataPedido, setDataPedido] = useState(() => formatDateTimeLocal(new Date()))
  const [contatoPrincipal, setContatoPrincipal] = useState('')
  const [usarWhatsappDiferente, setUsarWhatsappDiferente] = useState(false)
  const [whatsapp, setWhatsapp] = useState('')
  const [bloco, setBloco] = useState('')
  const [apartamento, setApartamento] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [observacoesPedido, setObservacoesPedido] = useState('')
  const [temResponsavel, setTemResponsavel] = useState(false)
  const [responsavelPedido, setResponsavelPedido] = useState('')
  const [levadoEmData, setLevadoEmData] = useState('')
  const [levadoEmHora, setLevadoEmHora] = useState('')
  const [separacaoResponsavel, setSeparacaoResponsavel] = useState<SeparacaoResponsavelPessoa[]>([])
  const [destinatariosLegado, setDestinatariosLegado] = useState('')
  const [pagamento, setPagamento] = useState<TipoPagamento>('DINHEIRO')
  const [tipoCartao, setTipoCartao] = useState<TipoCartao>('CREDITO')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('RESERVA_PAULISTANO')
  const [encomendaData, setEncomendaData] = useState('')
  const [cupomCodigo, setCupomCodigo] = useState('')
  const [valorPromocionalInput, setValorPromocionalInput] = useState('')
  const [items, setItems] = useState<CartItem[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [initializedEditState, setInitializedEditState] = useState(false)
  const [initializedConfigDefaults, setInitializedConfigDefaults] = useState(false)
  const [descontosExpanded, setDescontosExpanded] = useState(false)
  const [observacoesExpanded, setObservacoesExpanded] = useState(false)
  const [responsavelExpanded, setResponsavelExpanded] = useState(false)
  const [savingCliente, setSavingCliente] = useState(false)
  const [clienteModalError, setClienteModalError] = useState('')
  const [clienteSelecionadoResumo, setClienteSelecionadoResumo] = useState<ClienteLookupItem | null>(null)
  const [clienteQuickForm, setClienteQuickForm] = useState<ClienteQuickForm>({
    nome: '',
    telefone: '',
    whatsapp: '',
    clienteBloco: '',
    clienteApartamento: '',
    observacoes: '',
  })

  useEffect(() => {
    if (!initialPedido || !produtos?.length || initializedEditState) return

    setClienteId(initialPedido.clienteId || '')
    setNome(initialPedido.clienteNome || '')
    setClienteSelecionadoResumo(initialPedido.clienteId ? {
      id: initialPedido.clienteId,
      nome: initialPedido.clienteNome || '',
      telefone: initialPedido.clienteTelefone || null,
      whatsapp: initialPedido.clienteWhatsapp || null,
      clienteBloco: initialPedido.clienteBloco || null,
      clienteApartamento: initialPedido.clienteApartamento || null,
      observacoes: null,
      criadoEm: initialPedido.criadoEm,
      atualizadoEm: initialPedido.criadoEm,
    } : null)
    setDataPedido(formatDateTimeLocal(initialPedido.criadoEm))
    const telefoneInicial = formatPhoneInput(initialPedido.clienteTelefone || '')
    const whatsappInicial = formatPhoneInput(initialPedido.clienteWhatsapp || '')
    setContatoPrincipal(telefoneInicial || whatsappInicial)
    setUsarWhatsappDiferente(Boolean(
      initialPedido.clienteWhatsapp &&
      normalizePhone(initialPedido.clienteWhatsapp) !== normalizePhone(initialPedido.clienteTelefone)
    ))
    setWhatsapp(
      initialPedido.clienteWhatsapp &&
      normalizePhone(initialPedido.clienteWhatsapp) !== normalizePhone(initialPedido.clienteTelefone)
        ? whatsappInicial
        : ''
    )
    setBloco(initialPedido.clienteBloco || '')
    setApartamento(initialPedido.clienteApartamento || '')
    setObservacoesPedido(initialPedido.observacoesPedido || '')
    setObservacoes(initialPedido.clienteObservacoes || '')
    setTemResponsavel(Boolean(initialPedido.responsavelPedido))
    setResponsavelPedido(initialPedido.responsavelPedido || '')
    setDestinatariosLegado(initialPedido.destinatariosPedido || '')
    setPagamento(initialPedido.pagamento)
    setTipoCartao(initialPedido.tipoCartao || 'CREDITO')
    setTipoEntrega(initialPedido.tipoEntrega)
    setCupomCodigo(initialPedido.cupomCodigoSnapshot || '')
    if (!initialPedido.cupomCodigoSnapshot && (initialPedido.descontoValor ?? 0) > 0) {
      setValorPromocionalInput(formatCurrencyInput(String(initialPedido.descontoValor)))
    }
    if (initialPedido.encomendaPara) {
      const data = new Date(initialPedido.encomendaPara)
      const dataString = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(data)
      setEncomendaData(dataString)
    }
    if (initialPedido.levadoEm) {
      const dataLevada = new Date(initialPedido.levadoEm)
      const levadoDataString = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(dataLevada)
      const levadoHoraString = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(dataLevada)
      setLevadoEmData(levadoDataString)
      setLevadoEmHora(levadoHoraString)
    }

    const itemMap = new Map(initialPedido.itens.map((item) => [item.produtoId, item.quantidade]))
    const initialItems = initialPedido.itens
      .map((item) => {
        const produto = produtosLookup.get(item.produtoId)
        if (!produto) return null

        return {
          produto,
          quantidade: itemMap.get(item.produtoId) ?? item.quantidade,
        }
      })
      .filter((item): item is CartItem => item !== null)

    setItems(initialItems)
    if (Array.isArray(initialPedido.separacaoResponsavel) && initialPedido.separacaoResponsavel.length > 0) {
      setSeparacaoResponsavel(normalizeSeparacaoResponsavel(initialPedido.separacaoResponsavel, initialItems))
    }
    setInitializedEditState(true)
  }, [initialPedido, produtos, produtosLookup, initializedEditState])

  useEffect(() => {
    if (!temResponsavel) return
    setSeparacaoResponsavel((current) => {
      if (current.length === 0) return items.length ? [criarSeparacaoVazia(items)] : []
      return normalizeSeparacaoResponsavel(current, items)
    })
  }, [items, temResponsavel])

  useEffect(() => {
    if (initializedConfigDefaults || !config) return
    if (!isEditing) {
      setTipoEntrega(config.padraoNovoPedidoEntrega ?? 'RESERVA_PAULISTANO')
      setPagamento(config.padraoNovoPedidoPagamento ?? 'DINHEIRO')
      setTipoCartao(config.padraoNovoPedidoTipoCartao ?? 'CREDITO')
    }
    setDescontosExpanded(config.padraoNovoPedidoDescontosExpandidos ?? false)
    setObservacoesExpanded(config.padraoNovoPedidoObservacoesExpandidas ?? false)
    setResponsavelExpanded(config.padraoNovoPedidoResponsavelExpandido ?? false)
    setInitializedConfigDefaults(true)
  }, [config, initializedConfigDefaults, isEditing])

  const clienteSelecionado = useMemo(
    () => (clientes || []).find((cliente) => cliente.id === clienteId) || clienteSelecionadoResumo || null,
    [clientes, clienteId, clienteSelecionadoResumo]
  )

  const categorias = useMemo(() => {
    const counts = new Map<string, number>()
    for (const produto of produtosAtivos) {
      const categoria = produto.categoriaNome || 'Sem categoria'
      counts.set(categoria, (counts.get(categoria) ?? 0) + 1)
    }

    return [
      { nome: 'TODAS', quantidade: produtosAtivos.length },
      ...Array.from(counts.entries())
        .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))
        .map(([nomeCategoria, quantidade]) => ({ nome: nomeCategoria, quantidade })),
    ]
  }, [produtosAtivos])

  useEffect(() => {
    if (!categorias.some((categoria) => categoria.nome === selectedCategoria)) {
      setSelectedCategoria('TODAS')
    }
  }, [categorias, selectedCategoria])

  const subtotal = items.reduce((sum, item) => sum + item.produto.preco * item.quantidade, 0)
  const valorPromocional = parseCurrencyToCents(valorPromocionalInput)
  const descontoCupom = valorPromocional > 0 ? 0 : calcularDescontoCupom(subtotal, cupomCodigo, cupons, initialPedido?.cupomCodigoSnapshot || undefined)
  const descontoValor = valorPromocional > 0 ? Math.min(valorPromocional, subtotal) : descontoCupom
  const total = Math.max(0, subtotal - descontoValor)
  const totalItens = items.reduce((sum, item) => sum + item.quantidade, 0)
  const telefoneLimpo = normalizePhone(contatoPrincipal)
  const whatsappLimpo = normalizePhone(usarWhatsappDiferente ? whatsapp : contatoPrincipal)
  const separacaoAtiva = temResponsavel
    ? separacaoResponsavel
        .map((pessoa) => ({
          nome: pessoa.nome.trim(),
          itens: pessoa.itens.filter((item) => item.quantidade > 0),
        }))
        .filter((pessoa) => pessoa.nome && pessoa.itens.length > 0)
    : []

  const resumoSeparacaoPorProduto = useMemo(() => {
    const mapa = new Map<string, { nomeProduto: string; pedido: number; separado: number }>()
    for (const item of items) {
      mapa.set(item.produto.id, {
        nomeProduto: item.produto.nome,
        pedido: item.quantidade,
        separado: 0,
      })
    }

    for (const pessoa of separacaoResponsavel) {
      for (const item of pessoa.itens) {
        const atual = mapa.get(item.produtoId)
        if (!atual) continue
        atual.separado += item.quantidade
      }
    }

    return Array.from(mapa.entries()).map(([produtoId, value]) => ({
      produtoId,
      ...value,
      restante: value.pedido - value.separado,
    }))
  }, [items, separacaoResponsavel])

  const produtosFiltrados = useMemo(() => {
    const search = productSearch.trim().toLowerCase()
    return produtosAtivos.filter((produto) => {
      const matchesCategoria = selectedCategoria === 'TODAS' || (produto.categoriaNome || 'Sem categoria') === selectedCategoria
      const matchesSearch = !search || `${produto.nome} ${produto.categoriaNome || ''}`.toLowerCase().includes(search)
      return matchesCategoria && matchesSearch
    })
  }, [productSearch, produtosAtivos, selectedCategoria])

  const clienteResumo = clienteSelecionado?.nome || nome.trim() || 'Sem cliente informado'
  const entregaResumo = getEntregaLabel(tipoEntrega)
  const pagamentoResumo = getPagamentoLabel(pagamento, tipoCartao)

  const getQuantidadeProduto = (produtoId: string) => items.find((item) => item.produto.id === produtoId)?.quantidade ?? 0

  const setProductQuantity = (produto: ProdutoAdmin, nextQuantidade: number) => {
    setItems((current) => {
      const currentItem = current.find((item) => item.produto.id === produto.id)
      if (nextQuantidade <= 0) {
        return current.filter((item) => item.produto.id !== produto.id)
      }
      if (!currentItem) {
        return [...current, { produto, quantidade: nextQuantidade }]
      }
      return current.map((item) => item.produto.id === produto.id ? { ...item, quantidade: nextQuantidade } : item)
    })
  }

  const addProduct = (produto: ProdutoAdmin) => {
    setProductQuantity(produto, getQuantidadeProduto(produto.id) + 1)
  }

  const changeQuantity = (produtoId: string, delta: number) => {
    const produto = items.find((item) => item.produto.id === produtoId)?.produto
      || produtosAtivos.find((item) => item.id === produtoId)
    if (!produto) return
    setProductQuantity(produto, getQuantidadeProduto(produtoId) + delta)
  }

  const addPessoaSeparacao = () => {
    if (!items.length) return
    setSeparacaoResponsavel((current) => [...current, criarSeparacaoVazia(items)])
  }

  const removePessoaSeparacao = (index: number) => {
    setSeparacaoResponsavel((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  const updatePessoaSeparacaoNome = (index: number, value: string) => {
    setSeparacaoResponsavel((current) => current.map((pessoa, currentIndex) => currentIndex === index ? { ...pessoa, nome: value } : pessoa))
  }

  const updatePessoaSeparacaoQuantidade = (index: number, produtoId: string, value: string) => {
    const quantidade = Math.max(0, Number(value.replace(/\D/g, '') || 0))
    setSeparacaoResponsavel((current) => current.map((pessoa, currentIndex) => {
      if (currentIndex !== index) return pessoa
      return {
        ...pessoa,
        itens: pessoa.itens.map((item) => item.produtoId === produtoId ? { ...item, quantidade } : item),
      }
    }))
  }

  const hydrateClienteQuickForm = (cliente?: Partial<Cliente> | null) => {
    setClienteQuickForm({
      nome: cliente?.nome || '',
      telefone: formatPhoneInput(cliente?.telefone || ''),
      whatsapp: formatPhoneInput(cliente?.whatsapp || cliente?.telefone || ''),
      clienteBloco: cliente?.clienteBloco || '',
      clienteApartamento: cliente?.clienteApartamento || '',
      observacoes: cliente?.observacoes || '',
    })
  }

  const selectCliente = (cliente: ClienteLookupItem | Cliente) => {
    setClienteId(cliente.id)
    setClienteSelecionadoResumo(cliente as ClienteLookupItem)
    setNome(cliente.nome || '')
    const telefoneCliente = formatPhoneInput(cliente.telefone || cliente.whatsapp || '')
    const whatsappCliente = formatPhoneInput(cliente.whatsapp || '')
    setContatoPrincipal(telefoneCliente)
    setUsarWhatsappDiferente(Boolean(
      cliente.whatsapp &&
      normalizePhone(cliente.whatsapp) !== normalizePhone(cliente.telefone)
    ))
    setWhatsapp(
      cliente.whatsapp && normalizePhone(cliente.whatsapp) !== normalizePhone(cliente.telefone)
        ? whatsappCliente
        : ''
    )
    setBloco(cliente.clienteBloco || '')
    setApartamento(cliente.clienteApartamento || '')
    setObservacoes(cliente.observacoes || '')
    setSearchCliente(cliente.nome)
    hydrateClienteQuickForm(cliente)
    setClienteModalError('')
    setClienteModalOpen(false)
  }

  const clearSelectedCliente = () => {
    setClienteId('')
    setSearchCliente('')
    setClienteSelecionadoResumo(null)
    setNome('')
    setContatoPrincipal('')
    setUsarWhatsappDiferente(false)
    setWhatsapp('')
    setBloco('')
    setApartamento('')
    setObservacoes('')
  }

  const openNovoClienteModal = () => {
    setClienteModalTab('novo')
    setClienteModalError('')
    hydrateClienteQuickForm({
      nome,
      telefone: contatoPrincipal,
      whatsapp: usarWhatsappDiferente ? whatsapp : contatoPrincipal,
      clienteBloco: bloco,
      clienteApartamento: apartamento,
      observacoes,
    })
    setClienteModalOpen(true)
  }

  const saveClienteRapido = async () => {
    setSavingCliente(true)
    setClienteModalError('')
    try {
      const response = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: clienteQuickForm.nome.trim(),
          telefone: normalizePhone(clienteQuickForm.telefone) || undefined,
          whatsapp: normalizePhone(clienteQuickForm.whatsapp) || undefined,
          clienteBloco: clienteQuickForm.clienteBloco.trim() || undefined,
          clienteApartamento: clienteQuickForm.clienteApartamento.trim() || undefined,
          observacoes: clienteQuickForm.observacoes.trim() || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao salvar cliente')
      }
      await mutateClientes()
      selectCliente(data)
    } catch (saveError) {
      setClienteModalError(saveError instanceof Error ? saveError.message : 'Erro ao salvar cliente')
    } finally {
      setSavingCliente(false)
    }
  }

  const resetForm = () => {
    setClienteId('')
    setClienteSelecionadoResumo(null)
    setNome('')
    setDataPedido(formatDateTimeLocal(new Date()))
    setContatoPrincipal('')
    setUsarWhatsappDiferente(false)
    setWhatsapp('')
    setBloco('')
    setApartamento('')
    setObservacoes('')
    setObservacoesPedido('')
    setTemResponsavel(false)
    setResponsavelPedido('')
    setLevadoEmData('')
    setLevadoEmHora('')
    setSeparacaoResponsavel([])
    setDestinatariosLegado('')
    setPagamento(config?.padraoNovoPedidoPagamento ?? 'DINHEIRO')
    setTipoCartao(config?.padraoNovoPedidoTipoCartao ?? 'CREDITO')
    setTipoEntrega(config?.padraoNovoPedidoEntrega ?? 'RESERVA_PAULISTANO')
    setEncomendaData('')
    setCupomCodigo('')
    setValorPromocionalInput('')
    setItems([])
    setSearchCliente('')
    setProductSearch('')
    setSelectedCategoria('TODAS')
    setMobileTab('catalogo')
    setDescontosExpanded(config?.padraoNovoPedidoDescontosExpandidos ?? false)
    setObservacoesExpanded(config?.padraoNovoPedidoObservacoesExpandidas ?? false)
    setResponsavelExpanded(config?.padraoNovoPedidoResponsavelExpandido ?? false)
    hydrateClienteQuickForm(null)
  }

  const handleSubmit = async () => {
    setError('')
    setMessage('')

    if (!nome.trim()) return setError('Selecione ou cadastre um cliente')
    if (!dataPedido) return setError('Informe a data do pedido')
    if (telefoneLimpo && !isValidPhone(telefoneLimpo)) return setError('Celular invalido')
    if (whatsappLimpo && !isValidPhone(whatsappLimpo)) return setError('WhatsApp invalido')
    if (tipoEntrega === 'RESERVA_PAULISTANO' && (!bloco.trim() || !apartamento.trim())) return setError('Informe bloco e apartamento')
    if (tipoEntrega === 'ENCOMENDA' && !encomendaData) return setError('Informe a data da encomenda')
    if (items.length === 0) return setError('Adicione pelo menos um produto')
    if (cupomCodigo && valorPromocional > 0) return setError('Use cupom ou valor promocional, nao os dois')
    if (temResponsavel && !responsavelPedido.trim()) return setError('Informe quem e o responsavel pelo pedido')
    if (temResponsavel && ((levadoEmData && !levadoEmHora) || (!levadoEmData && levadoEmHora))) return setError('Informe data e hora de quando o pedido foi levado')
    if (!temResponsavel && (levadoEmData || levadoEmHora)) return setError('Data e hora de levado so devem ser usadas quando houver responsavel')
    if (temResponsavel) {
      if (!separacaoAtiva.length) return setError('Cadastre pelo menos uma etiqueta final para separar o pedido')
      const divergencia = resumoSeparacaoPorProduto.find((item) => item.restante !== 0)
      if (divergencia) {
        return setError(`A separacao do sabor ${divergencia.nomeProduto} precisa bater com o pedido. Falta ajustar ${Math.abs(divergencia.restante)} unidade(s).`)
      }
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(isEditing ? `/api/admin/pedidos/${initialPedido?.id}` : '/api/admin/pedidos', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId: clienteId || undefined,
          clienteNome: nome.trim(),
          criadoEm: `${dataPedido}:00-03:00`,
          clienteTelefone: telefoneLimpo || undefined,
          clienteWhatsapp: whatsappLimpo || undefined,
          clienteBloco: tipoEntrega === 'RESERVA_PAULISTANO' ? bloco.trim() || undefined : undefined,
          clienteApartamento: tipoEntrega === 'RESERVA_PAULISTANO' ? apartamento.trim() || undefined : undefined,
          clienteObservacoes: observacoes.trim() || undefined,
          observacoesPedido: observacoesPedido.trim() || undefined,
          responsavelPedido: temResponsavel ? responsavelPedido.trim() || undefined : undefined,
          destinatariosPedido: temResponsavel ? separacaoAtiva.map((pessoa) => pessoa.nome).join(', ') || undefined : undefined,
          separacaoResponsavel: temResponsavel ? separacaoAtiva : undefined,
          levadoEm: temResponsavel && levadoEmData && levadoEmHora ? `${levadoEmData}T${levadoEmHora}:00-03:00` : undefined,
          pagamento,
          tipoCartao: pagamento === 'CARTAO' ? tipoCartao : undefined,
          tipoEntrega,
          encomendaPara: tipoEntrega === 'ENCOMENDA' ? `${encomendaData}T00:00:00-03:00` : undefined,
          statusPagamento: pagamento === 'DINHEIRO' ? 'NAO_APLICAVEL' : 'PENDENTE',
          cupomCodigo: cupomCodigo || undefined,
          valorPromocional: valorPromocional || undefined,
          itens: items.map((item) => ({ produtoId: item.produto.id, quantidade: item.quantidade })),
        }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Erro ao salvar pedido')

      setMessage(isEditing ? `Pedido #${data.id.slice(-8).toUpperCase()} atualizado com sucesso.` : `Pedido #${data.id.slice(-8).toUpperCase()} criado com sucesso.`)
      if (!isEditing) {
        resetForm()
        onCreated?.()
      }
      onSaved?.(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar pedido')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSelectPagamento = (option: 'DINHEIRO' | 'PIX' | 'CARTAO_CREDITO' | 'CARTAO_DEBITO') => {
    if (option === 'DINHEIRO') {
      setPagamento('DINHEIRO')
      return
    }
    if (option === 'PIX') {
      setPagamento('PIX')
      return
    }
    setPagamento('CARTAO')
    setTipoCartao(option === 'CARTAO_DEBITO' ? 'DEBITO' : 'CREDITO')
  }

  const pagamentoSelecionado = getPagamentoOptionValue(pagamento, tipoCartao)

  const renderClienteLookup = () => (
    <div className="space-y-2">
      <Label>Cliente cadastrado</Label>
      {clienteSelecionado ? (
        <div className="rounded-2xl border border-primary/20 bg-primary/[0.08] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold text-primary">{clienteSelecionado.nome}</p>
              <p className="text-sm text-primary/80">
                {clienteSelecionado.telefone ? formatarTelefone(clienteSelecionado.telefone) : 'Sem celular'}
              </p>
              {clienteSelecionado.totalPedidos !== undefined ? (
                <p className="mt-1 text-xs text-muted-foreground">{clienteSelecionado.totalPedidos} pedido(s) no cadastro</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-xl" onClick={clearSelectedCliente}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-2xl" onClick={() => {
              setClienteModalTab('buscar')
              setClienteModalOpen(true)
            }}>
              Trocar cliente
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={openNovoClienteModal}>
              Novo cliente
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-4">
          <p className="text-sm text-muted-foreground">Busque um cadastro existente ou crie um novo sem sair do pedido.</p>
          <div className="mt-3 flex gap-2">
            <Button type="button" className="flex-1 rounded-2xl" onClick={() => {
              setClienteModalTab('buscar')
              setClienteModalError('')
              setClienteModalOpen(true)
            }}>
              Buscar cliente
            </Button>
            <Button type="button" variant="outline" className="rounded-2xl" onClick={openNovoClienteModal}>
              Cadastrar
            </Button>
          </div>
        </div>
      )}
    </div>
  )

  const renderClienteForm = () => (
    <div className="space-y-4">
      {renderClienteLookup()}
      {clienteSelecionado ? (
        <div className="rounded-2xl border border-border/70 bg-background/70 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Nome</p>
              <p className="truncate font-semibold">{clienteSelecionado.nome}</p>
            </div>
            <div className="min-w-0 rounded-xl border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Contato principal</p>
              <p className="truncate font-semibold">
                {clienteSelecionado.telefone ? formatarTelefone(clienteSelecionado.telefone) : 'Nao informado'}
              </p>
            </div>
            {(clienteSelecionado.clienteBloco || clienteSelecionado.clienteApartamento) ? (
              <div className="min-w-0 rounded-xl border bg-muted/20 p-3 sm:col-span-2">
                <p className="text-xs text-muted-foreground">Localizacao padrao</p>
                <p className="font-semibold">
                  {clienteSelecionado.clienteBloco ? `Bloco ${clienteSelecionado.clienteBloco}` : 'Sem bloco'}
                  {clienteSelecionado.clienteApartamento ? ` • Apto ${clienteSelecionado.clienteApartamento}` : ''}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )

  const renderEntregaPagamentoForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Data do pedido</Label>
        <Input type="datetime-local" value={dataPedido} onChange={(event) => setDataPedido(event.target.value)} className="h-11 rounded-2xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Entrega</Label>
          <select
            value={tipoEntrega}
            onChange={(event) => setTipoEntrega(event.target.value as TipoEntrega)}
            className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm"
          >
            <option value="RESERVA_PAULISTANO">Condominio (Reserva Paulistano)</option>
            <option value="RETIRADA">Retirada</option>
            <option value="ENCOMENDA">Encomenda</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label>Pagamento</Label>
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => handleSelectPagamento('DINHEIRO')}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                pagamentoSelecionado === 'DINHEIRO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'
              )}
            >
              <Wallet className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">Dinheiro</p>
                <p className="text-xs text-muted-foreground">Pagamento na entrega ou retirada.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleSelectPagamento('PIX')}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                pagamentoSelecionado === 'PIX' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'
              )}
            >
              <QrCode className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">PIX</p>
                <p className="text-xs text-muted-foreground">Status fica pendente ate confirmacao.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleSelectPagamento('CARTAO_CREDITO')}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                pagamentoSelecionado === 'CARTAO_CREDITO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'
              )}
            >
              <CreditCard className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">Cartao credito</p>
                <p className="text-xs text-muted-foreground">Taxa prevista de 3,09%.</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleSelectPagamento('CARTAO_DEBITO')}
              className={cn(
                'flex items-start gap-3 rounded-2xl border p-4 text-left transition',
                pagamentoSelecionado === 'CARTAO_DEBITO' ? 'border-primary bg-primary/10 shadow-sm' : 'border-border bg-background hover:border-primary/35'
              )}
            >
              <CreditCard className="mt-0.5 h-4 w-4 text-primary" />
              <div>
                <p className="font-medium">Cartao debito</p>
                <p className="text-xs text-muted-foreground">Taxa prevista de 0,89%.</p>
              </div>
            </button>
          </div>
        </div>

        {tipoEntrega === 'RESERVA_PAULISTANO' && (
          <>
            <div className="space-y-2">
              <Label>Bloco</Label>
              <Input value={bloco} onChange={(event) => setBloco(event.target.value)} placeholder="Ex: A" className="h-11 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Apartamento</Label>
              <Input value={apartamento} onChange={(event) => setApartamento(event.target.value)} placeholder="Ex: 101" className="h-11 rounded-2xl" />
            </div>
          </>
        )}

        {tipoEntrega === 'ENCOMENDA' && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Data da encomenda</Label>
            <Input type="date" value={encomendaData} onChange={(event) => setEncomendaData(event.target.value)} className="h-11 rounded-2xl" />
          </div>
        )}
      </div>
    </div>
  )

  const renderDescontoForm = () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label>Cupom</Label>
        <select
          value={cupomCodigo}
          onChange={(event) => {
            setCupomCodigo(event.target.value)
            if (event.target.value) setValorPromocionalInput('')
          }}
          className="h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm"
        >
          <option value="">Sem cupom</option>
          {cupons?.map((cupom) => (
            <option key={cupom.id} value={cupom.codigo}>{cupom.codigo}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Valor promocional interno</Label>
        <Input
          value={valorPromocionalInput}
          onChange={(event) => {
            setValorPromocionalInput(formatCurrencyInput(event.target.value))
            if (parseCurrencyToCents(event.target.value) > 0) setCupomCodigo('')
          }}
          placeholder="R$ 0,00"
          className="h-11 rounded-2xl"
        />
      </div>
    </div>
  )

  const renderResponsavelForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Controle por responsavel</Label>
        <label className="flex min-h-11 items-center gap-3 rounded-2xl border border-input bg-background px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={temResponsavel}
            onChange={(event) => {
              const enabled = event.target.checked
              setTemResponsavel(enabled)
              if (!enabled) {
                setResponsavelPedido('')
                setLevadoEmData('')
                setLevadoEmHora('')
                setSeparacaoResponsavel([])
              } else if (items.length && separacaoResponsavel.length === 0) {
                setSeparacaoResponsavel([criarSeparacaoVazia(items)])
              }
            }}
          />
          <span>Tem responsavel e etiquetas finais</span>
        </label>
      </div>

      {temResponsavel && (
        <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/[0.18] p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Responsavel pelo pedido</Label>
              <Input value={responsavelPedido} onChange={(event) => setResponsavelPedido(event.target.value)} placeholder="Ex: Vitor" className="h-11 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Data que levou</Label>
              <Input type="date" value={levadoEmData} onChange={(event) => setLevadoEmData(event.target.value)} className="h-11 rounded-2xl" />
            </div>
            <div className="space-y-2">
              <Label>Hora que levou</Label>
              <Input type="time" value={levadoEmHora} onChange={(event) => setLevadoEmHora(event.target.value)} className="h-11 rounded-2xl" />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Label>Separacao final por pessoa</Label>
              <Button type="button" variant="outline" size="sm" className="rounded-2xl" onClick={addPessoaSeparacao} disabled={!items.length}>
                <Plus className="mr-2 h-4 w-4" />
                Adicionar pessoa
              </Button>
            </div>

            {!!destinatariosLegado && !initialPedido?.separacaoResponsavel?.length && (
              <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
                Pedido antigo com texto legado: {destinatariosLegado}. Refaca abaixo no modelo de etiquetas para manter o rastreamento.
              </div>
            )}

            <div className="rounded-2xl border bg-background/80 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Conferencia por sabor</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {resumoSeparacaoPorProduto.map((item) => (
                  <div key={item.produtoId} className="rounded-xl border bg-muted/20 p-3 text-sm">
                    <p className="font-medium">{item.nomeProduto}</p>
                    <p className="text-muted-foreground">
                      Pedido: {item.pedido} | Etiquetado: {item.separado} | Restante: {item.restante}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              {separacaoResponsavel.map((pessoa, index) => (
                <div key={`pessoa-${index}`} className="rounded-2xl border bg-background p-3">
                  <div className="mb-3 flex items-center gap-3">
                    <Input value={pessoa.nome} onChange={(event) => updatePessoaSeparacaoNome(index, event.target.value)} placeholder={`Nome final ${index + 1}`} className="h-11 rounded-2xl" />
                    <Button type="button" variant="ghost" size="icon" className="rounded-xl" onClick={() => removePessoaSeparacao(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {pessoa.itens.map((item) => {
                      const quantidadePedido = items.find((cartItem) => cartItem.produto.id === item.produtoId)?.quantidade ?? 0
                      return (
                        <div key={`${index}-${item.produtoId}`} className="grid gap-2 rounded-xl bg-muted/25 p-3 sm:grid-cols-[minmax(0,1fr)_120px] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.nomeProduto}</p>
                            <p className="text-xs text-muted-foreground">Pedido total desse sabor: {quantidadePedido}</p>
                          </div>
                          <Input
                            type="number"
                            min={0}
                            max={quantidadePedido}
                            value={item.quantidade || ''}
                            onChange={(event) => updatePessoaSeparacaoQuantidade(index, item.produtoId, event.target.value)}
                            placeholder="Qtd."
                            className="h-11 rounded-2xl"
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
              {separacaoResponsavel.length === 0 && (
                <div className="rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                  Adicione pelo menos uma pessoa final para montar as etiquetas do pedido.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const renderObservacoesForm = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Observacoes do cliente</Label>
        <Textarea
          value={observacoes}
          onChange={(event) => setObservacoes(event.target.value)}
          placeholder="Preferencias, restricoes e detalhes de entrega"
          className="min-h-24 rounded-2xl"
        />
      </div>
      <div className="space-y-2">
        <Label>Observacoes do pedido</Label>
        <Textarea
          value={observacoesPedido}
          onChange={(event) => setObservacoesPedido(event.target.value)}
          placeholder="Controle interno, combinados e detalhes da venda"
          className="min-h-24 rounded-2xl"
        />
      </div>
    </div>
  )

  const renderResumo = (showSubmit: boolean) => (
    <div className="space-y-4">
      <div className="rounded-[1.4rem] border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-success/[0.06] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-primary/70">Pedido em montagem</p>
            <p className="mt-1 text-xl font-bold text-primary">{formatarMoeda(total)}</p>
          </div>
          <div className="text-right text-sm text-muted-foreground">
            <p>{totalItens} item(ns)</p>
            <p>{entregaResumo}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-border/70 bg-background/90">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="font-semibold">Itens do pedido</p>
          <p className="text-sm text-muted-foreground">Ajuste as quantidades sem voltar ao catalogo.</p>
        </div>
        <div className="space-y-3 p-4">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              Nenhum produto adicionado ainda.
            </div>
          ) : (
            items.map((item) => (
              <div key={item.produto.id} className="rounded-2xl border border-border/70 bg-muted/[0.12] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="break-words font-medium">{item.produto.nome}</p>
                      {item.produto.descontinuado ? <Badge variant="outline">Descontinuado</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{formatarMoeda(item.produto.preco)} por unidade</p>
                  </div>
                  <Badge>{item.quantidade}x</Badge>
                </div>
                <div className="mt-3 grid grid-cols-[44px_1fr_44px] gap-2">
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => changeQuantity(item.produto.id, -1)}>
                    <Minus className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center justify-center rounded-xl border bg-background text-sm font-semibold">
                    {item.quantidade}
                  </div>
                  <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => changeQuantity(item.produto.id, 1)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-border/70 bg-background/90 p-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{clienteResumo}</Badge>
          <Badge variant="secondary">{pagamentoResumo}</Badge>
          <Badge variant="secondary">{entregaResumo}</Badge>
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatarMoeda(subtotal)}</span>
          </div>
          {cupomCodigo && descontoValor > 0 && (
            <div className="flex justify-between text-success">
              <span>Cupom {cupomCodigo}</span>
              <span>-{formatarMoeda(descontoValor)}</span>
            </div>
          )}
          {!cupomCodigo && valorPromocional > 0 && (
            <div className="flex justify-between text-success">
              <span>Valor promocional</span>
              <span>-{formatarMoeda(descontoValor)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="text-primary">{formatarMoeda(total)}</span>
          </div>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {message && <p className="rounded-2xl border border-primary/30 bg-primary/10 p-3 text-sm text-primary">{message}</p>}

      {showSubmit && (
        <Button className="h-12 w-full rounded-2xl" onClick={handleSubmit} disabled={isSubmitting}>
          <Save className="mr-2 h-4 w-4" />
          {isSubmitting ? (isEditing ? 'Salvando...' : 'Criando...') : (isEditing ? 'Salvar pedido' : 'Criar pedido')}
        </Button>
      )}
    </div>
  )

  const renderCatalogo = () => (
    <div className="space-y-4">
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-3 bg-gradient-to-br from-background via-background to-primary/[0.05]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Catalogo rapido</CardTitle>
              <CardDescription>Buscar, tocar e ajustar. Sem formulario na frente dos produtos.</CardDescription>
            </div>
            <Badge variant="secondary">{produtosFiltrados.length}</Badge>
          </div>
          <div className="space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Buscar sabor ou categoria"
                className="h-11 rounded-2xl pl-9"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categorias.map((categoria) => (
                <button
                  key={categoria.nome}
                  type="button"
                  onClick={() => setSelectedCategoria(categoria.nome)}
                  className={cn(
                    'shrink-0 rounded-full border px-3 py-2 text-sm transition-colors',
                    selectedCategoria === categoria.nome
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-foreground hover:bg-muted/40'
                  )}
                >
                  {categoria.nome === 'TODAS' ? 'Todas' : categoria.nome} ({categoria.quantidade})
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando produtos...</p>
        ) : produtosFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado com esse filtro.
          </div>
        ) : (
          produtosFiltrados.map((produto) => {
            const quantidade = getQuantidadeProduto(produto.id)
            return (
              <Card
                key={produto.id}
                className={cn(
                  'gap-0 border-border/70 py-0 shadow-sm transition-colors',
                  quantidade > 0 ? 'border-primary/30 bg-primary/[0.03]' : 'bg-card'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{produto.nome}</p>
                        {!produto.ativo ? <Badge variant="outline">Indisponivel no catalogo</Badge> : null}
                        {produto.disponivelParaEncomenda ? <Badge variant="outline">Aceita encomenda</Badge> : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {produto.categoriaNome || 'Sem categoria'} • {formatarMoeda(produto.preco)}
                      </p>
                    </div>
                    {quantidade > 0 ? <Badge>{quantidade}x</Badge> : null}
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    {quantidade === 0 ? (
                      <Button type="button" className="h-10 rounded-2xl px-4" onClick={() => addProduct(produto)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar
                      </Button>
                    ) : (
                      <>
                        <div className="grid flex-1 grid-cols-[44px_1fr_44px] gap-2 sm:max-w-[220px]">
                          <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => changeQuantity(produto.id, -1)}>
                            <Minus className="h-4 w-4" />
                          </Button>
                          <div className="flex items-center justify-center rounded-xl border bg-background text-sm font-semibold">
                            {quantidade}
                          </div>
                          <Button type="button" variant="outline" size="icon" className="rounded-xl" onClick={() => changeQuantity(produto.id, 1)}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button type="button" variant="ghost" className="rounded-xl px-3 text-muted-foreground" onClick={() => setProductQuantity(produto, 0)}>
                          Limpar
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )

  const renderExpandableCard = (
    title: string,
    description: string,
    open: boolean,
    onOpenChange: (value: boolean) => void,
    content: ReactNode
  ) => (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CollapsibleTrigger className="flex w-full items-start justify-between gap-3 text-left">
            <div>
              <CardTitle>{title}</CardTitle>
              <CardDescription className="mt-1">{description}</CardDescription>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/70 p-2">
              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>{content}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  )

  const renderClienteModal = () => (
    <Dialog open={clienteModalOpen} onOpenChange={setClienteModalOpen}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-[1.6rem] border-border/80 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle>Clientes</DialogTitle>
          <DialogDescription>
            Busque um cliente existente ou cadastre um novo sem sair do pedido.
          </DialogDescription>
        </DialogHeader>
        <div className="p-5">
          <Tabs value={clienteModalTab} onValueChange={(value) => setClienteModalTab(value as ClienteModalTab)} className="space-y-4">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl p-1">
              <TabsTrigger value="buscar" className="rounded-xl">Buscar cliente</TabsTrigger>
              <TabsTrigger value="novo" className="rounded-xl">Novo cliente</TabsTrigger>
            </TabsList>

            <TabsContent value="buscar" className="space-y-4">
              <div className="space-y-2">
                <Label>Buscar por nome, telefone ou WhatsApp</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchCliente}
                    onChange={(event) => setSearchCliente(event.target.value)}
                    placeholder="Digite para localizar o cliente"
                    className="h-11 rounded-2xl pl-9"
                  />
                </div>
              </div>

              <div className="max-h-[45dvh] space-y-3 overflow-y-auto pr-1">
                {isLoadingClientes ? (
                  <p className="text-sm text-muted-foreground">Carregando clientes...</p>
                ) : clientes?.length ? (
                  clientes.map((cliente) => (
                    <button
                      key={cliente.id}
                      type="button"
                      onClick={() => selectCliente(cliente)}
                      className="w-full rounded-2xl border border-border/70 bg-background/80 p-4 text-left transition hover:border-primary/35 hover:bg-primary/[0.04]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{cliente.nome}</p>
                          <p className="text-sm text-muted-foreground">
                            {cliente.telefone ? formatarTelefone(cliente.telefone) : 'Sem celular'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">{cliente.totalPedidos ?? 0} pedido(s)</Badge>
                            {cliente.clienteBloco ? <Badge variant="outline">Bloco {cliente.clienteBloco}</Badge> : null}
                          </div>
                        </div>
                        <div className="rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
                          Selecionar
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                    Nenhum cliente encontrado. Voce pode cadastrar um novo na aba ao lado.
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="novo" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nome</Label>
                  <Input
                    value={clienteQuickForm.nome}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, nome: event.target.value }))}
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input
                    value={clienteQuickForm.telefone}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, telefone: formatPhoneInput(event.target.value) }))}
                    placeholder="(47) 99999-9999"
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp</Label>
                  <Input
                    value={clienteQuickForm.whatsapp}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, whatsapp: formatPhoneInput(event.target.value) }))}
                    placeholder="(47) 99999-9999"
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bloco</Label>
                  <Input
                    value={clienteQuickForm.clienteBloco}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, clienteBloco: event.target.value }))}
                    placeholder="Ex: A"
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apartamento</Label>
                  <Input
                    value={clienteQuickForm.clienteApartamento}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, clienteApartamento: event.target.value }))}
                    placeholder="Ex: 101"
                    className="h-11 rounded-2xl"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Observacoes</Label>
                  <Textarea
                    value={clienteQuickForm.observacoes}
                    onChange={(event) => setClienteQuickForm((current) => ({ ...current, observacoes: event.target.value }))}
                    className="min-h-24 rounded-2xl"
                  />
                </div>
              </div>

              {clienteModalError ? (
                <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {clienteModalError}
                </p>
              ) : null}

              <div className="flex gap-2">
                <Button type="button" className="flex-1 rounded-2xl" onClick={saveClienteRapido} disabled={savingCliente || !clienteQuickForm.nome.trim()}>
                  {savingCliente ? 'Salvando...' : 'Cadastrar e usar no pedido'}
                </Button>
                <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setClienteModalTab('buscar')}>
                  Voltar
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )

  const renderDesktop = () => (
    <div className={cn(
      'grid min-w-0 gap-5',
      compact ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,420px)]' : 'xl:grid-cols-[minmax(0,1.2fr)_420px]'
    )}>
      <div className="min-w-0 space-y-4">
        {!compact && (
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{isEditing ? 'Editar pedido' : 'Novo pedido manual'}</h1>
            <p className="text-sm text-muted-foreground">
              Primeiro monte os itens, depois finalize no painel lateral. O fluxo fica rapido e sem perder contexto.
            </p>
          </div>
        )}
        {renderCatalogo()}
      </div>

      <div className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:h-fit">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Finalizacao do pedido</CardTitle>
            <CardDescription>Resumo, cliente, entrega, descontos e fechamento no mesmo painel.</CardDescription>
          </CardHeader>
          <CardContent>{renderResumo(false)}</CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>{renderClienteForm()}</CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Entrega e pagamento</CardTitle>
          </CardHeader>
          <CardContent>{renderEntregaPagamentoForm()}</CardContent>
        </Card>

        {renderExpandableCard(
          'Descontos',
          'Cupom e valor promocional interno.',
          descontosExpanded,
          setDescontosExpanded,
          renderDescontoForm()
        )}

        {renderExpandableCard(
          'Observacoes',
          'Detalhes do cliente e anotacoes internas da venda.',
          observacoesExpanded,
          setObservacoesExpanded,
          renderObservacoesForm()
        )}

        {renderExpandableCard(
          'Responsavel e etiquetas',
          'Use quando houver controle por responsavel e separacao final.',
          responsavelExpanded,
          setResponsavelExpanded,
          renderResponsavelForm()
        )}

        <Button className="h-12 w-full rounded-2xl" onClick={handleSubmit} disabled={isSubmitting}>
          <Save className="mr-2 h-4 w-4" />
          {isSubmitting ? (isEditing ? 'Salvando...' : 'Criando...') : (isEditing ? 'Salvar pedido' : 'Criar pedido')}
        </Button>
      </div>
    </div>
  )

  const renderMobile = () => (
    <Tabs
      value={mobileTab}
      onValueChange={(value) => setMobileTab(value as MobileTab)}
      className={cn('space-y-4', compact ? 'pb-4' : 'pb-28')}
    >
      <div
        className={cn(
          'sticky top-0 z-30 backdrop-blur',
          compact
            ? 'rounded-[1.4rem] border border-border/70 bg-background/96 px-4 py-3'
            : '-mx-3 border-b border-border/70 bg-background/95 px-3 pb-3 pt-1'
        )}
      >
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold">{isEditing ? 'Editar pedido' : 'Novo pedido'}</h1>
              <p className="text-sm text-muted-foreground">Fluxo mobile: catalogo primeiro, fechamento depois.</p>
            </div>
            <div className="rounded-2xl border border-primary/20 bg-primary/[0.08] px-3 py-2 text-right">
              <p className="text-xs text-primary/70">{totalItens} item(ns)</p>
              <p className="font-semibold text-primary">{formatarMoeda(total)}</p>
            </div>
          </div>
          <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl p-1">
            <TabsTrigger value="catalogo" className="rounded-xl">Catalogo</TabsTrigger>
            <TabsTrigger value="finalizar" className="rounded-xl">Finalizar</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="max-w-full truncate">{clienteResumo}</Badge>
            <Badge variant="secondary">{entregaResumo}</Badge>
            <Badge variant="secondary">{pagamentoResumo}</Badge>
          </div>
        </div>
      </div>

      <TabsContent value="catalogo" className="space-y-4">
        {renderCatalogo()}
      </TabsContent>

      <TabsContent value="finalizar" className="space-y-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Resumo</CardTitle>
            <CardDescription>Confira os itens e deixe o fechamento redondo antes de salvar.</CardDescription>
          </CardHeader>
          <CardContent>{renderResumo(false)}</CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Cliente</CardTitle>
          </CardHeader>
          <CardContent>{renderClienteForm()}</CardContent>
        </Card>

        <Card className="border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle>Entrega e pagamento</CardTitle>
          </CardHeader>
          <CardContent>{renderEntregaPagamentoForm()}</CardContent>
        </Card>

        {renderExpandableCard(
          'Descontos',
          'Cupom e valor promocional interno.',
          descontosExpanded,
          setDescontosExpanded,
          renderDescontoForm()
        )}

        {renderExpandableCard(
          'Observacoes',
          'Detalhes do cliente e anotacoes internas da venda.',
          observacoesExpanded,
          setObservacoesExpanded,
          renderObservacoesForm()
        )}

        {renderExpandableCard(
          'Responsavel e etiquetas',
          'Use quando houver controle por responsavel e separacao final.',
          responsavelExpanded,
          setResponsavelExpanded,
          renderResponsavelForm()
        )}
      </TabsContent>

      <div
        className={cn(
          'z-40 border-border/80 bg-background/95 p-3 backdrop-blur',
          compact
            ? 'sticky bottom-0 mt-4 rounded-[1.4rem] border shadow-lg'
            : 'fixed inset-x-0 bottom-0 border-t supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        )}
      >
        {mobileTab === 'catalogo' ? (
          <div className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-12 w-full rounded-2xl" onClick={() => setMobileTab('finalizar')}>
              <ShoppingBag className="mr-2 h-4 w-4" />
              Ver pedido
            </Button>
            <Button type="button" className="h-12 w-full rounded-2xl px-5" onClick={() => setMobileTab('finalizar')}>
              Total {formatarMoeda(total)}
            </Button>
          </div>
        ) : (
          <div className="mx-auto grid max-w-5xl gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="h-12 w-full rounded-2xl" onClick={() => setMobileTab('catalogo')}>
              Voltar ao catalogo
            </Button>
            <Button type="button" className="h-12 w-full rounded-2xl px-5" onClick={handleSubmit} disabled={isSubmitting}>
              <Save className="mr-2 h-4 w-4" />
              {isSubmitting ? 'Salvando...' : isEditing ? 'Salvar pedido' : 'Criar pedido'}
            </Button>
          </div>
        )}
      </div>
    </Tabs>
  )

  return (
    <div className={cn('max-w-full overflow-x-hidden', isMobile ? 'space-y-4' : 'space-y-6')}>
      {renderClienteModal()}
      {isMobile ? renderMobile() : renderDesktop()}
    </div>
  )
}
