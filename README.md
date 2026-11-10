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

## Publicar no Render ou Railway

O app precisa de um serviço Node.js com disco persistente. O SQLite e os arquivos locais não devem ficar em armazenamento efêmero nem ser compartilhados entre várias instâncias. Para tráfego maior ou múltiplas instâncias, use PostgreSQL e armazenamento de objetos; esta versão está configurada para SQLite em uma instância.

1. Publique o repositório em um Git privado ou público.
2. Crie um serviço Web Node.js no Render ou Railway conectado ao repositório.
3. Use `npm install` como comando de instalação e `npm start` como comando de início.
4. Configure as variáveis `NODE_ENV=production`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET` e `PUBLIC_URL`. Use uma senha forte e uma chave aleatória longa para `SESSION_SECRET`; não reutilize os valores de exemplo.
5. Monte um volume persistente em `/var/data` e defina `DATA_DIR=/var/data` e `UPLOAD_DIR=/var/data/uploads`. Assim o banco, as sessões, a chave de sessão local e os arquivos enviados permanecem após novos deploys.
6. Defina `PUBLIC_URL` como o endereço HTTPS público do site, sem barra no final. Ele é usado para criar QR Codes de músicas enviadas como arquivo.
7. No primeiro início, confira os registros do serviço para obter a senha inicial aleatória do administrador caso não tenha definido `ADMIN_PASSWORD` antes da primeira inicialização. Depois, entre no painel e altere a senha.

Não coloque `.env`, o banco de dados ou arquivos de mídia no repositório. Em hospedagens que não oferecem disco persistente, os dados locais podem ser perdidos ao reiniciar ou publicar uma nova versão.

## Segurança e funcionamento

- Senhas são armazenadas com bcrypt; os cookies de sessão são HTTP-only, SameSite=Lax e seguros em produção.
- As rotas que alteram dados usam token CSRF; tentativas de login são limitadas por endereço IP.
- A data de liberação é calculada no servidor pelo fuso `America/Sao_Paulo`. Dias já liberados continuam acessíveis e o progresso fica salvo por conta.
- O modo de teste exige uma sessão administrativa e não grava progresso.
- Vídeo e áudio aceitam arquivos dos formatos esperados ou links HTTPS. Os arquivos ficam disponíveis em `/uploads`.
- A preferência `prefers-reduced-motion` reduz as animações da interface.
