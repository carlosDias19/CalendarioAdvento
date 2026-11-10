# Calendário Advento – Contagem Regressiva para o Natal

Aplicação web responsiva para abrir uma surpresa por dia: versículos, desafios, vídeos e músicas. O projeto usa Node.js, Express e SQLite. Participantes podem criar a própria conta na página de cadastro; a administração também pode gerenciar os acessos pelo painel.

## Rodar no computador

1. Instale o Node.js 20 ou mais recente.
2. Abra a pasta do projeto no VS Code.
3. No terminal do VS Code, execute:

   ```powershell
   npm install
   npm start
   ```

4. Abra `http://localhost:3000` no navegador.
5. No primeiro início, o terminal mostra o usuário e uma senha aleatória para a administração. Anote a senha e entre pelo endereço `http://localhost:3000/painel-natal-admin`. Ela não é exibida novamente.
6. Crie sua conta pela opção “Crie sua conta” na tela de entrada. O cadastro inicia a sessão automaticamente.
7. No painel, a administração pode criar, redefinir ou excluir contas e alterar a própria senha.

Para personalizar os dados iniciais do administrador antes de iniciar pela primeira vez, copie `.env.example` para `.env` e preencha `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `SESSION_SECRET` com valores próprios. A senha inicial do administrador só é aplicada quando o banco ainda não tem uma conta administrativa.

Durante o desenvolvimento, use `npm run dev` para reiniciar o servidor automaticamente quando o código mudar.

## Administração

O endereço do painel é `/painel-natal-admin` e não aparece como link na tela dos participantes. No painel é possível editar o tipo, os textos e a mídia dos 25 dias; enviar vídeos MP4 de até 200 MB e músicas MP3 de até 30 MB; gerenciar contas; ativar uma prévia de qualquer dia sem gravar progresso; trocar a senha administrativa; e consultar logins e aberturas de cartas recentes. As primeiras aberturas já salvas no progresso são recuperadas para o histórico; novos logins e cada reabertura passam a ser registrados a partir desta versão. Até 300 eventos aparecem na aba “Atividade”. Logins anteriores não podem ser recuperados. O cadastro público cria somente contas comuns, nunca contas administrativas.

Os dados, sessões e progresso ficam em `data/advento.sqlite`; a chave local que mantém as sessões assinadas fica em `data/session-secret`; arquivos enviados ficam em `uploads/`. Não apague esses diretórios para manter os conteúdos, as contas e o progresso. Eles são ignorados pelo Git.

## Publicar no Render

O arquivo `render.yaml` prepara um serviço Node.js com disco persistente para o SQLite, sessões e arquivos enviados. O serviço com disco persistente exige um plano pago no Render; confira o preço mostrado no painel antes de confirmar. A configuração inicial usa o plano `0.5c-512mb`, um disco de 5 GB e a região Ohio. O Render fornece um endereço HTTPS `onrender.com`, que você pode usar sem comprar domínio.

1. Entre no Render e escolha criar um Blueprint conectado ao repositório `carlosDias19/CalendarioAdvento`.
2. Na configuração solicitada pelo Blueprint, defina `ADMIN_PASSWORD` com uma senha forte e exclusiva. A chave `SESSION_SECRET` é gerada pelo Render.
3. Revise os recursos e custos apresentados pelo Render e confirme a criação. O Blueprint define `npm ci` para instalação, `npm start` para execução e um disco persistente em `/var/data`.
4. Aguarde o primeiro deploy ficar ativo e abra o endereço HTTPS `onrender.com` fornecido pelo Render. O usuário inicial do painel é `admin`; a senha é a que você definiu para `ADMIN_PASSWORD`.
5. Se tiver um domínio próprio, abra as configurações do serviço no Render, adicione o domínio personalizado e configure no provedor de DNS os registros que o Render indicar. O HTTPS é provisionado pelo Render.

O `PUBLIC_URL` não é obrigatório no Render: os QR Codes usam o endereço da requisição quando a variável não está definida. O banco, as sessões e os uploads persistem no disco configurado. Não remova o disco, não rode mais de uma instância deste app com SQLite e nunca envie `.env`, o banco local ou mídia privada ao GitHub.

## Segurança e funcionamento

- Senhas são armazenadas com bcrypt; os cookies de sessão são HTTP-only, SameSite=Lax e seguros em produção.
- As rotas que alteram dados usam token CSRF; tentativas de login são limitadas por endereço IP.
- A data de liberação é calculada no servidor pelo fuso `America/Sao_Paulo`. Dias já liberados continuam acessíveis e o progresso fica salvo por conta.
- O modo de teste exige uma sessão administrativa e não grava progresso.
- Vídeo e áudio aceitam arquivos dos formatos esperados ou links HTTPS. Os arquivos ficam disponíveis em `/uploads`.
- A preferência `prefers-reduced-motion` reduz as animações da interface.
