# WhatsApp Scheduler

Sistema self-hosted para **agendar e enviar mensagens de texto, imagem e áudio para grupos do WhatsApp**, construído para rodar em um VPS pequeno com um único processo Node.js, SQLite e armazenamento local.

> ⚠️ **Integração não oficial.** O projeto usa [Baileys](https://github.com/WhiskeySockets/Baileys), que se conecta ao WhatsApp Web por WebSocket. Não há vínculo com o WhatsApp/Meta. Mudanças de protocolo, instabilidades e restrições de conta podem acontecer. Use um número dedicado e mantenha o volume baixo (o caso de uso previsto é ~3 mensagens/dia).

## Recursos

- Conexão com WhatsApp via QR Code, com sessão persistida em disco.
- Listagem e cache de grupos.
- CRUD de mensagens `TEXT`, `IMAGE` e `AUDIO` (arquivos em volume persistente).
- Agendamentos por dias da semana + horário, com datas opcionais de início/fim.
- Scheduler orientado a banco: SQLite é a fonte da verdade e o `dedupe_key` único impede envio duplicado após restart.
- Histórico completo de execuções (agendadas e manuais) com status, tentativas, ID da mensagem no WhatsApp e confirmação de entrega quando disponível.
- Envio manual sem alterar agendamentos.
- Frontend responsivo (React + Vite + Tailwind) servido pelo próprio Fastify.
- Basic Auth, rate limit, validação de uploads e isolamento de caminhos internos.
- Docker Compose com volumes persistentes e healthcheck.

## Stack

| Camada    | Tecnologia                                                         |
| --------- | ------------------------------------------------------------------ |
| Runtime   | Node.js 24 (LTS), TypeScript strict, ESM                           |
| API       | Fastify 5, zod 4 (`fastify-type-provider-zod`), Swagger/OpenAPI    |
| Banco     | SQLite via `better-sqlite3` + migrations SQL                       |
| Scheduler | Loop próprio com `luxon` (timezone/DST)                            |
| WhatsApp  | `@whiskeysockets/baileys` **7.0.0-rc14** (pin exato)               |
| Frontend  | React 19, Vite 8, Tailwind CSS 4, TanStack Query 5, React Router 7 |
| Deploy    | Docker multi-stage, um container, 3 volumes                        |

### Sobre a versão do Baileys

`7.0.0-rc14` é a versão publicada na tag `latest` do pacote e já suporta o sistema de LID do WhatsApp. Ela é fixada **sem `^`**; o adapter em `src/modules/whatsapp/baileys/` isola a biblioteca do restante da aplicação. Antes de atualizar:

1. Revise o [guia de migração](https://baileys.wiki/docs/migration) e as releases do projeto.
2. Atualize o pin no `package.json` e rode `npm install`.
3. Teste conexão, QR, listagem de grupos e envio dos três tipos de mensagem em um número de teste.

A alternativa estável/legada é `6.7.24`, mas ela puxa `libsignal` direto do GitHub e não inclui as mudanças de LID do 7.x — por isso não é o padrão.

A sessão é gravada com `useMultiFileAuthState` no volume `auth` (arquivos privados). Não edite/remova arquivos manualmente: sem eles será necessário escanear um novo QR Code. O app roda em instância única; nunca compartilhe o mesmo `AUTH_PATH` entre processos.

## Como rodar

### Requisitos

- Node.js >= 22 (recomendado 24)
- npm >= 10

### Desenvolvimento

```bash
npm install
cp .env.example .env        # Windows: Copy-Item .env.example .env
# edite BASIC_AUTH_USER e BASIC_AUTH_PASS
npm run dev
```

- API: `http://localhost:3000` (docs em `/docs`)
- Frontend: `http://localhost:5173` (proxy para a API injeta o Basic Auth a partir do `.env` da raiz)
- Health público: `http://localhost:3000/api/health`

### Produção (build local)

```bash
npm run build
npm start
```

O Fastify serve o build do Vite (`WEB_DIST_PATH`, padrão `./web/dist`). Tudo protegido por Basic Auth, exceto `/api/health`.

## Docker

```bash
cp .env.example .env
# ajuste as credenciais
docker compose up -d --build
docker compose logs -f app
```

Acesse `http://IP-DO-VPS:3000`, faça login e escaneie o QR em **Configurações**.

Volumes criados:

| Volume  | Caminho no container | Conteúdo                      |
| ------- | -------------------- | ----------------------------- |
| `db`    | `/app/storage/db`    | `database.sqlite`             |
| `media` | `/app/storage/media` | imagens e áudios enviados     |
| `auth`  | `/app/storage/auth`  | credenciais da sessão Baileys |

O container reinicia automaticamente (`restart: unless-stopped`), roda como usuário não-root e possui healthcheck em `/api/health`. A imagem funciona em `amd64` e `arm64` (prebuilds do `better-sqlite3`); 256–512 MB de RAM são suficientes para o volume previsto.

### HTTPS (obrigatório na internet)

Basic Auth transmite credenciais em Base64 — sem TLS isso é equivalente a senha em texto puro. O compose inclui um perfil opcional com Caddy:

```bash
# aponte o DNS do domínio para o VPS
echo 'DOMAIN=scheduler.seudominio.com' >> .env
docker compose --profile tls up -d --build
```

O `Caddyfile` faz proxy para `app:3000` e emite o certificado automaticamente. Se você já usa outro proxy (Nginx/Traefik), não habilite o perfil e encaminhe para a porta 3000.

## Variáveis de ambiente

| Variável                              | Padrão                         | Descrição                                          |
| ------------------------------------- | ------------------------------ | -------------------------------------------------- |
| `NODE_ENV`                            | `development`                  | `development`, `test` ou `production`              |
| `HOST` / `PORT`                       | `0.0.0.0` / `3000`             | Bind da API                                        |
| `PUBLIC_URL`                          | —                              | URL usada no Swagger                               |
| `LOG_LEVEL`                           | `info`                         | Nível do Pino                                      |
| `WHATSAPP_LOG_LEVEL`                  | `warn`                         | Nível dos logs do Baileys                          |
| `TIMEZONE`                            | `America/Bahia`                | Timezone IANA padrão dos agendamentos              |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | — (obrigatórios)               | Credenciais de acesso                              |
| `RATE_LIMIT_MAX`                      | `300`                          | Requisições por minuto por IP                      |
| `DATABASE_PATH`                       | `./storage/db/database.sqlite` | Arquivo SQLite                                     |
| `MEDIA_PATH`                          | `./storage/media`              | Diretório de mídia                                 |
| `AUTH_PATH`                           | `./storage/auth`               | Diretório da sessão Baileys                        |
| `MAX_UPLOAD_MB`                       | `16`                           | Limite de upload                                   |
| `SCHEDULER_TICK_SECONDS`              | `30`                           | Intervalo do loop                                  |
| `SCHEDULER_CATCHUP_MINUTES`           | `60`                           | Janela máxima de recuperação após downtime         |
| `SCHEDULER_MAX_ATTEMPTS`              | `3`                            | Tentativas para falhas seguras (ex.: desconectado) |
| `WEB_DIST_PATH`                       | `./web/dist`                   | Build do frontend                                  |

O processo **não sobe** se as variáveis forem inválidas ou se usuário/senha estiverem ausentes. A senha precisa ter pelo menos 8 caracteres e não pode ser o valor de exemplo.

## Arquitetura

```
src/
├─ app.ts                    # Fastify, auth, rate limit, Swagger, SPA
├─ server.ts                 # listen + graceful shutdown
├─ context.ts                # composição (repos, services, provider, scheduler)
├─ config/env.ts             # validação do ambiente (zod)
├─ db/
│  ├─ index.ts               # conexão SQLite (WAL, FK, busy_timeout)
│  └─ migrate.ts             # runner + migrations versionadas
├─ scheduler/
│  ├─ occurrences.ts         # cálculo puro de slots (timezone/DST)
│  ├─ scheduler.ts           # tick, catch-up, dedupe, drain
│  ├─ delivery.ts            # claim → envio → status
│  └─ retry-policy.ts
├─ modules/
│  ├─ messages/              # rotas, service, repository, tipos
│  ├─ schedules/
│  ├─ executions/
│  ├─ whatsapp/
│  │  ├─ whatsapp.port.ts    # interface do provider
│  │  └─ baileys/            # única parte que importa Baileys
│  ├─ dashboard/
│  └─ system/
├─ plugins/                  # auth, error handler, SPA
└─ routes/                   # schemas zod + agregação /api

web/                         # workspace Vite (React)
test/                        # unitários + integração com SQLite real
```

- Nenhum módulo de negócio importa Baileys; testes usam um `FakeProvider`.
- `createApp`/`createContext` recebem `clock` e `provider` injetados — o scheduler é testado sem timers reais.
- A composição é explícita (factories), sem container de DI.

## Como o scheduler funciona

A cada `SCHEDULER_TICK_SECONDS` (padrão 30s):

1. Lê `scheduler.last_scan_at` (tabela `settings`) e calcula a janela `[max(last_scan, now − catchup), now]`.
2. Para cada schedule ativo (e mensagem ativa), calcula as ocorrências na timezone do schedule.
3. Em **transação**, insere execuções `PENDING` com `dedupe_key = scheduled:<schedule_id>:<slot_utc>` (`INSERT OR IGNORE`) e avança `last_scan_at`.
4. O dispatcher pega uma execução devida por vez e faz claim atômico `PENDING → PROCESSING` (`UPDATE ... WHERE status='PENDING'`).
5. Envia via provider e grava `SENT` + `whatsapp_message_id`, ou `FAILED`.

Garantias:

- **Sem duplicidade:** o índice `UNIQUE(dedupe_key)` é a última linha de defesa, mesmo após crash/restart.
- **Restart:** execuções que ficaram em `PROCESSING` são marcadas `FAILED` no boot (“delivery outcome unknown”) e **não** são reenviadas automaticamente.
- **Downtime:** a janela de catch-up (60 min por padrão) recupera execuções perdidas recentemente; desligue com `SCHEDULER_CATCHUP_MINUTES=0`.
- **Primeiro boot:** não envia ocorrências anteriores à instalação.
- **Timezone/DST:** horário inexistente (spring forward) é ignorado; horário ambíguo (fall back) executa uma única vez.
- **Retry:** apenas falhas comprovadamente anteriores ao envio (ex.: WhatsApp desconectado) são tentadas de novo (1/5/15 min). Timeout ou erro após `sendMessage` é tratado como **entrega incerta** e não é repetido, evitando mensagem duplicada.

`SENT` significa que a API do WhatsApp aceitou a mensagem; receipts de entrega/leitura são gravados quando disponíveis (`delivery_status`), mas em grupos o WhatsApp nem sempre os envia.

## API

Tudo em `/api` (exceto o health público). Autenticação: **HTTP Basic Auth**.

| Método         | Rota                           | Descrição                                                               |
| -------------- | ------------------------------ | ----------------------------------------------------------------------- |
| GET            | `/api/health`                  | Health público (Docker)                                                 |
| GET            | `/api/dashboard`               | Contadores, próximas e últimas execuções                                |
| GET/POST       | `/api/messages`                | Lista / cria mensagem                                                   |
| GET/PUT/DELETE | `/api/messages/:id`            | Detalhe / edita / remove (`?force=true`)                                |
| GET            | `/api/messages/:id/media`      | Visualiza/baixa a mídia                                                 |
| POST           | `/api/messages/:id/send`       | Envio manual (`{ "group_id": "..." }` opcional)                         |
| GET/POST       | `/api/schedules`               | Lista / cria agendamento                                                |
| GET/PUT/DELETE | `/api/schedules/:id`           | Detalhe / edita / remove                                                |
| PATCH          | `/api/schedules/:id/toggle`    | Ativa/desativa                                                          |
| GET            | `/api/executions`              | Histórico (`status`, `execution_type`, `message_id`, `limit`, `offset`) |
| GET            | `/api/executions/:id`          | Detalhe da execução                                                     |
| GET            | `/api/whatsapp/status`         | Estado da conexão                                                       |
| GET            | `/api/whatsapp/qr`             | QR atual (data URL)                                                     |
| GET            | `/api/whatsapp/groups`         | Grupos em cache (`?refresh=true`)                                       |
| POST           | `/api/whatsapp/groups/refresh` | Sincroniza grupos                                                       |
| POST           | `/api/whatsapp/reconnect`      | Reconecta / gera novo QR após logout                                    |
| GET            | `/api/system/info`             | Versão, timezone, uptime, banco                                         |
| GET            | `/docs`                        | Swagger UI                                                              |

Semântica de criação de mensagem:

- `TEXT`: JSON (`Content-Type: application/json`) com `title`, `content`, `message_type`, `group_id`, `is_active`.
- `IMAGE`/`AUDIO`: `multipart/form-data` com os mesmos campos e o arquivo no campo `file` (obrigatório quando não existe mídia).
- `days_of_week` usa ISO: `1` = segunda … `7` = domingo; `execution_time` é `HH:mm` no timezone do agendamento.
- O envio manual (`POST /send`) responde `200` com a execução registrada; confira `status` (`SENT`/`FAILED`) e `error_message` no corpo. Ele nunca altera os schedules.

Exemplo:

```bash
curl -u admin:senha -F 'title=Lembrete' -F 'content=Bom dia!' \
  -F 'message_type=TEXT' -F 'group_id=120363000000000000@g.us' \
  -F 'is_active=true' http://localhost:3000/api/messages
```

Erros usam o envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [] } }
```

### Regras de mídia

- Validação por **magic bytes** (`file-type`), não pelo nome do arquivo.
- Imagens: JPEG, PNG, WebP. Áudio: MP3, OGG/Opus, M4A/AAC.
- Limite de `MAX_UPLOAD_MB` (16 MB) por arquivo.
- Nome gerado em UUID; nome original é apenas exibição. Caminhos internos nunca são retornados.
- Sem transcodificação: OGG/Opus é o formato de áudio mais compatível. MP3 é enviado com `mimetype: audio/mp4` (recomendação do Baileys). Áudios que não tocam em todos os dispositivos são uma limitação conhecida.
- Excluir mensagem com agendamento ativo retorna `409`; use `?force=true` para remover a mensagem e seus agendamentos — o histórico é preservado com o título congelado.

## Segurança

- Basic Auth em **todas** as rotas, incluindo o frontend e o Swagger; somente `/api/health` é público.
- Comparação de credenciais em tempo constante (SHA-256 + `timingSafeEqual`).
- Mutações cross-site são bloqueadas via `Sec-Fetch-Site` (proteção CSRF) e o processo usa `umask 077` para arquivos privados.
- Rate limit por IP e validação zod em todas as entradas.
- `AUTH_PATH` e o SQLite ficam fora de qualquer diretório servido; o volume de autenticação nunca é exposto pela API.
- Helmet com CSP; o Swagger UI recebe as exceções necessárias.
- **Use TLS.** Sem HTTPS, o Basic Auth não protege a senha.

## Testes

```bash
npm test
npm run typecheck
npm run lint
```

Cobertura atual:

- Cálculo de ocorrências: dias, datas limite, timezone, DST (gap e overlap), próxima execução.
- Scheduler: envio único, dedupe no banco, catch-up de restart, retry após desconexão, sem retry em falha ambígua, recuperação de `PROCESSING`.
- API: auth, health público, CRUD de mensagens, upload e streaming de mídia, rejeição de tipo inválido, conflito de exclusão, histórico preservado, validação de schedules, cache de grupos.
- Envio manual não altera schedules.

Os testes usam SQLite real em diretório temporário e um provider fake — nenhuma conexão com o WhatsApp é feita.

## Backup e restauração

Backup dos três volumes (ou dos diretórios correspondentes):

```bash
docker compose stop app
docker run --rm -v whatsapp-scheduler_db:/data -v "$PWD/backup":/backup alpine \
  tar czf /backup/db.tgz -C /data .
