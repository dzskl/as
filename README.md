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
| `painel.html` | Painel de controle: vendas, contatos, bot e configuração |

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
npm run teste    # 19 testes de ponta a ponta
node testes/webhook-seguranca.test.js   # 10 testes da autenticação do webhook
```

Sem credencial nenhuma o checkout já funciona em **modo simulado**: gera um Pix falso (com
"SIMULADO" escrito no QR, impossível de pagar por engano), mostra um botão "simular pagamento
aprovado" que dispara o mesmo webhook que o gateway dispararia, e leva até a página de obrigado.
Dá para testar o fluxo inteiro antes de ter conta em qualquer gateway.

No cartão em modo simulado: número terminado em `0000` simula recusa, qualquer outro aprova.

### Ligar a FreePay

Documentação oficial: <https://freepaybrasil.readme.io>. Chaves em *Credenciais API* no painel.

**Já confirmado e configurado como padrão:**

| Item | Valor |
|---|---|
| URL base | `https://api.freepaybrasil.com/v1` |
| Criar transação | `POST /payment-transaction/create` |
| Autenticação | `Basic base64("PUBLIC_KEY:SECRET_KEY")` — as **duas** chaves |

Ou seja: preencha `FREEPAY_CHAVE_PUBLICA` e `FREEPAY_CHAVE_SECRETA` e a chamada já sai autenticada.

**Ainda falta confirmar na documentação** (sem isso, mantenha `GATEWAY_MODO=simulado`):

1. os nomes dos campos do corpo do POST (`montarCorpoPix` / `montarCorpoCartao`)
2. o formato da resposta — de onde saem o QR Code e o id da transação
3. `FREEPAY_CAMINHO_CONSULTA` — endpoint de consulta (enquanto vazio, o status vem só pelo webhook)
4. `FREEPAY_WEBHOOK_HEADER` e o algoritmo da assinatura
5. se existe SDK JS para tokenizar cartão no navegador
Configure a URL do webhook no painel da FreePay como `https://seudominio.com.br/api/webhook`.

**Cartão — três modos**, escolhidos por variável de ambiente e informados ao navegador pelo
`GET /api/produto`:

| Modo | Como ligar | Onde passa o número do cartão |
|---|---|---|
| `sdk` *(recomendado)* | `FREEPAY_TOKENIZACAO_URL` preenchida | Navegador → gateway. Nunca no seu servidor. |
| `direto` | `CARTAO_DIRETO=1` | Navegador → **seu servidor** → gateway. |
| `desligado` *(padrão)* | nenhuma das duas | A aba de cartão nem aparece; só Pix. |

⚠️ O modo `direto` coloca este site no escopo pesado do **PCI-DSS (SAQ-D)**: você assume a
responsabilidade de proteger dado de cartão. O código nunca grava nem registra o número — o log
de diagnóstico mascara para `****1234` e o CVV para `***` — mas o dado transita pelo servidor.
Prefira o modo `sdk`: peça à FreePay o endpoint de tokenização no navegador.

### Armazenamento dos pedidos

Funções serverless não guardam estado: sem banco, o webhook não encontra o pedido criado pelo
checkout. Em produção, crie um Redis na Vercel (*Storage → KV*) e as variáveis `KV_REST_API_URL`
e `KV_REST_API_TOKEN` aparecem sozinhas no projeto. Sem elas o sistema usa memória — bom para
desenvolvimento, inaceitável em produção.

### O que já está protegido

- **preço vem do servidor** (`api/_config.js`): mandar `valorCentavos: 1` no corpo não muda nada;
- **webhook falha fechada**: sem assinatura nem token configurados, nenhum evento é aceito —
  senão qualquer pessoa com a URL liberaria acesso de graça. Aceita HMAC-SHA256 (preferido) ou,
  para gateways que não assinam nada, um token secreto na query da URL do webhook;
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

## Bot do Telegram + painel

O bot vende dentro do Telegram e o painel no site controla tudo — sem tocar em código.

```
api/telegram.js        webhook do bot: menu, catálogo, conversa de venda, Pix
api/_telegram.js       cliente da API do Telegram
api/_leads.js          contatos do bot e estado da conversa
api/_configuracao.js   textos, produtos e preços editáveis pelo painel
api/painel-login.js    sessão do administrador (cookie assinado)
api/painel-dados.js    métricas, pedidos, contatos e alertas do sistema
api/painel-config.js   leitura e gravação da configuração
api/painel-bot.js      conectar/desconectar o bot e disparo em massa
api/_kv.js             armazenamento (Vercel KV/Upstash, memória em dev)
painel.html            o painel
testes/bot-painel.test.js   21 testes de ponta a ponta
```

### Como o bot funciona

Por **webhook**, não por polling: em ambiente serverless não existe processo vivo esperando
mensagem. O Telegram chama `/api/telegram` a cada evento, a função responde e morre. O que
precisa ser lembrado entre uma mensagem e outra fica no KV.

Fluxo de venda em quatro toques: catálogo → escolhe o produto → e-mail → CPF → telefone
(botão de contato, sem digitar) → código Pix na tela. Quem já comprou não repete os dados.
Quando o pagamento é confirmado, o webhook do gateway avisa o comprador **no próprio chat**.

### Ligar o bot

1. Fale com o [@BotFather](https://t.me/BotFather) no Telegram, mande `/newbot` e copie o token
2. Na Vercel, crie:
   - `TELEGRAM_BOT_TOKEN` — o token do BotFather
   - `TELEGRAM_WEBHOOK_SEGREDO` — valor aleatório seu
   - `PAINEL_SENHA` — a senha do painel
   - `URL_SITE` — o endereço público do site (o Telegram exige HTTPS)
3. Redeploy
4. Abra `/painel.html`, entre com a senha, vá na aba **Bot** e clique em **Conectar**

O botão registra o webhook e os comandos do menu. A partir daí o bot responde.

### O que dá para fazer pelo painel

| Aba | O que controla |
|---|---|
| **Visão geral** | Receita de hoje / 7 / 30 dias, gráfico diário, conversão e alertas de configuração |
| **Pedidos** | Os 40 mais recentes, com origem (site ou bot), método e status |
| **Contatos** | Quem falou com o bot, e o disparo em massa (opcionalmente só para compradores) |
| **Bot** | Status do webhook, conectar, desconectar, link para divulgar |
| **Configuração** | Dados da loja, produtos e preços, e todas as mensagens do bot |

Preço editado no painel vale para o site e para o bot ao mesmo tempo — os dois leem da mesma
fonte, e o valor continua sendo decidido no servidor.

### Segurança do painel e do bot

- Painel protegido por senha (`PAINEL_SENHA`) com cookie assinado por HMAC — sem banco de
  sessões, e um cookie forjado não passa. Login limitado a 5 tentativas por minuto por IP.
- O webhook do bot só aceita chamadas com o `secret_token` que registramos no Telegram.
- O disparo em massa respeita o limite do Telegram (lotes com pausa): passar do limite faz o
  bot ser silenciado, o que é pior que um disparo lento.
- Preço vindo do painel é validado (R$ 1 a R$ 50.000): um erro de digitação não deixa a loja
  vendendo de graça.

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
