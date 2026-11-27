# Como usar o sistema

Guia prático do dia a dia: do primeiro login ao envio agendado.

> Requisito: a API precisa estar rodando (veja o [README — Como rodar](../README.md#como-rodar)).

---

## 1. Acessar e fazer login

1. Abra `http://localhost:3000` (produção) ou `http://localhost:5173` (desenvolvimento).
2. O navegador exibirá uma caixa de diálogo de **Basic Auth** (usuário + senha).
   - Essas credenciais são as do arquivo `.env` (`BASIC_AUTH_USER` / `BASIC_AUTH_PASS`).
   - **Não existe tela de cadastro nem recuperação de senha** — é a única credencial do sistema.
3. Após autenticar, você verá o **Dashboard**.

📌 **Detalhes de onde configurar isso:** [configuracao-credenciais.md](./configuracao-credenciais.md).

---

## 2. Conectar o WhatsApp (passo obrigatório)

Sem conexão, nada é enviado. Vá em **Configurações** (menu lateral):

1. Se a sessão nunca foi autenticada, o card **"Autenticação por QR Code"** mostra um QR.
2. No celular: **WhatsApp → Dispositivos conectados → Conectar dispositivo** → escaneie o código.
3. Aguarde o badge mudar para **Conectado** (o número conectado aparece ao lado).
4. Clique em **Atualizar** no card **"Grupos disponíveis"** para sincronizar a lista de grupos.

### Estados possíveis

| Estado        | Significado                                                        | O que fazer                                       |
| ------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `connecting`  | Tentando conectar                                                   | Aguardar; verificar rede do servidor              |
| `qr`          | Aguardando escaneamento                                             | Escanear o QR no celular                          |
| `connected`   | Sessão autenticada                                                  | Pode usar normalmente                             |
| `logged_out`  | Sessão encerrada pelo celular                                       | Clicar em **"Gerar novo QR Code"**                |
| erro          | Falha de rede/protocolo                                             | Clicar em **"Reconectar"** e ver `last_error`     |

> A sessão fica salva em `storage/auth/`. Enquanto esse diretório existir, **não** será preciso escanear o QR de novo. Se apagar, escaneie novamente.

---

## 3. Cadastrar uma mensagem (o conteúdo)

Menu **Mensagens** → botão **"Nova mensagem"**.

| Campo                  | Obrigatório | Observações                                                        |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| Título                 | Sim         | Apenas identificação interna (máx. 200 caracteres)                 |
| Tipo                   | Sim         | `Texto`, `Imagem` ou `Áudio`                                       |
| Grupo de destino       | Sim         | Selecione na lista suspensa (vem dos grupos sincronizados) ou cole o ID |
| Conteúdo / Legenda     | Sim só p/ texto | Imagem: legenda opcional. Áudio: campo interno, **não é enviado** |
| Arquivo                | Só p/ mídia | Imagem: JPEG/PNG/WebP. Áudio: MP3, OGG/Opus, M4A/AAC. Máx. 16 MB   |
| "Mensagem ativa..."    | Não (padrão: ativa) | Desmarque para **não** participar de agendamentos            |

Clique em **Salvar**.

### Dicas

- O campo de grupo mostra um **datalist** com os grupos sincronizados; se a lista estiver vazia, conecte o WhatsApp e clique em **Atualizar** em Configurações.
- Formato do ID de grupo: `120363000000000000@g.us`.
- Mensagens **desativadas** não entram em agendamentos, mas podem ser enviadas manualmente.
- Excluir uma mensagem que tem agendamentos ativos pede confirmação e remove os agendamentos junto (`force=true`). O histórico de execuções é preservado com o título congelado.

---

## 4. Criar um agendamento (o quando)

Menu **Agendamentos** → botão **"Novo agendamento"**.

| Campo          | Obrigatório | Observações                                                     |
| -------------- | ----------- | --------------------------------------------------------------- |
| Mensagem       | Sim         | Escolha uma das mensagens já cadastradas                        |
| Grupo destino  | Sim         | Pode ser diferente do cadastro — este é o grupo efetivamente usado |
| Dias da semana | Sim         | Marque 1 ou mais dias (Seg…Dom)                                 |
| Horário        | Sim         | Formato 24h `HH:mm`                                             |
| Timezone       | Sim         | IANA, ex.: `America/Bahia` (padrão do sistema)                  |
| Início / Fim   | Não         | Vigência opcional (datas)                                       |
| "Agendamento ativo" | Não (padrão: ativo) | Desmarque para pausar sem excluir                       |

Clique em **Salvar**. O card mostra a **"Próxima execução"** calculada automaticamente.

### Como fica a lista

- **Ativar / Desativar** pausa e retoma sem perder a configuração.
- **Editar** altera dias, horário, grupo, vigência etc.
- **Excluir** remove o agendamento (o histórico de envios já feitos permanece).

---

## 5. Enviar agora (envio manual)

Menu **Envio manual**:

1. Escolha a **mensagem** (a prévia mostra texto/imagem/áudio).
2. Confirme ou altere o **grupo** — a alteração vale **apenas** para este envio.
3. Clique em **"Enviar agora"**.
4. Veja o resultado: badge `SENT` (com ID da mensagem no WhatsApp) ou `FAILED` (com o motivo).

> O envio manual **nunca altera nem desativa os agendamentos**. Ele fica registrado no histórico como `MANUAL`.

Também é possível enviar pela lista de mensagens (botão "Enviar agora" em cada card) — nesse caso usa o grupo do cadastro.

---

## 6. Acompanhar pelo Dashboard

Menu **Dashboard** (atualiza a cada 15 s):

- **Cards de resumo:** total de mensagens (e ativas), agendamentos ativos, execuções pendentes e estado do WhatsApp.
- **Próximas execuções:** o que o scheduler vai enviar em seguida, com data/hora no timezone do agendamento.
- **Histórico recente:** últimos envios com status (`SENT`/`FAILED`), tipo (Manual/Agendado), entrega/leitura quando disponível e erro, se houver.

---

## 7. Referência rápida das telas

| Menu             | Serve para                                                    |
| ---------------- | ------------------------------------------------------------- |
| **Dashboard**    | Visão geral: contadores, próximos envios, histórico recente    |
| **Mensagens**    | Criar/editar/excluir o conteúdo (texto, imagem, áudio)         |
| **Agendamentos** | Definir dias, horário, timezone e vigência de cada mensagem   |
| **Envio manual** | Disparar uma mensagem imediatamente, sem tocar nos agendamentos|
| **Configurações**| Conexão do WhatsApp (QR), grupos e informações do sistema      |

O link **"Documentação da API"** (rodapé do menu, ou `/docs`) abre o Swagger com todas as rotas — útil para automação via `curl`.

---

## 8. Problemas comuns

| Sintoma                              | Solução                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Caixa de login aparece sempre       | Credenciais erradas — veja [configuracao-credenciais.md](./configuracao-credenciais.md) |
| `401` no console do frontend        | O `.env` não foi lido pelo proxy do Vite (desenvolvimento)              |
| QR não aparece                       | Estado `connecting` ou erro de rede; use **Reconectar** em Configurações|
| `logged_out`                         | Clique em **"Gerar novo QR Code"** e escaneie de novo                   |
| Grupos não aparecem no campo         | Conecte o WhatsApp e clique em **Atualizar** em Configurações          |
| Envio falha com "not connected"      | Execução agendada fica `PENDING` e tenta de novo; manual retorna falha  |
| Mensagem duplicada                   | Não deve ocorrer por design; verifique se há duas instâncias rodando   |
| Horário errado                       | Confira `TIMEZONE`, o NTP do servidor e o timezone do agendamento      |
| `409` ao excluir mensagem            | Existem agendamentos ativos — desative-os ou confirme a exclusão forçada|
| Áudio não toca em todos os aparelhos | Formato não ideal; prefira **OGG/Opus**                                |

---

## Para continuar

- **[Como funciona o sistema](./como-funciona.md)** — arquitetura e scheduler.
- **[Configuração: usuário e senha](./configuracao-credenciais.md)** — credenciais e variáveis de ambiente.
