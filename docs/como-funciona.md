# Como funciona o sistema

Visão geral técnica do **WhatsApp Scheduler** — o que acontece desde a inicialização até a entrega de uma mensagem no grupo.

---

## 1. Visão geral

Sistema self-hosted para **agendar e enviar mensagens (texto, imagem e áudio) para grupos do WhatsApp**.

| Camada    | Tecnologia                                                  |
| --------- | ----------------------------------------------------------- |
| Runtime   | Node.js >= 22 (recomendado 24), TypeScript strict, ESM       |
| API       | Fastify 5 + zod (validação) + Swagger/OpenAPI               |
| Banco     | SQLite (`better-sqlite3`) + migrations SQL versionadas      |
| Scheduler | Loop próprio com `luxon` (timezone/DST)                     |
| WhatsApp  | `@whiskeysockets/baileys` 7.0.0-rc14 (integração não oficial)|
| Frontend  | React 19 + Vite + Tailwind (servido pelo próprio Fastify)    |

> ⚠️ A integração com o WhatsApp é **não oficial** (Baileys). Use um número dedicado e mantenha o volume baixo.

### Princípios de projeto

- **SQLite é a fonte da verdade.** Nada de estado em memória: o scheduler, as filas de envio e o histórico vivem no banco.
- **Um único processo Node.js.** API, frontend, scheduler e conexão WhatsApp rodam juntos.
- **Isolamento do Baileys.** Apenas `src/modules/whatsapp/baileys/` importa a biblioteca; o resto do sistema usa a interface `WhatsAppProvider`, o que permite testar tudo com um provider fake.
- **Composição explícita.** `createApp()` e `createContext()` recebem `clock` e `provider` injetados — sem container de DI.

---

## 2. Fluxo de inicialização

```
src/server.ts
  │
  ├─ 1. loadEnv()                     # lê .env (dotenv) e valida com zod
  │      └─ falha → imprime o erro e process.exit(1)   ← API NÃO sobe
  │
  ├─ 2. createApp(env)                # src/app.ts
  │      ├─ Fastify + logger (pino / pino-pretty em dev)
  │      ├─ plugins: helmet, multipart, swagger, error-handler
  │      ├─ createContext(env)        # src/context.ts
  │      │     ├─ openDatabase()      # SQLite em WAL, FK on, busy_timeout 5s
  │      │     ├─ migrate()           # aplica migrations pendentes
  │      │     ├─ cria repositories, services, provider Baileys
  │      │     ├─ recupera execuções presas em PROCESSING → FAILED
  │      │     └─ cria o scheduler
  │      └─ rotas: health, /api/*, /docs (Swagger), SPA
  │
  ├─ 3. app.listen()                  # HOST:PORT (padrão 0.0.0.0:3000)
  │
  └─ 4. ctx.start()
        ├─ scheduler.start()          # inicia o loop de ticks
        └─ whatsapp.connect()         # abre sessão Baileys (QR ou sessão salva)
```

Se **qualquer** variável de ambiente for inválida, o processo aborta antes de abrir a porta. As regras de validação estão em `src/config/env.ts`.

---

## 3. Modelo de dados

Tabelas criadas em `src/db/migrate.ts`:

| Tabela              | Papel                                                          |
| ------------------- | -------------------------------------------------------------- |
| `messages`          | Mensagens cadastradas (texto/imagem/áudio) — o "conteúdo"       |
| `schedules`         | Regras de recorrência ligadas a uma mensagem (dias + horário)  |
| `execution_history` | Cada envio (agendado ou manual) com status e tentativas        |
| `whatsapp_groups`   | Cache local dos grupos sincronizados do WhatsApp               |
| `settings`          | Pares chave/valor (ex.: `scheduler.last_scan_at`)              |
| `schema_migrations` | Controle das migrations aplicadas                              |

### Conceito central: mensagem ≠ agendamento

- **Mensagem** (`messages`) é o conteúdo: título, texto/mídia, tipo (`TEXT`/`IMAGE`/`AUDIO`) e grupo de destino.
- **Agendamento** (`schedules`) é a regra de *quando* enviar: dias da semana, horário, timezone, vigência (início/fim) e se está ativo.

Uma mensagem pode ter **vários** agendamentos. Excluir uma mensagem com agendamentos ativos retorna `409` (é preciso `?force=true`).

### Status de uma execução

```
PENDING ──claim──► PROCESSING ──envio ok──► SENT
                        │
                        └────falha──────► FAILED
```

- `execution_type`: `SCHEDULED` (pelo loop) ou `MANUAL` (botão "Enviar agora").
- `delivery_status`: registro de entrega/leitura quando o WhatsApp fornece (em grupos nem sempre chega).

---

## 4. Como o scheduler funciona

Loop próprio, sem dependência de cron externo. A cada `SCHEDULER_TICK_SECONDS` (padrão **30 s**):

1. **Calcula a janela.** Lê `scheduler.last_scan_at` (tabela `settings`) e usa
   `[max(último_scan, agora − catchup), agora]`. O catch-up padrão é `SCHEDULER_CATCHUP_MINUTES=60`.
2. **Gera os slots.** Para cada agendamento ativo com mensagem ativa, calcula as ocorrências na *timezone do agendamento* (cálculo puro em `scheduler/occurrences.ts`, ciente de DST).
3. **Insere em transação.** Cria execuções `PENDING` com
   `dedupe_key = scheduled:<schedule_id>:<slot_utc>` usando `INSERT OR IGNORE`, e avança `last_scan_at`.
