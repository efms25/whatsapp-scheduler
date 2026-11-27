# Deploy em servidor simples

Passo a passo para publicar o WhatsApp Scheduler em um **VPS básico** (1 vCPU, 512 MB RAM, Ubuntu 22.04/24.04), usando **Docker** — o caminho recomendado, que é o suportado oficialmente pelo projeto.

> ⚠️ **HTTPS é obrigatório se o servidor for exposto na internet.** O Basic Auth transmite a senha em Base64 (= texto puro). Sem TLS, qualquer pessoa na rede lê suas credenciais.

---

## 0. Requisitos

| Item             | Mínimo                          |
| ---------------- | ------------------------------- |
| Servidor         | 1 vCPU, 512 MB RAM, ~2 GB disco |
| Sistema          | Ubuntu 22.04/24.04 (ou similar) |
| Acesso           | SSH com sudo                    |
| Domínio          | Opcional, mas **fortemente recomendado** (para HTTPS) |
| Docker           | Docker Engine 24+ e Compose v2 |

**Portas:** `3000` (API), ou `80` + `443` se usar o perfil HTTPS (Caddy).

---

## 1. Preparar o servidor

```bash
# atualizar sistema
sudo apt update && sudo apt upgrade -y

# instalar Docker (script oficial)
curl -fsSL https://get.docker.com | sudo sh

# permitir docker sem sudo (opcional, para seu usuário)
sudo usermod -aG docker $USER
newgrp docker

# liberar portas no firewall (se usar ufw)
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# só se for acessar direto pela porta 3000 (sem TLS):
# sudo ufw allow 3000/tcp
sudo ufw enable
```

Confirme:

```bash
docker --version        # Docker version 24+
docker compose version  # Docker Compose version v2+
```

---

## 2. Obter o código

```bash
# com Git
git clone <url-do-repositorio> /opt/whatsapp-scheduler
cd /opt/whatsapp-scheduler
```

```bash
# sem Git: copie a pasta do projeto (sem node_modules, sem storage, sem .env)
# e envie via scp:
# scp -r ./whatsapp-scheduler user@seu-servidor:/opt/
```

---

## 3. Criar o `.env` (credenciais — obrigatório)

O container **não sobe** sem `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` válidos.

```bash
cp .env.example .env
nano .env
```

Edite no mínimo:

```ini
BASIC_AUTH_USER=admin
BASIC_AUTH_PASS=TROQUE-POR-UMA-SENHA-FORTE-DE-VERDADE
```

Regras: **mínimo de 8 caracteres** e **diferente** de `troque-esta-senha`. Use algo como `openssl rand -base64 24` para gerar.

Para HTTPS (etapa 5), adicione também:

```ini
DOMAIN=seu-dominio.com
```

> ⚠️ O `.env` **não entra na imagem Docker** (está no `.dockerignore`) — ele é injetado só em tempo de execução via `env_file`. Guarde uma cópia fora do servidor ( cofre de senha / gerenciador ).

---

## 4. Subir a aplicação

```bash
docker compose up -d --build
```

A primeira vez baixa as imagens e compila o projeto (multi-stage). Depois:

```bash
docker compose logs -f app     # acompanhar logs (Ctrl+C sai do log, NÃO para o container)
docker compose ps              # deve mostrar "healthy"
```

Saída esperada no log:

```
INFO: Server listening at http://0.0.0.0:3000
INFO: API disponível em http://0.0.0.0:3000
```

Teste de saúde (rota pública, não pede senha):

```bash
curl http://localhost:3000/api/health
# {"status":"ok","database":"ok","whatsapp":"qr",...}
```

Pronto — a API está em `http://IP-DO-SERVIDOR:3000`.

---

## 5. HTTPS com Caddy (recomendado para internet)

1. **Aponte o DNS** do domínio para o IP do servidor (registro A). Aguarde a propagação.
2. Confirme que `DOMAIN=seu-dominio.com` está no `.env`.
3. Suba com o perfil `tls`:

```bash
docker compose --profile tls up -d --build
```

O Caddy (portas 80/443) emite o certificado TLS automaticamente e faz proxy para `app:3000`.

Acesse: `https://seu-dominio.com` — sem aviso de certificado.

> Se você já usa Nginx/Traefik no servidor, **não** habilite o perfil `tls`; faça o reverse proxy para a porta 3000 e emita o certificado por lá.

---

## 6. Primeiro acesso e QR Code

1. Abra `https://seu-dominio.com` (ou `http://IP:3000`).
2. Informe usuário/senha do `.env` (caixa de diálogo do navegador).
3. Vá em **Configurações** → escaneie o QR: celular → *WhatsApp → Dispositivos conectados → Conectar dispositivo*.
4. Aguarde **Conectado** e clique em **Atualizar** em *Grupos disponíveis*.

