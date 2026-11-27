# Configuração: onde fica o usuário e a senha

Resposta curta: **no arquivo `.env` na raiz do projeto**, nas variáveis `BASIC_AUTH_USER` e `BASIC_AUTH_PASS`.

---

## 1. Localização exata

```
D:\Projetos\whatsapp-scheduler\.env      ← arquivo de configuração (editável, NÃO versionado)
D:\Projetos\whatsapp-scheduler\.env.example  ← modelo/template
```

> No Linux/macOS: `<pasta-do-projeto>/.env`

O `.env` está no `.gitignore` — ele **nunca vai para o Git**. Se você clonar o projeto em outra máquina, precisará criá-lo de novo.

### Conteúdo atual (credenciais de acesso)

```ini
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=Wurs4wIap8jr166fbC1Jhw18AZGauUTl
```

Essas são as credenciais usadas no login do painel. **Guarde-as em local seguro** — não há tela de recuperação de senha.

---

## 2. Como foi criado / como recriar

O arquivo foi gerado a partir do modelo:

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env
```

```bash
# Linux/macOS
cp .env.example .env
```

⚠️ **Não basta copiar**: o `.env.example` vem com a senha de exemplo `troque-esta-senha`, e o sistema **recusa** esse valor. Edite `BASIC_AUTH_PASS` com uma senha real antes de subir a API.

### Regras de validação (`src/config/env.ts`)

| Variável         | Regra                                                                 |
| ---------------- | --------------------------------------------------------------------- |
| `BASIC_AUTH_USER`| Obrigatória, não pode ser vazia                                        |
| `BASIC_AUTH_PASS`| Obrigatória, **mínimo de 8 caracteres** e **diferente** de `troque-esta-senha` |

Se qualquer regra falhar, a API **não sobe** e imprime no console:

```
Invalid environment variables:
  - BASIC_AUTH_PASS: must not be the example value; choose a strong password

Check your .env file (see .env.example).
```

---

## 3. Como trocar o usuário ou a senha

1. Abra `D:\Projetos\whatsapp-scheduler\.env` em qualquer editor.
2. Altere as linhas:
   ```ini
   BASIC_AUTH_USER=admin
   BASIC_AUTH_PASS=nova-senha-forte-aqui
   ```
3. **Reinicie a API** (as variáveis são lidas só na inicialização):
   ```powershell
   npm run dev:api     # ou npm run dev (API + frontend)
   ```
   Em Docker:
   ```powershell
   docker compose up -d   # recria o container com o novo .env
   ```
4. Na próxima abertura do painel, o navegador pedirá as **novas** credenciais.
   - Se ele continuar mandando a senha antiga: limpe as credenciais salvas do navegador ou feche todas as abas e reabra.

### Observações importantes

- **É um usuário único.** Não há usuários por pessoa — `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` são *o* login do sistema (Basic Auth).
- A senha é trafegada em Base64 (equivalente a texto puro) — **use HTTPS em produção**. No Docker, ative o perfil `tls` (Caddy): `docker compose --profile tls up -d --build`.
- Trocar a senha **não** afeta a sessão do WhatsApp nem os agendamentos.

---

## 4. Onde mais essas credenciais são usadas

O mesmo `.env` é lido por **três** lugares:

| Quem                      | Para quê                                                                 |
| ------------------------- | ------------------------------------------------------------------------ |
| **API (Fastify)**         | Validar o login de todas as rotas (`src/config/env.ts` → `src/plugins/auth.ts`) |
| **Frontend em dev (Vite)**| O proxy em `web/vite.config.ts` injeta o header `Authorization` nas chamadas a `/api` — por isso o painel funciona sem pedir login no `:5173` |
| **Docker Compose**        | `env_file: .env` carrega as variáveis para o container                   |

> **Se o painel em `localhost:5173` voltar a pedir login ou der `401` no console**, é porque o proxy não encontrou o `.env` na raiz — confirme que ele existe e reinicie o `npm run dev`.

---

## 5. Outras variáveis que você pode querer ajustar no mesmo arquivo

| Variável                  | Padrão                         | Quando mudar                                          |
| ------------------------- | ------------------------------ | ----------------------------------------------------- |
| `PORT`                    | `3000`                         | Porta ocupada                                         |
| `TIMEZONE`                | `America/Bahia`                | Timezone padrão dos novos agendamentos                |
| `BASIC_AUTH_USER`         | `admin`                        | Trocar o nome de usuário                              |
| `BASIC_AUTH_PASS`         | —                              | **Trocar a senha**                                    |
| `LOG_LEVEL`               | `info`                         | Mais detalhes (`debug`) ou menos (`warn`) nos logs    |
| `SCHEDULER_TICK_SECONDS`  | `30`                           | Frequência do loop do scheduler (mín. 5)              |
| `SCHEDULER_CATCHUP_MINUTES`| `60`                          | Janela recuperada após desligar (0 = desativar)       |
| `MAX_UPLOAD_MB`           | `16`                           | Limite de tamanho de imagem/áudio                     |
| `DATABASE_PATH` / `MEDIA_PATH` / `AUTH_PATH` | `./storage/...` | Onde os dados são gravados                  |
| `WEB_DIST_PATH`           | `./web/dist`                   | Pasta do build do frontend em produção                |

A tabela completa está no [README — Variáveis de ambiente](../README.md#variáveis-de-ambiente).

---

## 6. Primeira vez? Checklist

```powershell
# 1. Criar o .env
Copy-Item .env.example .env

# 2. Editar BASIC_AUTH_USER e BASIC_AUTH_PASS (senha forte, ≥ 8 caracteres)

# 3. Subir
npm install
npm run dev

# 4. Abrir http://localhost:5173 (dev) ou http://localhost:3000 (build)
#    e autenticar com o usuário/senha definidos no .env
```

---

## Para continuar

- **[Como usar o sistema](./como-usar.md)** — guia prático da interface.
- **[Como funciona o sistema](./como-funciona.md)** — arquitetura e scheduler.
