'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import useSWR from 'swr'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatarMoeda } from '@/lib/calc'

const api = '/api/admin/financeiro/documentos'
const integracao = '/api/admin/integracoes/onedrive'
const aceitos = '.jpg,.jpeg,.png,.webp,.pdf,.xml'
const maxBytes = 4 * 1024 * 1024
const statusLabels = {
  PRONTO_PARA_REVISAO: 'Pronto para revisão', FALHA_LEITURA: 'Revisão manual',
  CONFIRMADO: 'Confirmado', CANCELADO: 'Cancelado',
}
const sinais: Record<string, string> = {
  MESMO_ARQUIVO: 'Mesmo arquivo', CHAVE_FISCAL: 'Chave fiscal',
  CNPJ_NUMERO_SERIE: 'CNPJ, número e série', VALOR_EMISSAO: 'Valor e emissão',
}
type Resumo = { id: string; nomeOriginal: string; status: keyof typeof statusLabels }
type Fornecedor = { tipo: 'SEM_FORNECEDOR' } | { tipo: 'EXISTENTE'; id: string } |
  { tipo: 'CADASTRAR'; nome: string; cnpj?: string; razaoSocial?: string }
type Revisao = { descricao?: string; valor?: number; vencimento?: string; fornecedor?: Fornecedor;
  categoriaFinanceiraId?: string; observacoes?: string }
type Documento = Resumo & {
  versao: number; origemLeitura: 'XML' | 'OCR'; revisao: Revisao | null;
  fornecedorPorCnpj: { id: string; nome: string } | null; nomeFiscalDivergente: boolean;
  fornecedoresPorNome: { id: string; nome: string }[];
  dadosExtraidos: { campos: { emissor?: string; cnpj?: string; chave?: string; emissao?: string;
    numero?: string; serie?: string; descricao?: string; valor?: number; vencimento?: string };
    confianca: Record<string, 'ALTA' | 'BAIXA'> } | null;
}
type Duplicidade = { id: string; descricao: string; valor: number; sinais: string[] }
type Decisao = { tipo: 'USAR_EXISTENTE'; contaPagarId: string } | { tipo: 'MANTER_NOVO'; motivo: string }
type Opcao = { id: string; nome: string }

async function requisicao<T>(url: string, init?: RequestInit): Promise<T> {
  const resposta = await fetch(url, { cache: 'no-store', ...init })
  const dados = await resposta.json().catch(() => null)
  if (!resposta.ok) throw new Error(dados?.error ?? 'Não foi possível concluir a operação.')
  return dados as T
}

function enviarJson(method: string, dados: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) }
}

function precoInput(centavos?: number) {
  return centavos ? (centavos / 100).toFixed(2).replace('.', ',') : ''
}

function valorCentavos(valor: string) {
  if (!/^\d{1,8}(?:[,.]\d{1,2})?$/.test(valor)) return undefined
  const [reais, fracao = ''] = valor.split(/[,.]/)
  return Number(reais) * 100 + Number(fracao.padEnd(2, '0'))
}

