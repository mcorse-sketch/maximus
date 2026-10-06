#!/usr/bin/env python3
"""Confere se os backups do Maximus RESTAURAM de verdade (v2.5-M). Nao altera o banco.

  python3 scripts/conferir_restauracao.py            ultimo backup do iCloud + ultimo backup local
  python3 scripts/conferir_restauracao.py ARQUIVO    um backup especifico (.json.enc ou .json)

Para cada backup: abre (decifra o do iCloud com a senha do Chaveiro, num arquivo
temporario apagado no fim), confere que e um banco valido, conta pacientes e
registros e compara com o banco atual (um backup tem de ser um "passado" do banco:
nenhum paciente a mais que o atual, salvo se o atual estiver ilegivel).
Codigo de saida: 0 tudo restaura; 1 algum backup nao restaura; 2 nada para conferir.
Rodar uma vez por mes (ou depois de trocar a senha do backup)."""
import json, os, re, sys, tempfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import servidor_maximus as S  # noqa: E402


def resumo(caminho):
    with open(caminho, "r", encoding="utf-8") as f:
        dados = json.load(f)
    if not isinstance(dados, dict) or not isinstance(dados.get("pacientes"), dict):
        raise ValueError("nao tem o formato do banco")
    pac = dados["pacientes"]
    reais = {c: v for c, v in pac.items() if not S.so_ficticio(v)}
    return {"pacientes": len(pac), "reais": len(reais), "registros": sum(len(v) for v in pac.values()), "codigos": set(pac)}


def abre(arquivo, senha):
    """Devolve o resumo do backup; .enc e decifrado em temporario."""
    if arquivo.endswith(".enc"):
        if not senha:
            raise ValueError("senha do backup nao encontrada (Chaveiro ou MAXIMUS_SENHA_BACKUP)")
        fd, tmp = tempfile.mkstemp(suffix=".json"); os.close(fd)
        try:
            if not S._openssl(True, senha, arquivo, tmp):
                raise ValueError("nao decifra: senha errada ou arquivo danificado")
            return resumo(tmp)
        finally:
            os.remove(tmp)
    return resumo(arquivo)


def ultimo(pasta, padrao):
    try:
        fs = sorted(f for f in os.listdir(pasta) if re.match(padrao, f))
        return os.path.join(pasta, fs[-1]) if fs else None
    except OSError:
        return None


def main():
    alvos = sys.argv[1:] or [x for x in (
        ultimo(S.ICLOUD, r"^banco_\d{4}-\d{2}-\d{2}\.json\.enc$"),
        ultimo(S.BACKUPS, r"^banco_\d{4}-\d{2}-\d{2}\.json$")) if x]
    if not alvos:
        print("Nenhum backup encontrado (iCloud: %s; local: %s)." % (S.ICLOUD, S.BACKUPS))
        return 2
    try:
        atual = resumo(S.BANCO) if os.path.exists(S.BANCO) else None
        print("Banco atual: %d pacientes (%d reais), %d registros." % (atual["pacientes"], atual["reais"], atual["registros"]) if atual else "Banco atual: nao existe.")
    except Exception as e:
        atual = None
        print("Banco atual ILEGIVEL (%s) — use o backup mais recente que restaurar abaixo." % e)
    senha = S.senha_backup() if any(a.endswith(".enc") for a in alvos) else None
    falhas = 0
    for a in alvos:
        nome = os.path.basename(a)
        try:
            r = abre(a, senha)
            extra = ""
            if atual:
                novos = r["codigos"] - atual["codigos"]
                if novos:
                    extra = " · ATENCAO: %d paciente(s) no backup que nao estao no banco atual (%s)" % (len(novos), ", ".join(sorted(novos)[:5]))
            print("  ok     %s restaura: %d pacientes (%d reais), %d registros%s" % (nome, r["pacientes"], r["reais"], r["registros"], extra))
        except Exception as e:
            falhas += 1
            print("  FALHA  %s NAO restaura: %s" % (nome, e))
    if not falhas:
        print("Tudo restaura. Para restaurar de fato (com o servidor parado):")
        print("  python3 servidor_maximus.py --restaurar-backup <arquivo.enc> banco_restaurado.json")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
