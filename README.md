# Bot 24h — página de vendas completa

Página de vendas pronta para publicar, em português, com oferta de **pagamento único / acesso vitalício**.
HTML e CSS puros: sem build, sem framework, sem dependência. É só subir os arquivos.

## Arquivos

| Arquivo | O que é |
|---|---|
| `index.html` | A página de vendas (copy completa, nada em branco) |
| `obrigado.html` | Página pós-compra com os próximos passos — aponte o checkout para ela |
| `termos.html` | Termos de uso + política de reembolso |
| `privacidade.html` | Política de privacidade (LGPD) |
| `estilo-paginas.css` | Estilo compartilhado das três páginas internas |
| `capa.png` | Imagem 1200×630 que aparece ao compartilhar o link |
| `vercel.json` | Configuração de deploy (URLs limpas, cache e headers) |
| `checkout.html` + `api/` | Checkout próprio com Pix e cartão (ver seção abaixo) |

## Antes de publicar — o mínimo obrigatório

**1. Link do checkout.** No fim do `index.html`, preencha:

```js
var LINK_CHECKOUT = 'https://pay.kiwify.com.br/seu-produto';
```

Todos os botões de compra passam a apontar para lá. Enquanto estiver vazio, eles só rolam até a seção de preço.

**2. Dados da empresa.** Um localizar/substituir em todos os arquivos:

| Trocar | Por |
|---|---|
| `SUA EMPRESA LTDA` | sua razão social |
| `00.000.000/0001-00` | seu CNPJ |
| `@seuusuario` e `t.me/seuusuario` | seu usuário do Telegram |
| `seudominio.com.br` | seu domínio (e-mails e URLs) |
| `[cidade/UF]` (termos.html) | sua cidade |
| `[nome do responsável]` (privacidade.html) | quem responde por dados |

**3. Depoimentos.** Os três da seção "Quem colocou pra rodar" são **exemplos de formato** — está avisado
num comentário no código. Troque pelos depoimentos reais dos seus clientes antes de anunciar. Print de conversa
do Telegram converte mais que texto digitado, e depoimento inventado é propaganda enganosa (CDC, art. 37).

**4. Preço.** Se o seu não for R$ 197, busque por `197`, `497` e `19,90` no `index.html` — aparecem na caixa de
preço, na barra fixa do celular, no CTA final e no texto da garantia.

## Trocar o nome do produto

"Bot 24h" aparece nos 4 arquivos HTML e na `capa.png`. Um substituir-todos resolve o texto;
a imagem de capa você refaz em qualquer editor no tamanho 1200×630.

## Ajustar as cores

Tudo sai de três variáveis no topo do `<style>` do `index.html` (e repetidas no `estilo-paginas.css`):

```css
--azul:#2aabee;   /* cor da marca (padrão: azul do Telegram) */
--verde:#22c55e;  /* botões de compra e preço */
--bg:#0a141d;     /* fundo */
```

## Publicar na Vercel

O repositório já tem o `vercel.json` configurado (URLs limpas, cache dos arquivos estáticos e headers de
segurança). Não há build: a Vercel serve os arquivos direto.

**Pelo painel (3 cliques, recomendado):**