docker run --rm -v whatsapp-scheduler_media:/data -v "$PWD/backup":/backup alpine \
  tar czf /backup/media.tgz -C /data .
docker run --rm -v whatsapp-scheduler_auth:/data -v "$PWD/backup":/backup alpine \
  tar czf /backup/auth.tgz -C /data .
docker compose start app
```

- **auth** perdido = novo QR Code; **db** perdido = mensagens/agendamentos/histórico; **media** perdido = mensagens de mídia falham com “Media file is missing”.
- Nunca rode duas instâncias apontando para o mesmo `AUTH_PATH` ou o mesmo arquivo SQLite: há apenas uma sessão WhatsApp e um dispatcher.
- O SQLite usa WAL; pare o container antes de copiar o arquivo diretamente.

## Limitações e troubleshooting

| Sintoma                              | Causa provável / solução                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| QR não aparece                       | Estado `connecting` ou erro de rede no VPS; veja logs e use **Reconectar**                  |
| `logged_out`                         | Sessão removida pelo celular; clique em **Reconectar** para limpar a sessão e gerar novo QR |
| Erro ao listar grupos                | Conta não conectada ou sem grupos; verifique `/api/whatsapp/status`                         |
| Envio falha com “not connected”      | Execução agendada fica `PENDING` e tenta de novo; manual retorna falha                      |
| Áudio não toca em todos os aparelhos | Formato não ideal; prefira OGG/Opus                                                         |
| Mensagem duplicada                   | Não deve ocorrer por design; verifique se há duas instâncias rodando                        |
| Horário errado                       | Confira `TIMEZONE`, o relógio/NTP do VPS e o timezone do agendamento                        |
| `409` ao excluir mensagem            | Existem schedules ativos; desative-os ou use `force=true`                                   |

## Licença

Uso pessoal/self-hosted. A biblioteca Baileys é MIT, mas o uso do WhatsApp está sujeito aos Termos de Serviço da Meta. O autor não se responsabiliza por restrições de conta ou uso indevido.
