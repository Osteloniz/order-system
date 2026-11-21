'use client'

import { toast } from 'sonner'
import { useEffect, useRef, useState } from 'react'
import type { OperacaoCaixa } from '@/lib/caixa-contract'
import { CaixaRequestError, requestCaixa } from '@/components/admin/caixa-client'

export function useCaixaMovement(storageKey: string, expire: () => void, onSuccess: () => void) {
  const [pending, setPending] = useState<OperacaoCaixa>()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const lock = useRef(false)

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey)
      if (saved) setPending(JSON.parse(saved))
    } catch {
      setMessage('Não foi possível recuperar a última tentativa.')
    }
  }, [storageKey])

  async function run(operacao: OperacaoCaixa) {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operacao))
      setPending(operacao)
      const result = await requestCaixa<{ numero: string }>('movimentos', 'POST', operacao)
      sessionStorage.removeItem(storageKey)
      setPending(undefined)
      toast.success('Operação confirmada na venda #' + result.numero + '.')
      onSuccess()
    } catch (error) {
      if (error instanceof CaixaRequestError && error.status === 401) {
        expire()
      } else if (error instanceof CaixaRequestError && error.status < 500) {
        sessionStorage.removeItem(storageKey)
        setPending(undefined)
        setMessage(error.message)
        onSuccess()
      } else {
        setMessage('Confirmação inconclusiva. Consulte o resultado com a mesma tentativa.')
      }
    } finally {
      setBusy(false)
      lock.current = false
    }
  }

  return { pending, busy, message, run }
}