1. Acesse [vercel.com/new](https://vercel.com/new) e conecte sua conta do GitHub.
2. Escolha o repositório `dzskl/as` → **Import**.
3. Em *Framework Preset* deixe **Other**, não preencha build nem output → **Deploy**.

A Vercel publica a branch padrão do repositório — hoje é a `claude/telegram-bot-sales-page-cghi64`.
Em ~30 segundos você recebe uma URL `*.vercel.app`, e cada `git push` novo redeploya sozinho.
Para usar domínio próprio: *Project → Settings → Domains*.

**Pelo terminal, sem GitHub:**

```bash
npx vercel          # pré-visualização
npx vercel --prod   # produção
```

Rode dentro da pasta do projeto; o `npx` pede login na primeira vez.

### Outras hospedagens

| Onde | Como |
|---|---|
| **Netlify Drop** | Arraste a pasta em [app.netlify.com/drop](https://app.netlify.com/drop) — no ar em segundos |
| **GitHub Pages** | Settings → Pages → branch → `/root` |
| **Hospedagem comum** | Suba os arquivos para a pasta `public_html` via FTP |

Depois de publicar, troque `https://seudominio.com.br/` nas tags `og:url` e `canonical` do `index.html`
pelo endereço real — é o que faz o preview do link aparecer certo no WhatsApp e no Telegram.

## Checkout próprio (Pix + cartão)

O projeto tem checkout próprio, sem plataforma intermediária: `checkout.html` no navegador e
funções serverless em `/api` rodando na mesma Vercel.

```
checkout.html          formulário, tela do Pix e tela de sucesso
api/produto.js         GET  — nome, preço e parcelamento (a fonte da verdade)
api/criar-pagamento.js POST — cria o pedido e a cobrança no gateway
api/status.js          GET  — a tela do Pix consulta se o pagamento caiu
api/webhook.js         POST — o gateway avisa o pagamento; aqui o acesso é liberado
api/_gateway.js        ADAPTADOR — o único arquivo que muda ao trocar de gateway
api/_entrega.js        gancho da entrega (e-mail, convite no Telegram, cadastro)
api/_pedidos.js        armazenamento (Vercel KV/Upstash, ou memória em dev)
api/_validacao.js      CPF com dígito verificador, e-mail, telefone
testes/fluxo.test.js   17 testes de ponta a ponta
```

### Rodar e testar localmente

```bash
npm run dev      # http://localhost:3000/checkout.html
npm run teste    # 17 testes de ponta a ponta
```

Sem credencial nenhuma o checkout já funciona em **modo simulado**: gera um Pix falso (com
"SIMULADO" escrito no QR, impossível de pagar por engano), mostra um botão "simular pagamento
aprovado" que dispara o mesmo webhook que o gateway dispararia, e leva até a página de obrigado.
Dá para testar o fluxo inteiro antes de ter conta em qualquer gateway.

No cartão em modo simulado: número terminado em `0000` simula recusa, qualquer outro aprova.

### Ligar a FreePay

⚠️ **A documentação pública da FreePay não está disponível** — o mapeamento em `api/_gateway.js`
segue o padrão mais comum entre sub-adquirentes brasileiros (`POST /transactions`, auth Basic),
mas **não foi verificado contra as docs oficiais**. Peça as docs ao suporte deles e confirme
quatro pontos, todos configuráveis por variável de ambiente:

1. `FREEPAY_URL_BASE` — a URL base da API
2. `FREEPAY_AUTH` — `basic` ou `bearer`
3. os nomes dos campos do POST (funções `montarCorpoPix` / `montarCorpoCartao`)
4. `FREEPAY_WEBHOOK_HEADER` e o algoritmo da assinatura do webhook

Depois preencha as variáveis (veja `.env.example`) e troque `GATEWAY_MODO` para `freepay`.
Configure a URL do webhook no painel da FreePay como `https://seudominio.com.br/api/webhook`.

**O cartão precisa de um passo a mais:** o número do cartão não pode chegar ao nosso servidor —
isso jogaria o projeto no escopo pesado do PCI-DSS. O certo é o SDK do gateway transformar os
dados em token no próprio navegador. A função `tokenizarCartao()` em `checkout.html` já está
preparada para chamar `window.FreePay.createToken()`; falta carregar o script deles e confirmar
a assinatura do método. Enquanto isso não existir, o cartão avisa o cliente e o Pix funciona
normalmente.

### Armazenamento dos pedidos

Funções serverless não guardam estado: sem banco, o webhook não encontra o pedido criado pelo
checkout. Em produção, crie um Redis na Vercel (*Storage → KV*) e as variáveis `KV_REST_API_URL`
e `KV_REST_API_TOKEN` aparecem sozinhas no projeto. Sem elas o sistema usa memória — bom para
desenvolvimento, inaceitável em produção.

### O que já está protegido

- **preço vem do servidor** (`api/_config.js`): mandar `valorCentavos: 1` no corpo não muda nada;
- **webhook falha fechada**: sem segredo configurado, nenhum evento é aceito — senão qualquer
  pessoa com a URL liberaria acesso de graça;
- **idempotência**: evento repetido não entrega o produto duas vezes, e pedido pago não volta
  para pendente por evento fora de ordem;
- **dados revalidados no servidor**, incluindo os dígitos verificadores do CPF;
- **rede de segurança**: se o webhook não chegar, a tela do Pix pergunta o status direto ao
  gateway, para ninguém pagar e ficar preso esperando;
- **limite por IP** nas rotas de criação de pagamento;
- **erros genéricos para o cliente**, detalhe técnico só no log.

### Antes de vender de verdade

- [ ] `SEGREDO_APP` com valor aleatório próprio
- [ ] `FREEPAY_WEBHOOK_SEGREDO` configurado e webhook apontado no painel do gateway
- [ ] Vercel KV criado (senão os pedidos somem entre uma função e outra)
- [ ] entrega real implementada em `api/_entrega.js` (e-mail e/ou convite no Telegram)
- [ ] uma compra de teste ponta a ponta em produção, com valor baixo, e um estorno
- [ ] `GATEWAY_MODO=freepay` (o modo simulado nunca deve ir para produção)

## Estrutura da página

Hero com demonstração do bot → faixa de números → 3 dores → comparativo antes/depois → 6 recursos →
3 passos de instalação → o que está incluído → depoimentos → **preço + garantia de 7 dias** → sobre →
8 perguntas frequentes → CTA final → rodapé. No celular, uma barra fixa com o botão de compra acompanha a rolagem.

## Checklist final

- [ ] `LINK_CHECKOUT` preenchido e testado com uma compra de teste
- [ ] Checkout configurado para redirecionar à `obrigado.html` após a aprovação
- [ ] Dados da empresa trocados nos 4 arquivos (`grep -rn "SUA EMPRESA\|seuusuario\|seudominio" .`)
- [ ] Depoimentos reais no lugar dos exemplos
- [ ] Aberto no celular e no computador
- [ ] `og:url` e `canonical` com o domínio real; link testado no WhatsApp para ver a capa
- [ ] Pixel do Meta / Google Analytics colados no bloco reservado antes do `</head>`
- [ ] Prazo de garantia da página igual ao configurado na plataforma de pagamento
