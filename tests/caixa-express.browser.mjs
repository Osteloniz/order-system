import assert from 'node:assert/strict'

const routes = [
  ['/admin/inicio', 'Operação de hoje'],
  ['/admin', null],
  ['/admin/kds', null],
  ['/admin/config', 'Tema visual do ambiente interno'],
  ['/caixa', 'Caixa Express'],
]
const modes = ['light', 'dark']
const themes = ['PADRAO', 'NATAL', 'ANO_NOVO']

function cookiesFrom(client, url) {
  return client.cookie().split('; ').filter(Boolean).map((pair) => {
    const i = pair.indexOf('=')
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: url.origin }
  })
}

async function checkTokens(page) {
  return page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    function luminance(token) {
      const value = root.getPropertyValue(token).trim()
      if (!/^#(?:[a-f0-9]{3}|[a-f0-9]{6})$/i.test(value)) throw new Error('Cor inválida para ' + token)
      const hex = value.length === 4 ? [...value.slice(1)].map((digit) => digit.repeat(2)).join('') : value.slice(1)
      const rgb = hex.match(/../g).map((v) => parseInt(v, 16) / 255)
        .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    function contrast(a, b) {
      const rgb = [luminance(a), luminance(b)].sort((x, y) => y - x)
      return (rgb[0] + 0.05) / (rgb[1] + 0.05)
    }
    const text = [
      ['--foreground', '--background'], ['--card-foreground', '--card'],
      ['--primary-foreground', '--primary'], ['--muted-foreground', '--card'],
      ['--warning-foreground', '--card'], ['--destructive', '--card'], ['--popover-foreground', '--popover'],
      ['--sidebar-foreground', '--sidebar'], ['--secondary-foreground', '--secondary'],
    ]
    return { text: Math.min(...text.map(([a, b]) => contrast(a, b))),
      focus: Math.min(contrast('--ring', '--card'), contrast('--ring', '--background')) }
  })
}

export async function validarNavegador({ base, admin, caixa, produto, pendencia }) {
  const { chromium } = await import(process.env.CAIXA_PLAYWRIGHT_MODULE)
  const browser = await chromium.launch({
    ...(process.env.CAIXA_BROWSER_EXE ? { executablePath: process.env.CAIXA_BROWSER_EXE } : {}),
    headless: true,
  })
  let telas = 0
  let minText = Infinity
  let minFocus = Infinity
  try {
    for (const [width, height] of [[390, 844], [820, 1180], [1280, 900]]) {
      for (const mode of modes) {
        const publicContext = await browser.newContext({ viewport: { width, height }, colorScheme: mode, reducedMotion: 'reduce' })
        await publicContext.addInitScript((theme) => localStorage.setItem('theme', theme), mode)
        const publicPage = await publicContext.newPage()
        await publicPage.goto(base.origin + '/admin/login')
        assert.equal(await publicPage.locator('html').getAttribute('data-brookie-internal'), null)
        await publicPage.getByRole('button', { name: 'Continuar' }).waitFor()
        await publicPage.locator('html.' + mode).waitFor({ state: 'attached' })
        await publicPage.goto(base.origin + '/caixa/login')
        await publicPage.getByText('Entrar no Caixa', { exact: true }).waitFor()
        assert.equal(await publicPage.locator('html').getAttribute('data-brookie-internal'), null)
        await publicContext.close()
        for (const theme of themes) {
          const update = await admin.send('/api/admin/tema', 'PATCH', { temaVisual: theme })
          assert.equal(update.status, 200)
          const context = await browser.newContext({ viewport: { width, height }, colorScheme: mode, reducedMotion: 'reduce' })
          await context.addInitScript((theme) => localStorage.setItem('theme', theme), mode)
          await context.addCookies(cookiesFrom(admin, base))
          const page = await context.newPage()
          for (const [route, heading] of routes) {
            await page.goto(base.origin + route)
            await page.locator(`html[data-brookie-internal="${theme}"].${mode}`).waitFor({ state: 'attached' })
            if (heading) await page.getByText(heading, { exact: true }).first().waitFor()
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, route + ' rolagem horizontal')
            const contrast = await checkTokens(page)
            minText = Math.min(minText, contrast.text)
            minFocus = Math.min(minFocus, contrast.focus)
            if (route === '/admin/inicio' && theme !== 'PADRAO') {
              const image = page.locator('img[src*="transparente.webp"]')
              await image.waitFor()
              await image.evaluate((img) => img.decode())
            }
            if (route === '/admin/config' && theme !== 'PADRAO') {
              const image = page.locator('img[src*="unitaria.webp"]')
              await image.waitFor()
              await image.evaluate((img) => img.decode())
            }
            telas++
          }
          await page.getByRole('tab', { name: 'Pendências' }).click()
          const row = page.getByRole('listitem').filter({ hasText: '#' + pendencia })
          const trigger = row.getByRole('button', { name: 'Dar baixa' })
          await trigger.focus()
          await page.keyboard.press('Enter')
          const dialog = page.getByRole('alertdialog')
          await dialog.getByText('Confirmar recebimento', { exact: true }).waitFor()
          assert.equal(await dialog.evaluate((element) => !!element.closest('html[data-brookie-internal]')), true)
          await page.keyboard.press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          assert.equal(await trigger.evaluate((element) => document.activeElement === element), true)
          await page.goto(base.origin + '/menu')
          assert.equal(await page.locator('html').getAttribute('data-brookie-internal'), null)
          await context.close()
        }
      }
    }
    assert(minText >= 4.5, 'Contraste de texto ' + minText)
    assert(minFocus >= 3, 'Contraste de foco ' + minFocus)
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    await context.addCookies(cookiesFrom(caixa, base))
    const page = await context.newPage()
    await page.goto(base.origin + '/caixa')
    const product = page.getByRole('button').filter({ hasText: produto }).filter({ hasText: 'disponíveis' })
    await product.waitFor()
    const started = performance.now()
    await product.tap()
    const finish = page.getByRole('button', { name: 'Concluir venda' })
    assert(await finish.isDisabled(), 'Exigir confirmação explícita de pagamento')
    await page.getByText('Adicionar observação', { exact: true }).tap()
    await page.getByLabel('Observação da venda', { exact: true }).fill('Separar em duas embalagens.')
    await page.getByRole('button', { name: 'Já recebi' }).tap()
    const actionBox = await finish.boundingBox()
    assert(actionBox && actionBox.y + actionBox.height <= 844, 'Ação visível no móvel')
    await finish.tap()
    await page.getByText(/Venda #[A-F0-9]{8} concluída/).waitFor()
    console.log('OK navegador ' + telas + ' telas · contraste mínimo texto ' + minText.toFixed(2) +
      ':1 · foco ' + minFocus.toFixed(2) + ':1 · venda móvel sintética ' + Math.round(performance.now() - started) + ' ms')
    let committed
    const urlPattern = '**/api/caixa/vendas'
    await page.route(urlPattern, async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch()
      committed = await response.json()
      await route.abort('connectionreset')
    })
    await product.tap()
    await page.getByRole('button', { name: 'Já recebi' }).tap()
    await finish.tap()
    await page.getByRole('alert').filter({ hasText: 'Confirmação inconclusiva' }).waitFor()
    assert.match(committed.numero, /^[A-F0-9]{8}$/)
    await page.unroute(urlPattern)
    await page.reload()
    await page.getByRole('button', { name: 'Consultar tentativa' }).tap()
    await page.getByText('Venda #' + committed.numero + ' concluída.', { exact: true }).waitFor()
    console.log('OK navegador retomou a mesma venda após perder a resposta pós-commit')
    await context.close()
  } finally {
    await browser.close()
  }
}

