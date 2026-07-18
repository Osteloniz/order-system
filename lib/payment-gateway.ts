import { isMercadoPagoConfigured } from '@/lib/mercado-pago'

export function isAsaasGatewayEnabled() {
  return Boolean(process.env.ASAAS_API_KEY?.trim())
}

export function isAsaasSandbox() {
  return (process.env.ASAAS_ENV?.trim().toLowerCase() || 'sandbox') !== 'production'
}

function getPreferredOnlineGateway() {
  const rawValue = process.env.ONLINE_PAYMENT_GATEWAY?.trim().toUpperCase()
  if (rawValue === 'ASAAS' || rawValue === 'MERCADO_PAGO') {
    return rawValue
  }

  return null
}

export function getOnlinePaymentGateway() {
  const preferredGateway = getPreferredOnlineGateway()

  if (preferredGateway === 'MERCADO_PAGO' && isMercadoPagoConfigured()) {
    return {
      gateway: 'MERCADO_PAGO' as const,
      cartaoDebitoSuportado: true,
    }
  }

  if (preferredGateway === 'ASAAS' && isAsaasGatewayEnabled()) {
    return {
      gateway: 'ASAAS' as const,
      cartaoDebitoSuportado: false,
    }
  }

  if (!preferredGateway && isAsaasGatewayEnabled()) {
    return {
      gateway: 'ASAAS' as const,
      cartaoDebitoSuportado: false,
    }
  }

  if (!preferredGateway && isMercadoPagoConfigured()) {
    return {
      gateway: 'MERCADO_PAGO' as const,
      cartaoDebitoSuportado: true,
    }
  }

  return {
    gateway: null,
    cartaoDebitoSuportado: true,
  }
}

export function resolvePublicCardAvailability({
  cartaoHabilitado,
  cartaoCreditoHabilitado,
  cartaoDebitoHabilitado,
}: {
  cartaoHabilitado: boolean
  cartaoCreditoHabilitado: boolean
  cartaoDebitoHabilitado: boolean
}) {
  const gateway = getOnlinePaymentGateway()

  if (!cartaoHabilitado) {
    return {
      cartao: false,
      cartaoCredito: false,
      cartaoDebito: false,
      gateway,
    }
  }

  if (gateway.gateway === 'ASAAS') {
    return {
      cartao: cartaoCreditoHabilitado,
      cartaoCredito: cartaoCreditoHabilitado,
      cartaoDebito: false,
      gateway,
    }
  }

  if (gateway.gateway === 'MERCADO_PAGO') {
    return {
      cartao: cartaoCreditoHabilitado || cartaoDebitoHabilitado,
      cartaoCredito: cartaoCreditoHabilitado,
      cartaoDebito: cartaoDebitoHabilitado,
      gateway,
    }
  }

  return {
    cartao: cartaoHabilitado,
    cartaoCredito: cartaoCreditoHabilitado,
    cartaoDebito: cartaoDebitoHabilitado,
    gateway,
  }
}