4. **Despacha.** Pega uma execução vencedora por vez e faz **claim atômico** `PENDING → PROCESSING` (`UPDATE ... WHERE status='PENDING'`).
5. **Envia.** Grava `SENT` + `whatsapp_message_id`, ou `FAILED` com `error_message`.

### Garantias

| Garantia            | Como é obtida                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **Sem duplicidade** | Índice `UNIQUE(dedupe_key)` — última linha de defesa, mesmo após crash/restart                       |
| **Restart seguro**  | Execuções presas em `PROCESSING` viram `FAILED` no boot ("delivery outcome unknown") e **não** reenviam |
| **Downtime**        | Janela de catch-up recupera ocorrências recentes; desligue com `SCHEDULER_CATCHUP_MINUTES=0`         |
| **Primeiro boot**   | Não envia nada anterior à instalação (o marcador `last_scan_at` é criado "agora")                   |
| **Timezone/DST**    | Horário inexistente (spring forward) é ignorado; horário ambíguo (fall back) executa **uma única vez**|

### Política de retry

Definida em `scheduler/retry-policy.ts` — delais de **1 min, 5 min, 15 min**, limitado a `SCHEDULER_MAX_ATTEMPTS` (padrão 3).

- **Repete** apenas falhas comprovadamente anteriores ao envio (ex.: WhatsApp desconectado).
- **Não repete** timeout ou erro *após* `sendMessage` — isso é **entrega incerta** e repetirria arriscaria mensagem duplicada.

> `SENT` significa que a API do WhatsApp **aceitou** a mensagem. Confirmação de entrega/leitura (`delivery_status`) é best-effort.

---

## 5. Camada de acesso (auth, rotas, frontend)

- **HTTP Basic Auth** em **todas** as rotas, incluindo o frontend e o Swagger; só `/api/health` é público.
- Comparação em tempo constante (`SHA-256` + `timingSafeEqual` — `src/plugins/auth.ts`).
- Rate limit por IP (`RATE_LIMIT_MAX`, padrão 300/min) e validação zod em toda entrada.
- Mutações cross-site bloqueadas via cabeçalho `Sec-Fetch-Site` (mitigação CSRF).
- O processo usa `umask 077`; `AUTH_PATH` e o SQLite ficam fora de qualquer diretório servido.

### Comunicação frontend ↔ API

- **Desenvolvimento:** Vite em `:5173` faz proxy de `/api` e `/docs` para `:3000`, injetando o Basic Auth lido do `.env` da raiz (`web/vite.config.ts`).
- **Produção:** o Fastify serve o build do Vite (`WEB_DIST_PATH`) na mesma porta — sem proxy.

---

## 6. Estrutura do código

```
src/
├─ server.ts                 # env → app → listen → shutdown gracioso
├─ app.ts                    # Fastify, plugins, auth, rotas, SPA
├─ context.ts                # composição: repos → services → scheduler
├─ config/env.ts             # validação do ambiente (zod)
├─ db/                       # conexão SQLite + migrations
├─ scheduler/                # occurrences, scheduler, delivery, retry-policy
├─ modules/                  # messages, schedules, executions, whatsapp, dashboard, system
│  └─ whatsapp/baileys/       # ÚNICA parte que importa Baileys
├─ plugins/                  # auth, error-handler, spa
└─ routes/                   # schemas zod + agregação das rotas /api

web/                         # workspace do frontend (React + Vite)
test/                        # testes com SQLite real em temp dir + provider fake
storage/                     # criado em runtime: db/, media/, auth/ (gitignored)
```

---

## 7. Onde os dados moram

| Caminho (padrão)             | Conteúdo                                       |
| ---------------------------- | ---------------------------------------------- |
| `storage/db/database.sqlite` | Banco de dados (WAL: inclui `-wal` e `-shm`)    |
| `storage/media/`             | Imagens e áudios enviados (nome = UUID)         |
| `storage/auth/`              | Sessão do WhatsApp (Baileys `useMultiFileAuthState`) |

> ⚠️ **Nunca edite/apague `storage/auth/`** — sem esses arquivos será preciso escanear um novo QR Code. E **nunca rode duas instâncias** apontando para o mesmo `AUTH_PATH` ou mesmo SQLite.

---

## 8. Ciclo de vida completo de um agendamento

```
 usuário cria MENsAGEM (conteúdo + grupo)
        │
        usuário cria AGENDAMENTO (dias + hora + timezone + vigência)
        │
        scheduler, a cada 30s, calcula slots na janela
        │
        INSERT PENDING (dedupe_key único) ──────► execution_history
        │
        claim atômico PENDING → PROCESSING
        │
        Baileys envia para o grupo
        │
        ├─ aceito ──► SENT (whatsapp_message_id gravado)
        └─ falha  ──► FAILED (retry se a falha foi anterior ao envio)
        │
        histórico visível no Dashboard e em GET /api/executions
```

---

## Para continuar

- **[Como usar o sistema](./como-usar.md)** — guia prático da interface.
- **[Configuração: usuário e senha](./configuracao-credenciais.md)** — onde fica o `.env` e como trocar as credenciais.
- **`README.md`** na raiz — referência completa (API, Docker, backup, troubleshooting).