export async function validarBuscaVinculoNavegador({ base, admin, operador, senha, filtro, cliente, venda, observacao }) {
  const { chromium } = await import(process.env.CAIXA_PLAYWRIGHT_MODULE)
  const browser = await chromium.launch({
    ...(process.env.CAIXA_BROWSER_EXE ? { executablePath: process.env.CAIXA_BROWSER_EXE } : {}),
    headless: true,
  })
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await context.newPage()
    await page.goto(base.origin + '/caixa/login')
    await page.getByRole('combobox', { name: 'Loja' }).selectOption('brookie-pregiato')
    await page.getByLabel('Login', { exact: true }).fill(operador.username)
    const password = page.getByLabel('Senha', { exact: true })
    assert.equal(await password.getAttribute('autocomplete'), 'current-password')
    await password.fill(senha)
    await page.getByRole('checkbox', { name: 'Lembrar loja e login neste navegador' }).check()
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.getByRole('heading', { name: 'Caixa Express' }).waitFor()
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('brookie-caixa-login'))),
      { loja: 'brookie-pregiato', login: operador.username })
    await page.goto(base.origin + '/caixa/login')
    await page.waitForURL(base.origin + '/caixa')
    await page.getByText('Cliente balcão · Fidelidade', { exact: true }).click()
    async function buscarESelecionar(page) {
      await page.getByLabel('Buscar cliente por nome ou telefone').fill(filtro)
      await page.getByLabel('Buscar cliente por nome ou telefone').press('Enter')
      const results = page.getByRole('list', { name: 'Resultados da busca' })
      await results.getByText('Telefone final ' + cliente.telefone.slice(-4)).waitFor()
      assert.equal(await results.getByRole('listitem').count(), 2)
      await results.getByRole('listitem').filter({ hasText: 'Telefone final ' + cliente.telefone.slice(-4) })
        .getByRole('button', { name: 'Selecionar' }).click()
    }
    await buscarESelecionar(page)
    await page.locator('summary').getByText(cliente.nome, { exact: true }).waitFor()
    await page.getByText('Adicionar observação', { exact: true }).click()
    await page.getByLabel('Observação da venda', { exact: true }).fill(observacao)
    await page.reload()
    await page.locator('summary').getByText('Observação da venda', { exact: true }).click()
    assert.equal(await page.getByLabel('Observação da venda', { exact: true }).inputValue(), observacao)
    await page.getByRole('button', { name: 'Sair' }).click()
    await page.waitForURL(base.origin + '/caixa/login')
    await page.waitForFunction((username) => document.querySelector('#caixa-login')?.value === username, operador.username)
    assert.equal(await page.getByLabel('Senha', { exact: true }).inputValue(), '')
    await context.close()

    const adminContext = await browser.newContext()
    await adminContext.addCookies(cookiesFrom(admin, base))
    const adminPage = await adminContext.newPage()
    await adminPage.goto(base.origin + '/caixa?gestao=' + venda)
    await adminPage.getByRole('button', { name: 'Buscar', exact: true }).click()
    await adminPage.getByText(observacao, { exact: true }).waitFor()
    await adminPage.getByText('Vincular cliente para fidelidade', { exact: true }).click()
    await buscarESelecionar(adminPage)
    await adminPage.getByRole('button', { name: 'Confirmar vínculo' }).click()
    await adminPage.getByText('Cliente vinculado à venda.', { exact: true }).waitFor()
    await adminContext.close()
    console.log('OK navegador: seleção de loja, lembrança de login, retomada de sessão, busca e vínculo')
  } finally {
    await browser.close()
  }
}