function DocumentoRevisao({ documento, fornecedores, categorias, atualizar, concluir }: {
  documento: Documento; fornecedores: Opcao[]; categorias: Opcao[];
  atualizar: (doc: Documento) => void; concluir: () => void;
}) {
  const fonte = documento.dadosExtraidos?.campos
  const revisao = documento.revisao
  const fornecedorSalvo = revisao?.fornecedor
  const [descricao, setDescricao] = useState(revisao?.descricao ?? fonte?.descricao ?? '')
  const [valor, setValor] = useState(precoInput(revisao?.valor ?? fonte?.valor))
  const [vencimento, setVencimento] = useState(revisao?.vencimento ?? fonte?.vencimento ?? '')
  const [fornecedor, setFornecedor] = useState(
    fornecedorSalvo?.tipo === 'EXISTENTE' ? fornecedorSalvo.id :
      fornecedorSalvo?.tipo ?? documento.fornecedorPorCnpj?.id ?? '',
  )
  const [nome, setNome] = useState(fornecedorSalvo?.tipo === 'CADASTRAR' ? fornecedorSalvo.nome : fonte?.emissor?.slice(0, 80) ?? '')
  const [cnpj, setCnpj] = useState(fornecedorSalvo?.tipo === 'CADASTRAR' ? fornecedorSalvo.cnpj ?? '' : fonte?.cnpj ?? '')
  const [categoria, setCategoria] = useState(revisao?.categoriaFinanceiraId ?? '')
  const [motivo, setMotivo] = useState('')
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState('')
  const [duplicidades, setDuplicidades] = useState<Duplicidade[]>([])
  const [ocupado, setOcupado] = useState(false)
  const encerrado = documento.status === 'CONFIRMADO' || documento.status === 'CANCELADO'
  const base = api + '/' + documento.id
  const inputClass = 'h-10 w-full rounded-md border bg-background px-2 text-sm'

  async function executar(acao: () => Promise<void>) {
    setErro('')
    setResultado('')
    setOcupado(true)
    try { await acao() } catch (error) { setErro((error as Error).message) }
    finally { setOcupado(false) }
  }

  async function confirmar(versao: number, duplicidade?: Decisao) {
    const resposta = await fetch(base + '/confirmar', enviarJson('POST', { versao, duplicidade }))
    const retorno = await resposta.json().catch(() => null)
    if (resposta.status === 409 && Array.isArray(retorno?.duplicidades)) {
      setDuplicidades(retorno.duplicidades)
      return
    }
    if (!resposta.ok) throw new Error(retorno?.error ?? 'Não foi possível confirmar a conta.')
    concluir()
    setResultado(duplicidade?.tipo === 'USAR_EXISTENTE' ? 'Documento vinculado à conta existente.' : 'Conta pendente confirmada.')
    setDuplicidades([])
    atualizar({ ...documento, status: 'CONFIRMADO' })
  }

  async function salvar(confirmacao: boolean) {
    if (valor && !valorCentavos(valor)) throw new Error('Informe um valor positivo em reais.')
    const escolha: Fornecedor | undefined = fornecedor === 'SEM_FORNECEDOR' ? { tipo: fornecedor } :
      fornecedor === 'CADASTRAR' ? { tipo: fornecedor, nome, cnpj: cnpj || undefined, razaoSocial: fonte?.emissor } :
      fornecedor ? { tipo: 'EXISTENTE', id: fornecedor } : undefined
    if (confirmacao && (descricao.trim().length < 2 || !valorCentavos(valor) || !vencimento || !escolha)) {
      throw new Error('Complete a descrição, o valor, o vencimento e a decisão de fornecedor.')
    }
    const salvo = await requisicao<Documento>(base + '/revisao', enviarJson('PATCH', {
      versao: documento.versao, revisao: {
        descricao, valor: valorCentavos(valor), vencimento: vencimento || undefined,
        fornecedor: escolha, categoriaFinanceiraId: categoria || undefined, observacoes: revisao?.observacoes,
      },
    }))
    atualizar({ ...documento, revisao: salvo.revisao, versao: salvo.versao })
    setDuplicidades([])
    if (confirmacao) await confirmar(salvo.versao)
    else setResultado('Rascunho salvo.')
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="break-words font-semibold">{documento.nomeOriginal}</h3>
        <p className="text-sm">{statusLabels[documento.status]}</p>
        <a className="text-sm underline" href={base + '/conteudo'} target="_blank" rel="noreferrer">Baixar original</a>
        {fonte ? <dl className="grid gap-1 text-sm">
          <dt className="font-medium">Leitura {documento.origemLeitura}</dt>
          {fonte.emissor && <dd>{fonte.emissor}</dd>}
          {fonte.cnpj && <dd>CNPJ {fonte.cnpj}</dd>}
          {fonte.numero && <dd>Nota {fonte.numero}{fonte.serie && ' · Série ' + fonte.serie}</dd>}
          {fonte.emissao && <dd>Emissão {fonte.emissao.split('-').reverse().join('/')}</dd>}
          {fonte.valor && <dd>Total {formatarMoeda(fonte.valor)} ({documento.dadosExtraidos?.confianca.valor?.toLowerCase()} confiança)</dd>}
          {!fonte.vencimento && <dd>Vencimento a conferir.</dd>}
        </dl> : <p className="text-sm text-muted-foreground">Preencha os dados a partir do arquivo original.</p>}
      </section>
      <div className="space-y-3">
        {resultado && <p role="status" className="text-sm">{resultado}</p>}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        {!encerrado && <>
          <fieldset className="grid gap-3" disabled={ocupado || duplicidades.length > 0}>
            <Label className="grid gap-1">Descrição<Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={120} /></Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <Label className="grid gap-1">Valor (R$)<Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></Label>
              <Label className="grid gap-1">Vencimento<Input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} /></Label>
            </div>
            <Label className="grid gap-1">Fornecedor
              <select className={inputClass} value={fornecedor} onChange={(e) => setFornecedor(e.target.value)}>
                <option value="">Selecione uma opção</option><option value="SEM_FORNECEDOR">Sem fornecedor</option>
                <option value="CADASTRAR">Cadastrar ao confirmar</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Label>
            {documento.nomeFiscalDivergente && <p className="text-sm">O CNPJ coincide, mas o nome fiscal é diferente.</p>}
            {documento.fornecedoresPorNome.length > 0 && <p className="text-sm">Nomes semelhantes: {documento.fornecedoresPorNome.map((f) => f.nome).join(', ')}.</p>}
            {fornecedor === 'CADASTRAR' && <div className="grid gap-3 sm:grid-cols-2">
              <Label className="grid gap-1">Nome<Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} /></Label>
              <Label className="grid gap-1">CNPJ<Input inputMode="numeric" value={cnpj} onChange={(e) => setCnpj(e.target.value)} maxLength={32} /></Label>
            </div>}
            <Label className="grid gap-1">Categoria
              <select className={inputClass} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                <option value="">Sem categoria</option>
                {categorias.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </Label>
          </fieldset>
          {duplicidades.length ? <section className="space-y-2 rounded-lg border p-3">
            <h3 className="font-medium">Confira as possíveis duplicidades</h3>
            {duplicidades.map((item) => <div key={item.id} className="space-y-1 border-b pb-2">
              <p className="text-sm">{item.descricao} · {formatarMoeda(item.valor)}</p>
              <p className="text-sm text-muted-foreground">{item.sinais.map((sinal) => sinais[sinal] ?? sinal).join(', ')}</p>
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => executar(() => confirmar(documento.versao, { tipo: 'USAR_EXISTENTE', contaPagarId: item.id }))}>Usar esta conta</Button>
            </div>)}
            <Label className="grid gap-1">Justificativa para uma nova conta<Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></Label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={ocupado} onClick={() => setDuplicidades([])}>Voltar à revisão</Button>
              <Button type="button" disabled={ocupado || motivo.trim().length < 5} onClick={() => executar(() => confirmar(documento.versao, { tipo: 'MANTER_NOVO', motivo }))}>Confirmar como nova</Button>
            </div>
          </section> : <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={ocupado} onClick={() => executar(() => salvar(false))}>Salvar rascunho</Button>
            <Button type="button" disabled={ocupado} onClick={() => executar(() => salvar(true))}>Confirmar conta pendente</Button>
          </div>}
          <Button type="button" variant="ghost" disabled={ocupado} onClick={() => { setMotivo(''); setCancelando(!cancelando) }}>Cancelar rascunho</Button>
          {cancelando && <div className="grid gap-2">
            <Label className="grid gap-1">Motivo do cancelamento<Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} /></Label>
            <Button type="button" variant="destructive" disabled={ocupado || motivo.trim().length < 5} onClick={() => executar(async () => {
              await requisicao(base + '/cancelar', enviarJson('POST', { versao: documento.versao, motivo }))
              concluir()
              atualizar({ ...documento, status: 'CANCELADO' })
            })}>Cancelar documento</Button>
          </div>}
        </>}
      </div>
    </div>
  )
}

