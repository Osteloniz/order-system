export function isAsaasGatewayEnabled() {
  return Boolean(process.env.ASAAS_API_KEY?.trim())
}

export function isAsaasSandbox() {
  return (process.env.ASAAS_ENV?.trim().toLowerCase() || 'sandbox') !== 'production'
}

export function getOnlinePaymentGateway() {
  if (isAsaasGatewayEnabled()) {
    return {
      gateway: 'ASAAS' as const,
      cartaoDebitoSuportado: false,
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

  return {
    cartao: cartaoHabilitado,
    cartaoCredito: cartaoCreditoHabilitado,
    cartaoDebito: cartaoDebitoHabilitado,
    gateway,
  }
}
