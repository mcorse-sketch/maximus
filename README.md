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
três apps compartilham o mesmo banco — é assim que roda na clínica.

Para popular um banco de teste, use `data/banco_demonstracao.json` (renomeie
para `banco_triagem.json` na pasta do servidor). São seis pacientes,
`MX9001` a `MX9006`, todos marcados com `demo: true` para limpeza posterior.

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

Todos aceitam o caminho do HTML como primeiro argumento e o número de
pacientes como segundo.

## Publicação

Hoje os apps rodam como artifacts publicados na Claude:

- triagem: https://claude.ai/artifact/2qWQ5yEFgSCXee9GRrRU4E
- recepção: https://claude.ai/artifact/P7Z1xP52acyTz8vAyrUbHp

Cada artifact tem banco próprio. A versão anterior, ainda em uso, está em
outros dois links — mantidos intactos de propósito. Em produção na clínica o
caminho é o servidor local, não os artifacts.