export function ImportarDocumento({ fornecedores, categorias, atualizarFinanceiro }: {
  fornecedores: Opcao[]; categorias: Opcao[]; atualizarFinanceiro: () => void;
}) {
  return <Suspense fallback={null}><Importacao fornecedores={fornecedores} categorias={categorias} atualizarFinanceiro={atualizarFinanceiro} /></Suspense>
}

function Importacao({ fornecedores, categorias, atualizarFinanceiro }: {
  fornecedores: Opcao[]; categorias: Opcao[]; atualizarFinanceiro: () => void;
}) {
  const retorno = useSearchParams().get('onedrive')
  const [aberto, setAberto] = useState(Boolean(retorno))
  const [pendente, setPendente] = useState(retorno === 'retorno')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState(retorno === 'falha' ? 'Autorização interrompida. Inicie uma nova conexão.' : '')
  const [arquivo, setArquivo] = useState<{ id: string; file: File } | null>(null)
  const [previa, setPrevia] = useState('')
  const [documento, setDocumento] = useState<Documento | null>(null)
  const { data: conexao, error, mutate } = useSWR<{ estado: string; gerenciar: boolean }>(integracao, requisicao)
  const { data: recentes, error: erroRecentes, isLoading, mutate: atualizarRecentes } =
    useSWR<Resumo[]>(aberto && conexao?.estado !== 'INDISPONIVEL' ? api : null, requisicao)

  useEffect(() => {
    if (previa) return () => URL.revokeObjectURL(previa)
  }, [previa])

  async function executar(acao: () => Promise<void>) {
    setErro('')
    setEnviando(true)
    try { await acao() } catch (error) { setErro((error as Error).message) }
    finally { setEnviando(false) }
  }

  if (conexao?.estado === 'INDISPONIVEL' || (!conexao && !error && !pendente)) return null
  const conectado = conexao?.estado === 'CONECTADO'
  return <>
    <Button className="h-11 rounded-2xl" type="button" variant="outline" onClick={() => setAberto(true)}>Importar nota</Button>
    <Dialog open={aberto} onOpenChange={(abertura) => { if (!enviando) setAberto(abertura) }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader><DialogTitle>Importar nota</DialogTitle><DialogDescription>Revise o documento antes de confirmar a conta a pagar.</DialogDescription></DialogHeader>
        {(erro || error) && <p role="alert" className="text-sm text-destructive">{erro || 'Não foi possível consultar o OneDrive.'}</p>}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p role="status">{conectado ? 'OneDrive conectado' : 'OneDrive desconectado'}</p>
          {conexao?.gerenciar && <>
            {pendente ? <Button type="button" disabled={enviando} onClick={() => executar(async () => {
              await requisicao(integracao + '/concluir', { method: 'POST' })
              setPendente(false)
              window.history.replaceState(null, '', window.location.pathname)
              await mutate()
            })}>Concluir conexão</Button> : <Button type="button" variant="outline" disabled={enviando} onClick={() => executar(async () => {
              const { url } = await requisicao<{ url: string }>(integracao + '/conectar', { method: 'POST' })
              window.location.assign(url)
            })}>{conectado ? 'Reconectar' : 'Conectar OneDrive'}</Button>}
            {pendente && erro && <Button type="button" variant="outline" onClick={() => { setPendente(false); setErro('') }}>Iniciar novamente</Button>}
            {conectado && <Button type="button" variant="ghost" disabled={enviando} onClick={() => {
              if (window.confirm('Desconectar o OneDrive? Os documentos continuam guardados.')) {
                void executar(async () => { await requisicao(integracao, { method: 'DELETE' }); await mutate() })
              }
            }}>Desconectar</Button>}
          </>}
          {!conectado && conexao && !conexao.gerenciar && <p>Peça ao MASTER para conectar o OneDrive.</p>}
        </div>
        {documento ? <>
          <Button type="button" variant="ghost" className="justify-self-start" onClick={() => setDocumento(null)}>Voltar aos documentos</Button>
          <DocumentoRevisao key={documento.id} documento={documento} fornecedores={fornecedores} categorias={categorias}
            atualizar={setDocumento} concluir={() => { atualizarFinanceiro(); void atualizarRecentes() }} />
        </> : <>
          {conectado && <div className="grid gap-2 rounded-lg border p-3">
            <Label className="grid gap-1">Arquivo (JPG, PNG, WEBP, PDF ou XML, até 4 MiB)
              <Input type="file" accept={aceitos} disabled={enviando} onChange={(e) => {
                const file = e.target.files?.[0]
                setPrevia(file?.type.startsWith('image/') ? URL.createObjectURL(file) : '')
                setErro('')
                setArquivo(file ? { file, id: crypto.randomUUID() } : null)
              }} />
            </Label>
            {previa && <Image alt="Prévia do arquivo selecionado" src={previa} width={220} height={160} unoptimized className="max-h-40 object-contain" />}
            <Button type="button" className="justify-self-start" disabled={enviando || !arquivo} onClick={() => executar(async () => {
              if (!arquivo) return
              if (arquivo.file.size > maxBytes) throw new Error('Selecione um arquivo de até 4 MiB.')
              const enviado = await requisicao<Resumo>(api, {
                method: 'POST', body: arquivo.file, headers: {
                  'Content-Type': arquivo.file.type || 'application/octet-stream',
                  'X-Documento-Id': arquivo.id, 'X-Nome-Arquivo': encodeURIComponent(arquivo.file.name),
                },
              })
              setDocumento(await requisicao<Documento>(api + '/' + enviado.id))
              setArquivo(null)
              setPrevia('')
              await atualizarRecentes()
            })}>{enviando ? 'Aguarde…' : 'Enviar e revisar'}</Button>
          </div>}
          <section className="space-y-2">
            <h3 className="font-medium">Documentos recentes</h3>
            {isLoading && <p role="status" className="text-sm">Carregando documentos…</p>}
            {erroRecentes && <p role="alert" className="text-sm text-destructive">Não foi possível carregar os documentos.</p>}
            {recentes?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>}
            {recentes?.map((item) => <button key={item.id} type="button" disabled={enviando}
              onClick={() => executar(async () => setDocumento(await requisicao<Documento>(api + '/' + item.id)))}
              className="flex min-h-11 w-full flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="break-all">{item.nomeOriginal}</span><span>{statusLabels[item.status]}</span>
            </button>)}
          </section>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
