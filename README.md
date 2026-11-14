# Gerador de Escala de Trabalho

Sistema interno para cadastrar funcionários, montar escalas de trabalho e conferir se elas seguem a CLT. O histórico de escala de cada funcionário fica salvo, e cada escala guarda suas versões.

- **Porta:** 3012 (configurável por `PORT` no `.env`)
- **Stack:** Python 3 + Flask, servido pelo Waitress; banco SQLite local (`dados/escala.db`)
- **Acesso:** `http://SERVIDOR:3012`

## Como iniciar (no próprio computador)

```bat
iniciar.bat
```

ou manualmente:

```bash
pip install -r requirements.txt
python app.py             # modo local: só este computador (http://localhost:3012)
python app.py --producao  # Waitress, aceita acesso da rede
```

Se a porta já estiver em uso, o sistema não sobe e sai com código 3.

Na primeira execução o banco é criado com os dados de exemplo da proposta inicial do RH (`escala.txt`): as 5 funcionárias do caixa da Morada do Sol, os modelos de turno da proposta, os feriados de 2026 e a escala de 09/11 a 22/11/2026.

## Publicar no servidor (Windows)

1. Copie a pasta do projeto para o servidor (sem a pasta `dados/` se quiser começar do zero; com ela para levar o que já foi cadastrado).
2. Tenha o Python 3.10+ instalado.
3. Crie o `.env` a partir do `.env.example`.
4. Clique duas vezes em `servidor\instalar.bat` e confirme o pedido de administrador.

Sobe sozinho ao ligar o computador (tarefa agendada "Gerador de escala (3012)"), reinicia se cair,
e fica acessível em http://NOME-DO-SERVIDOR:3012. Log: `logs\servidor.log`.
Para atualizar: copie os arquivos novos (sem sobrescrever `dados/`) e rode o `instalar.bat` de novo.
Para remover: `servidor\desinstalar.bat` (não apaga dados).

## O que o sistema faz

| Tela | Para quê |
| --- | --- |
| Painel | Quem trabalha hoje, conformidade da escala vigente, próximos feriados, atividades |
| Escalas | Lista, criação (gerar automático, repetir outra escala ou em branco), edição, publicação |
| Editor de escala | Grade funcionário × dia, validação CLT ao vivo, cobertura por horário, totais, versões, impressão e exportação CSV |
| Funcionários | Cadastro e histórico semana a semana de cada pessoa |
| Modelos de turno | Horários prontos (períodos de trabalho; intervalos são calculados) |
| Regras CLT | Referência das regras verificadas e configurações |
| Feriados | Datas marcadas na escala |
| Atividades | Registro de tudo que foi criado, alterado, publicado ou excluído |

## Regras verificadas

| Regra | Base legal | Nível |
| --- | --- | --- |
| Jornada diária até 8h; extras até 2h | CLT arts. 58 e 59 | alerta acima de 8h, violação acima de 10h |
| Intervalo de 1h a 2h (jornada > 6h) ou 15 min (4h a 6h) | CLT art. 71 | violação |
| Pausas além do intervalo legal | Súmula 118 TST | alerta (pode ser desligado) |
| 11h entre jornadas | CLT art. 66 | violação |
| Folga semanal de 35h (24h + 11h) | CLT arts. 66/67, Súmula 110 TST | violação |
| No máximo 6 dias seguidos de trabalho | CLT art. 67, OJ 410 SDI-1 TST | violação |
| Domingo de folga ao menos a cada 3 semanas (comércio) | Lei 10.101/2000, art. 6º | violação |
| Domingo de folga quinzenal para mulheres | CLT art. 386 | alerta (pode ser desligado) |
| Jornada semanal (44h e contrato) | CF art. 7º, XIII | alerta |
| Trabalho em feriado | Lei 605/49; Lei 10.101/2000, art. 6º-A | alerta |
| Trabalho noturno (22h–5h) | CLT art. 73 | informação |
| Horário sem ninguém trabalhando | operacional | informação |

A validação roda no navegador (`static/js/clt.js`) e considera os 42 dias anteriores à escala (de outras escalas salvas) para checar interjornada, sequência de dias e domingos. Convenções coletivas podem ter regras próprias: confirme com o RH/jurídico antes de publicar.

## Dados e backup

- Banco: `dados/escala.db` (SQLite). Fica fora do controle de versão.
- Backup automático: ao iniciar, uma cópia por dia em `dados/backups/` (mantém as últimas `BACKUP_DIAS`, padrão 30).
- Escalas excluídas não são apagadas do banco: ficam marcadas com `excluida_em`.
- Cada salvamento, publicação e reabertura grava uma versão completa da escala (`escala_versoes`), que pode ser restaurada pelo botão **Versões**.

## Estrutura

```
app.py              servidor Flask + API
seed.py             dados iniciais (proposta do RH)
static/index.html   página única
static/css/app.css  estilo
static/js/core.js   utilitários de data/hora, API e estado
static/js/clt.js    motor de regras CLT e gerador automático
static/js/ui.js     componentes (modais, popovers, editor de horários)
static/js/telas.js  painel, funcionários, turnos, regras, feriados, atividades
static/js/escalas.js lista, assistente e editor de escalas
static/js/app.js    roteamento
servidor/           scripts de publicação no servidor Windows (só config.ps1 é específico)
```
