# Maximus

Sistema de triagem clínica da Clínica Maximus Medicina Masculina.

## Começando

```bash
cd tests && npm install     # instala o jsdom, única dependência
cd ..
./scripts/testar.sh 100     # bateria completa
```

Para abrir os apps, qualquer servidor estático serve:

```bash
python3 -m http.server 8000
# http://localhost:8000/apps/triagem.html
# http://localhost:8000/apps/recepcao.html
```

Sem o servidor da clínica, o `Store` cai no modo manual: os apps funcionam,
mas não persistem nada. Com o `servidor_maximus.py` rodando na porta 8080, os
três apps compartilham o mesmo banco — é assim que roda na clínica:

```bash
python3 servidor_maximus.py
# http://localhost:8080/            triagem     (perfil Médico)
# http://localhost:8080/recepcao    recepção    (perfil Recepção)
# http://localhost:8080/financeiro  financeiro  (perfil Financeiro)
```

**Senhas.** O servidor só abre com senha definida para os três perfis. Na
primeira vez — e sempre que quiser trocar uma senha — rode, um perfil por vez:

```bash
python3 servidor_maximus.py --definir-senha medico
python3 servidor_maximus.py --definir-senha recepcao
python3 servidor_maximus.py --definir-senha financeiro
```

A senha é digitada no terminal, sem aparecer, e fica em `senhas.json` só como
hash (fora do git). Cada app pede a senha do seu perfil ao abrir; a sessão
dura 12 horas ou até a aba ser fechada. Cinco senhas erradas seguidas bloqueiam
aquele aparelho por 5 minutos. Os apps publicados como artifact na Claude não
passam pelo servidor e não pedem senha.

**Demonstração.** Para um banco de teste, numa pasta sem `banco_triagem.json`:

```bash
python3 servidor_maximus.py --carregar-demo
```

Converte `data/banco_demonstracao.json` para o formato do servidor, com a
fila da recepção na data de hoje: oito pacientes, `MX9001` a `MX9008`, todos
com `demo: true`. Nunca sobrescreve um banco existente.

## Estrutura

```
apps/        os três aplicativos, um HTML autocontido cada
tests/       suíte em Node + jsdom
scripts/     testar.sh
docs/        decisões, backlog, histórico
data/        banco de demonstração
CLAUDE.md    regras do projeto — leia antes de editar
```

## Testes

| Arquivo | O que cobre |
|---|---|
| `tests/teste100.js` | 100 atendimentos sintéticos no app clínico, do início à conduta |
| `tests/teste_kiosk.js` | 100 questionários na recepção, máscara de telefone, regra do contato |
| `tests/teste_modulos.js` | abre todos os módulos do panorama, em várias profundidades, nas oito linhas |
| `tests/teste_integracao.js` | recepção → consultório: painel, ficha, panorama, retomada de sessão |
| `tests/regressao.js` | conduta de 59 pacientes-limite contra a baseline aprovada (`tests/regressao/`) |
| `tests/teste_sessao.js` | tela de senha dos três apps contra um servidor falso |
| `tests/teste_servidor.py` | servidor: senhas, permissões por perfil, bloqueio, rotas de dados |

Os quatro primeiros aceitam o caminho do HTML como primeiro argumento e o
número de pacientes como segundo.

## Publicação

Hoje os apps rodam como artifacts publicados na Claude:

- triagem: https://claude.ai/artifact/2qWQ5yEFgSCXee9GRrRU4E
- recepção: https://claude.ai/artifact/P7Z1xP52acyTz8vAyrUbHp

Cada artifact tem banco próprio. A versão anterior, ainda em uso, está em
outros dois links — mantidos intactos de propósito. Em produção na clínica o
caminho é o servidor local, não os artifacts.
