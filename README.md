# Calendário Advento – Contagem Regressiva para o Natal

Aplicação web responsiva para abrir uma surpresa por dia: versículos, desafios, vídeos e músicas. O projeto usa Node.js, Express e Supabase (PostgreSQL e Storage). Participantes podem criar a própria conta na página de cadastro; a administração também pode gerenciar os acessos pelo painel.

## Rodar no computador

1. Instale o Node.js 22 LTS.
2. Abra a pasta do projeto no VS Code.
3. Crie um projeto gratuito no Supabase e obtenha a URI do **Session Pooler**, a URL do projeto e a chave secreta de servidor. Não use a chave `publishable` no servidor.
4. Copie `.env.example` para `.env` e preencha `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET` e `ADMIN_PASSWORD`. A URL `SUPABASE_URL` já aponta para o projeto configurado.
5. No terminal do VS Code, execute:

   ```powershell
   npm ci
   npm start
   ```

6. Abra `http://localhost:3000` no navegador.
7. Entre no painel por `http://localhost:3000/painel-natal-admin` usando `ADMIN_USERNAME` e `ADMIN_PASSWORD`.
8. Crie sua conta pela opção “Crie sua conta” na tela de entrada. O cadastro inicia a sessão automaticamente.

Na primeira inicialização, o servidor cria o schema privado, as tabelas, os 25 dias iniciais, o administrador e o bucket público de mídia. A senha administrativa só é usada quando ainda não existe uma conta administrativa.

Durante o desenvolvimento, use `npm run dev` para reiniciar o servidor automaticamente quando o código mudar.

## Administração

O endereço do painel é `/painel-natal-admin` e não aparece como link na tela dos participantes. No painel é possível editar o tipo, os textos e a mídia dos 25 dias; enviar vídeos MP4 de até 50 MB e músicas MP3 de até 30 MB; gerenciar contas; ativar uma prévia de qualquer dia sem gravar progresso; trocar a senha administrativa; e consultar logins e aberturas de cartas recentes. Até 300 eventos aparecem na aba “Atividade”. O cadastro público cria somente contas comuns, nunca contas administrativas.

Contas, conteúdo, progresso, atividade e sessões ficam no PostgreSQL do Supabase. Arquivos enviados ficam no bucket `calendario-advento` do Supabase Storage. Os uploads aceitam MP4 de até 50 MB e MP3 de até 30 MB; links HTTPS continuam disponíveis para mídias maiores.

## Publicar no Render

O arquivo `render.yaml` configura um serviço Web gratuito no Render, sem disco persistente. O banco, as sessões e os arquivos ficam no Supabase, então não dependem do disco temporário do Render. No plano gratuito, o serviço pode dormir quando fica sem tráfego e levar alguns segundos para acordar; Supabase e Render também aplicam limites de uso que podem mudar.

1. No Supabase, abra **Connect** e copie a URI do **Session Pooler**. O host direto `db.<projeto>.supabase.co` pode não aceitar conexões IPv4 do Render gratuito. Substitua `[YOUR-PASSWORD]` pela senha do banco.
2. Em **Project Settings → API Keys**, copie a URL do projeto e a chave secreta de servidor (`service_role` ou `sb_secret_`). Nunca use nem publique essa chave no navegador ou no Git.
3. No Render, crie um Blueprint conectado ao repositório e selecione o `render.yaml` deste projeto.
4. Quando o Render solicitar os valores secretos, informe a URI em `DATABASE_URL`, a chave secreta em `SUPABASE_SERVICE_ROLE_KEY` e uma senha forte em `ADMIN_PASSWORD`. `SESSION_SECRET` é gerada pelo Blueprint; a URL do Supabase já está preenchida.
5. Aguarde o deploy e abra o endereço HTTPS `onrender.com`. Entre no painel em `/painel-natal-admin` com usuário `admin` e a senha definida no passo anterior.

As tabelas ficam no schema privado `app_private`, fora das APIs públicas do Supabase. O servidor usa a chave secreta somente no backend. A chave `publishable` fornecida pelo Supabase não é necessária neste app. Os dados que existam em uma antiga cópia SQLite local não são importados automaticamente.

## Segurança e funcionamento

- Senhas são armazenadas com bcrypt; os cookies de sessão são HTTP-only, SameSite=Lax e seguros em produção.
- As rotas que alteram dados usam token CSRF; tentativas de login são limitadas por endereço IP.
- A data de liberação é calculada no servidor pelo fuso `America/Sao_Paulo`. Dias já liberados continuam acessíveis e o progresso fica salvo por conta.
- O modo de teste exige uma sessão administrativa e não grava progresso.
- Vídeo e áudio aceitam arquivos dos formatos esperados ou links HTTPS. Os arquivos enviados ficam em um bucket público do Supabase Storage, para que o calendário possa reproduzi-los.
- A preferência `prefers-reduced-motion` reduz as animações da interface.