A sessão fica no volume `auth` e **persiste entre reinícios e atualizações**.

---

## 7. Operação no dia a dia

### Comandos úteis

```bash
docker compose logs -f app          # ver logs em tempo real
docker compose ps                   # status + healthcheck
docker compose restart app          # reiniciar
docker compose down                 # parar (volumes PRESERVADOS)
docker compose up -d                # subir de novo
```

### Atualizar a aplicação

```bash
cd /opt/whatsapp-scheduler
git pull
docker compose up -d --build        # reconstrói e recria o container
docker compose logs -f app          # conferir que subiu
```

Os volumes (`db`, `media`, `auth`) são preservados — **mensagens, agendamentos, histórico e sessão do WhatsApp continuam lá**.

### Verificar se está saudável

```bash
curl -s http://localhost:3000/api/health | head -c 200
docker compose ps                   # coluna STATUS: healthy
```

---

## 8. Backup

Pare o app antes de copiar (SQLite em WAL):

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

> Os nomes dos volumes assumem que a pasta do projeto se chama `whatsapp-scheduler`. Confirme com `docker volume ls`.

**O que cada um guarda:**

| Volume  | Perda significa                                  |
| ------- | ------------------------------------------------ |
| `auth`  | Precisar escanear um novo QR Code                |
| `db`    | Perder mensagens, agendamentos e histórico       |
| `media` | Mensagens de mídia falham ("Media file is missing") |

Agende no cron (ex.: diário às 4h) e guarde os `.tgz` fora do servidor.

---

## 9. Alternativa: deploy SEM Docker

Se o servidor não puder rodar Docker:

```bash
# pré-requisitos: Node.js >= 22 (recomendado 24) e npm >= 10
cd /opt/whatsapp-scheduler
cp .env.example .env && nano .env   # defina as credenciais

npm ci
npm run build                       # compila API (dist/) e frontend (web/dist/)
```

Serviço permanente com **systemd** (`/etc/systemd/system/whatsapp-scheduler.service`):

```ini
[Unit]
Description=WhatsApp Scheduler
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/whatsapp-scheduler
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
User=www-data
EnvironmentFile=/opt/whatsapp-scheduler/.env
# arquivos privados
UMask=0077

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now whatsapp-scheduler
sudo systemctl status whatsapp-scheduler
journalctl -u whatsapp-scheduler -f      # logs
```

Para HTTPS, coloque um Nginx/Caddy na frente apontando para `127.0.0.1:3000`.

> Nessa modalidade, atualize com `git pull && npm run build && sudo systemctl restart whatsapp-scheduler`.

---

## 10. Solução de problemas

| Sintoma                              | Causa / solução                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `Invalid environment variables`     | `.env` ausente ou senha inválida (mín. 8 chars, ≠ exemplo) — veja a etapa 3      |
| Container em `unhealthy`            | `docker compose logs app` — erro de env ou banco; `start_period` é 20 s         |
| Porta 3000 fechada de fora          | Firewall (ufw) — `sudo ufw allow 3000/tcp` ou use HTTPS (80/443)                |
| SSL/TLS falha no Caddy              | DNS apontando para IP errado ou porta 80/443 bloqueada pelo provedor           |
| `401` no navegador depois de trocar senha | O navegador guardou a senha antiga — limpe as credenciais salvas e reabra     |
| QR não aparece / `logged_out`       | Sessão encerrada pelo celular → **Gerar novo QR Code** em Configurações         |
| `Cannot GET /` (sem frontend)       | `web/dist` não compilado — `npm run build:web` (ou use a imagem Docker)         |
| Container reinicia sozinho          | `docker compose logs --tail 50 app` — erro fatal no boot (geralmente é o `.env`)|

---

## 11. Checklist de segurança

- [ ] `BASIC_AUTH_PASS` forte (≥ 12 caracteres aleatórios), guardada fora do servidor
- [ ] HTTPS ativo (perfil `tls` ou proxy próprio) — **não** exponha 3000 na internet sem TLS
- [ ] Firewall liberando só 22/80/443
- [ ] SSH com chave, sem senha, e `PasswordAuthentication no`
- [ ] Sistema atualizado (`unattended-upgrades`)
- [ ] Backup automático dos 3 volumes agendado e testado
- [ ] Número de WhatsApp dedicado e volume de mensagens baixo (~3/dia)
- [ ] `docker compose ps` monitorado (healthcheck `healthy`)

---

## Para continuar

- **[Como usar o sistema](./como-usar.md)** — guia prático pós-deploy.
- **[Configuração: usuário e senha](./configuracao-credenciais.md)** — credenciais e variáveis.
- **[`README.md`](../README.md)** — referência completa (API, backup, troubleshooting).
