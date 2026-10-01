"""Testes do servidor_maximus.py: acesso por perfil, bloqueio de tentativas
e as rotas de dados. Sobe o servidor numa pasta temporaria, numa porta livre;
o banco real nunca e tocado.

Uso:  python3 tests/teste_servidor.py
"""
import json, os, shutil, sys, tempfile, threading, unittest, urllib.request, urllib.error
from http.server import ThreadingHTTPServer

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
import servidor_maximus as srv  # noqa: E402

SENHAS = {"medico": "senha-medico-1", "recepcao": "senha-recepcao-1", "financeiro": "senha-financeiro-1"}


class Servidor(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="mxteste-")
        srv.BANCO = os.path.join(cls.tmp, "banco_triagem.json")
        srv.BACKUPS = os.path.join(cls.tmp, "backups")
        srv.SENHAS = os.path.join(cls.tmp, "senhas.json")
        srv.ITERACOES = 1000  # so para o teste ser rapido
        # backup externo numa pasta temporaria, com senha de teste: o Chaveiro
        # e o iCloud de verdade nunca sao tocados
        os.makedirs(os.path.join(cls.tmp, "nuvem"))
        srv.ICLOUD = os.path.join(cls.tmp, "nuvem", "Maximus backups")
        os.environ["MAXIMUS_SENHA_BACKUP"] = "senha-do-backup-teste"
        srv.print = lambda *a, **k: None              # silencia o servidor
        srv.Handler.log_message = lambda *a, **k: None
        for p, s in SENHAS.items():
            srv.definir_senha(p, s)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), srv.Handler)
        cls.base = "http://127.0.0.1:%d" % cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()
        cls.tok = {p: cls.entra(p, s) for p, s in SENHAS.items()}

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        shutil.rmtree(cls.tmp)

    def setUp(self):
        srv._falhas.clear()

    # ---- utilitarios
    @classmethod
    def req(cls, metodo, rota, corpo=None, token=None):
        dados = json.dumps(corpo).encode() if corpo is not None else None
        r = urllib.request.Request(cls.base + rota, data=dados, method=metodo)
        if dados is not None:
            r.add_header("Content-Type", "application/json")
        if token:
            r.add_header("Authorization", "Bearer " + token)
        try:
            with urllib.request.urlopen(r) as resp:
                bruto = resp.read()
                ctype = resp.headers.get("Content-Type", "")
                return resp.status, (json.loads(bruto) if "json" in ctype else bruto)
        except urllib.error.HTTPError as e:
            bruto = e.read()
            try:
                return e.code, json.loads(bruto)
            except Exception:
                return e.code, bruto

    @classmethod
    def entra(cls, perfil, senha):
        st, j = cls.req("POST", "/api/login", {"perfil": perfil, "senha": senha})
        assert st == 200, (perfil, st, j)
        return j["token"]

    # ---- senhas e sessao
    def test_senha_guardada_so_como_hash(self):
        with open(srv.SENHAS) as f:
            conteudo = f.read()
        for s in SENHAS.values():
            self.assertNotIn(s, conteudo)
        self.assertEqual(oct(os.stat(srv.SENHAS).st_mode & 0o777), "0o600")

    def test_senha_de_todos_e_usuarios_nomeados(self):
        with open(srv.SENHAS) as f:
            original = f.read()
        try:
            srv.adicionar_usuario("dra.teste", "medico", "senha-da-dra")
            # usuario nomeado entra no proprio perfil, nunca em outro
            self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": "senha-da-dra"})[0], 200)
            self.assertEqual(self.req("POST", "/api/login", {"perfil": "recepcao", "senha": "senha-da-dra"})[0], 401)
            # "1234" para todos: perfis e usuarios; a senha antiga deixa de valer
            quem = srv.definir_senha_todos("1234")
            self.assertEqual(set(quem), {"medico", "recepcao", "financeiro", "dra.teste"})
            for p in ("medico", "recepcao", "financeiro"):
                self.assertEqual(self.req("POST", "/api/login", {"perfil": p, "senha": "1234"})[0], 200)
            self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": SENHAS["medico"]})[0], 401)
            with open(srv.SENHAS) as f:
                self.assertNotIn('"1234"', f.read())
            self.assertEqual(oct(os.stat(srv.SENHAS).st_mode & 0o777), "0o600")
            self.assertTrue(srv.remover_usuario("dra.teste"))
            self.assertNotIn("dra.teste", srv.carregar_usuarios())
            with self.assertRaises(ValueError):
                srv.adicionar_usuario("Nome Com Espaco", "medico", "x")
        finally:
            with open(srv.SENHAS, "w") as f:
                f.write(original)
            srv._falhas.clear()

    def test_health_e_paginas_sem_senha(self):
        self.assertEqual(self.req("GET", "/api/health")[0], 200)
        for rota in ("/", "/recepcao", "/financeiro"):
            self.assertEqual(self.req("GET", rota)[0], 200, rota)

    def test_dados_exigem_senha(self):
        for metodo, rota, corpo in [("GET", "/api/paciente/MX0001", None), ("GET", "/api/historico/MX0001", None),
                                    ("GET", "/api/triagens-hoje", None), ("GET", "/api/proximo-codigo", None),
                                    ("GET", "/api/export", None), ("POST", "/api/ciclo", {"codigo": "MX1"}),
                                    ("PUT", "/api/triagem/MX1/nota", {"nota": "x"})]:
            self.assertEqual(self.req(metodo, rota, corpo)[0], 401, rota)
            self.assertEqual(self.req(metodo, rota, corpo, token="token-inventado")[0], 401, rota)

    def test_senha_errada_e_perfil_errado(self):
        self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": "errada"})[0], 401)
        # senha certa de outro perfil nao serve
        self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": SENHAS["recepcao"]})[0], 401)
        self.assertEqual(self.req("POST", "/api/login", {"perfil": "admin", "senha": "x"})[0], 401)

    def test_bloqueio_apos_tentativas(self):
        for _ in range(srv.TENTATIVAS):
            self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": "errada"})[0], 401)
        # bloqueado: nem a senha certa entra
        self.assertEqual(self.req("POST", "/api/login", {"perfil": "medico", "senha": SENHAS["medico"]})[0], 429)

    def test_sessao_e_saida(self):
        tok = self.entra("financeiro", SENHAS["financeiro"])
        st, j = self.req("GET", "/api/sessao", token=tok)
        self.assertEqual((st, j["perfil"]), (200, "financeiro"))
        self.req("POST", "/api/logout", {}, token=tok)
        self.assertEqual(self.req("GET", "/api/sessao", token=tok)[0], 401)

    def test_sessao_expira(self):
        tok = self.entra("medico", SENHAS["medico"])
        perfil, _ = srv._sessoes[tok]
        srv._sessoes[tok] = (perfil, 0)
        self.assertEqual(self.req("GET", "/api/triagens-hoje", token=tok)[0], 401)

    # ---- permissoes por perfil
    def test_permissoes(self):
        casos = [
            ("GET", "/api/triagens-hoje", None, {"medico": 200, "recepcao": 200, "financeiro": 200}),
            ("GET", "/api/historico/MX0001", None, {"medico": 200, "recepcao": 200, "financeiro": 200}),
            ("GET", "/api/proximo-codigo", None, {"medico": 200, "recepcao": 200, "financeiro": 403}),
            ("GET", "/api/pacientes", None, {"medico": 200, "recepcao": 200, "financeiro": 403}),
            ("GET", "/api/export", None, {"medico": 200, "recepcao": 403, "financeiro": 403}),
            ("POST", "/api/ciclo", {"codigo": "MX0100", "tipo": "primeira", "linha": "DE"},
             {"medico": 200, "recepcao": 403, "financeiro": 403}),
            ("POST", "/api/ciclo", {"codigo": "MX0101", "tipo": "recepcao", "linha": "recepcao"},
             {"medico": 200, "recepcao": 200, "financeiro": 403}),
            ("PUT", "/api/triagem/MX0999/atendido", {"atendido": True},
             {"medico": 404, "recepcao": 404, "financeiro": 403}),
        ]
        for metodo, rota, corpo, esperado in casos:
            for perfil, codigo in esperado.items():
                st, _ = self.req(metodo, rota, corpo, token=self.tok[perfil])
                self.assertEqual(st, codigo, "%s %s como %s" % (metodo, rota, perfil))

    def test_recepcao_nao_disfarca_ciclo_clinico(self):
        # tipo de recepcao com linha clinica (ou o contrario) nao passa
        for reg in ({"codigo": "MX0102", "tipo": "recepcao", "linha": "DE"},
                    {"codigo": "MX0102", "tipo": "primeira", "linha": "recepcao"}):
            self.assertEqual(self.req("POST", "/api/ciclo", reg, token=self.tok["recepcao"])[0], 403)

    # ---- dados
    def test_fluxo_de_dados(self):
        m = self.tok["medico"]
        self.req("POST", "/api/ciclo", {"codigo": "mx0200", "tipo": "primeira", "linha": "DE", "protocolo": "DE-2"}, token=m)
        import datetime
        hoje = datetime.date.today().isoformat()
        self.req("POST", "/api/ciclo", {"codigo": "MX0200", "tipo": "recepcao", "linha": "recepcao",
                                        "dataLocal": hoje}, token=self.tok["recepcao"])
        st, j = self.req("GET", "/api/paciente/MX0200", token=m)
        self.assertEqual((st, j["total"]), (200, 2))
        st, j = self.req("GET", "/api/triagens-hoje", token=m)
        self.assertIn("MX0200", [t["codigo"] for t in j["triagens"]])
        # nota vai para o ciclo clinico, nunca para o registro de recepcao
        st, j = self.req("PUT", "/api/triagem/MX0200/nota", {"nota": "retorno em 60 dias"}, token=m)
        self.assertEqual(st, 200)
        st, j = self.req("GET", "/api/historico/MX0200", token=m)
        clin = [c for c in j["ciclos"] if c["tipo"] != "recepcao"][0]
        self.assertEqual(clin["notasMedicas"][0]["texto"], "retorno em 60 dias")
        self.assertEqual(self.req("PUT", "/api/triagem/MX0200/nota", {"nota": "x"}, token=self.tok["recepcao"])[0], 403)
        # lista de pacientes para o retorno: iniciais mais recentes, contagem clinica
        self.req("POST", "/api/ciclo", {"codigo": "MX0200", "tipo": "recepcao", "linha": "recepcao",
                                        "iniciais": "RAM", "dataLocal": hoje}, token=self.tok["recepcao"])
        st, j = self.req("GET", "/api/pacientes", token=m)
        p = [x for x in j["pacientes"] if x["codigo"] == "MX0200"][0]
        self.assertEqual((p["iniciais"], p["clinicos"]), ("RAM", 1))

    def test_concluir_atendimento_marca_sem_apagar(self):
        """v2.4: 'Concluir atendimento' marca o registro da recepcao de hoje
        como atendido (nunca apaga); a fila continua listando todos com o
        estado; desfazer devolve a fila e fica no log."""
        import datetime
        m, r, f = self.tok["medico"], self.tok["recepcao"], self.tok["financeiro"]
        hoje = datetime.date.today().isoformat()
        ontem = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
        self.req("POST", "/api/ciclo", {"codigo": "MX0300", "tipo": "recepcao", "linha": "recepcao",
                                        "dataLocal": ontem, "data": ontem + "T10:00:00"}, token=r)
        self.req("POST", "/api/ciclo", {"codigo": "MX0300", "tipo": "recepcao", "linha": "recepcao",
                                        "dataLocal": hoje, "data": hoje + "T10:00:00", "iniciais": "ABC"}, token=r)
        self.req("POST", "/api/ciclo", {"codigo": "MX0300", "tipo": "primeira", "linha": "DE",
                                        "data": hoje + "T10:30:00", "protocolo": "DE-2"}, token=m)
        st, antes = self.req("GET", "/api/historico/MX0300", token=m)
        n_antes = len(antes["ciclos"])
        # financeiro nao marca; codigo sem recepcao hoje responde 404
        self.assertEqual(self.req("PUT", "/api/triagem/MX0300/atendido", {"atendido": True}, token=f)[0], 403)
        self.assertEqual(self.req("PUT", "/api/triagem/MX0301/atendido", {"atendido": True}, token=m)[0], 404)
        self.assertEqual(self.req("PUT", "/api/triagem/MX0300/atendido", {"atendido": "sim"}, token=m)[0], 400)
        st, j = self.req("PUT", "/api/triagem/MX0300/atendido",
                         {"atendido": True, "ciclo": hoje + "T10:30:00"}, token=m)
        self.assertEqual((st, j["atendido"]), (200, True))
        st, j = self.req("GET", "/api/triagens-hoje", token=r)
        t = [x for x in j["triagens"] if x["codigo"] == "MX0300"]
        self.assertEqual(len(t), 1, "a fila do dia continua listando o atendido, com o estado")
        self.assertTrue(t[0]["atendido"])
        self.assertTrue(t[0]["atendidoEm"])
        self.assertEqual(t[0]["atendidoCiclo"], hoje + "T10:30:00")
        self.assertEqual(t[0]["iniciais"], "ABC", "nada do registro se perde")
        # desfazer (devolver a fila): estado volta, historico do log fica
        st, j = self.req("PUT", "/api/triagem/MX0300/atendido", {"atendido": False}, token=r)
        self.assertEqual(st, 200)
        st, j = self.req("GET", "/api/historico/MX0300", token=m)
        self.assertEqual(len(j["ciclos"]), n_antes, "nenhum registro apagado nem criado")
        rec = [c for c in j["ciclos"] if c["tipo"] == "recepcao" and c["dataLocal"] == hoje][0]
        self.assertFalse(rec["atendido"])
        self.assertEqual([x["atendido"] for x in rec["atendimentoLog"]], [True, False])
        self.assertEqual([x["perfil"] for x in rec["atendimentoLog"]], ["medico", "recepcao"])
        ont = [c for c in j["ciclos"] if c["tipo"] == "recepcao" and c["dataLocal"] == ontem][0]
        self.assertNotIn("atendido", ont, "registro de outro dia nao e tocado")

    def test_pagina_inexistente_responde_404(self):
        # o log quebrava ao registrar o erro e a conexao caia sem resposta
        self.assertEqual(self.req("GET", "/favicon.ico")[0], 404)
        self.assertEqual(self.req("GET", "/api/nao-existe", token=self.tok["medico"])[0], 404)

    def test_demo_no_formato_do_servidor(self):
        banco_real = srv.BANCO
        srv.BANCO = os.path.join(self.tmp, "demo.json")
        try:
            n = srv.carregar_demo(os.path.join(RAIZ, "data", "banco_demonstracao.json"))
            self.assertGreaterEqual(n, 6)
            with open(srv.BANCO) as f:
                dados = json.load(f)
            self.assertTrue(all(isinstance(v, list) for v in dados["pacientes"].values()))
            import datetime
            hoje = datetime.date.today().isoformat()
            fila = [c for v in dados["pacientes"].values() for c in v if c.get("tipo") == "recepcao"]
            self.assertTrue(fila and all(c["dataLocal"] == hoje for c in fila))
            # nunca sobrescreve um banco existente
            with self.assertRaises(SystemExit):
                srv.carregar_demo(os.path.join(RAIZ, "data", "banco_demonstracao.json"))
        finally:
            srv.BANCO = banco_real

    # ---- backup criptografado fora do computador
    def test_backup_do_dia_vai_criptografado_para_a_nuvem(self):
        import datetime
        hoje = datetime.date.today().isoformat()
        # o backup copia o banco de antes da gravacao: com o banco ainda vazio
        # nao ha o que copiar, entao sao duas gravacoes
        for cod in ("MX0300", "MX0301"):
            self.req("POST", "/api/ciclo", {"codigo": cod, "tipo": "primeira", "linha": "DE"}, token=self.tok["medico"])
        enc = os.path.join(srv.ICLOUD, "banco_%s.json.enc" % hoje)
        self.assertTrue(os.path.exists(enc))
        with open(enc, "rb") as f:
            bruto = f.read()
        self.assertTrue(bruto.startswith(b"Salted__"))
        self.assertNotIn(b"pacientes", bruto)

    def test_backup_ida_e_volta(self):
        enc = os.path.join(self.tmp, "ida.json.enc")
        banco_ref = os.path.join(self.tmp, "ref.json")
        with open(banco_ref, "w", encoding="utf-8") as f:
            json.dump({"pacientes": {"MX0001": [{"codigo": "MX0001", "nota": "acentuação"}]}}, f, ensure_ascii=False)
        self.assertTrue(srv._openssl(False, "senha-do-backup-teste", banco_ref, enc))
        destino = os.path.join(self.tmp, "volta.json")
        self.assertEqual(srv.restaurar_backup(enc, destino, "senha-do-backup-teste"), 1)
        with open(destino, encoding="utf-8") as a, open(banco_ref, encoding="utf-8") as b:
            self.assertEqual(json.load(a), json.load(b))
        # nunca sobrescreve, e senha errada nao abre nem deixa lixo
        with self.assertRaises(SystemExit):
            srv.restaurar_backup(enc, destino, "senha-do-backup-teste")
        errado = os.path.join(self.tmp, "errado.json")
        with self.assertRaises(SystemExit):
            srv.restaurar_backup(enc, errado, "outra-senha")
        self.assertFalse(os.path.exists(errado) or os.path.exists(errado + ".tmp"))

    def test_backup_sem_senha_ou_sem_icloud_avisa_sem_travar(self):
        orig_senha, orig_icloud = srv.senha_backup, srv.ICLOUD
        try:
            srv.senha_backup = lambda: None
            self.assertIn("senha do backup", srv.backup_fora(srv.BANCO, "2000-01-01"))
            srv.senha_backup = orig_senha
            srv.ICLOUD = os.path.join(self.tmp, "nao-existe", "Maximus backups")
            self.assertIn("iCloud", srv.backup_fora(srv.BANCO, "2000-01-01"))
        finally:
            srv.senha_backup, srv.ICLOUD = orig_senha, orig_icloud

    def test_backup_guarda_so_os_ultimos_60(self):
        os.makedirs(srv.ICLOUD, exist_ok=True)
        import datetime
        base = datetime.date(2001, 1, 1)
        for k in range(70):
            open(os.path.join(srv.ICLOUD, "banco_%s.json.enc" % (base + datetime.timedelta(days=k))), "w").close()
        self.assertIsNone(srv.backup_fora(srv.BANCO, "2099-12-31"))
        restantes = [f for f in os.listdir(srv.ICLOUD) if f.endswith(".json.enc")]
        self.assertEqual(len(restantes), srv.BACKUP_DIAS)
        self.assertIn("banco_2099-12-31.json.enc", restantes)

    def test_ficticios_fila_e_apagar(self):
        import datetime, random
        banco_real = srv.BANCO
        srv.BANCO = os.path.join(self.tmp, "ficticio.json")
        try:
            hoje = datetime.date.today().isoformat()
            pac = {"MX%04d" % k: [{"codigo": "MX%04d" % k, "tipo": "recepcao", "linha": "recepcao", "demo": True,
                                   "dataLocal": "2025-01-01", "iniciais": "AB", "telefone": "(21)99999-0001",
                                   "queixaRecepcao": "de", "medidas": {"idade": 40}},
                                  {"codigo": "MX%04d" % k, "tipo": "primeira", "linha": "DE", "demo": True,
                                   "dataLocal": "2025-01-01", "protocolo": "DE-2"}] for k in range(1, 11)}
            pac["MX0500"] = [{"codigo": "MX0500", "tipo": "primeira", "linha": "DE", "dataLocal": "2025-01-01"}]
            srv.gravar({"pacientes": pac})
            cods = srv.fila_ficticia(6, random.Random(1))
            self.assertEqual(len(set(cods)), 6)
            self.assertNotIn("MX0500", cods)  # paciente real nunca entra na fila ficticia
            with open(srv.BANCO) as f:
                d = json.load(f)["pacientes"]
            fila = [c for v in d.values() for c in v if c.get("tipo") == "recepcao" and c.get("dataLocal") == hoje]
            self.assertEqual(len(fila), 6)
            self.assertTrue(all(c["demo"] and c["retorno"] and c["iniciais"] == "AB" and c["iief"] for c in fila))
            n, restam = srv.apagar_ficticios()
            with open(srv.BANCO) as f:
                d = json.load(f)["pacientes"]
            self.assertEqual((restam, list(d)), (1, ["MX0500"]))
            self.assertTrue(os.path.exists(srv.BANCO + ".antes-de-apagar-ficticios"))
        finally:
            srv.BANCO = banco_real

    def test_banco_de_teste_mescla_sem_tocar_no_real(self):
        # --carregar-teste: 40 ficticios MX9101-MX9140 entram ao lado dos reais,
        # com backup antes, datas trazidas para hoje e fila da recepcao de hoje;
        # atender um ficticio gera registro ficticio; --apagar-ficticios devolve
        # exatamente o banco real
        import datetime
        hoje = datetime.date.today()
        origem = os.path.join(RAIZ, "data", "banco_teste.json")
        with open(origem, encoding="utf-8") as f:
            teste = json.load(f)
        # arquivo gerado 10 dias "atras": a carga tem de trazer tudo para hoje
        velho = dict(teste, referencia=(datetime.date.fromisoformat(teste["referencia"]) - datetime.timedelta(days=10)).isoformat())
        velho["pacientes"] = {c: [dict(r, dataLocal=(datetime.date.fromisoformat(r["dataLocal"]) - datetime.timedelta(days=10)).isoformat())
                                  for r in regs] for c, regs in teste["pacientes"].items()}
        arq = os.path.join(self.tmp, "banco_teste_velho.json")
        with open(arq, "w", encoding="utf-8") as f:
            json.dump(velho, f)
        real = {"MX0001": [{"codigo": "MX0001", "tipo": "primeira", "linha": "DE", "protocolo": "DE-2", "data": "2026-01-10T12:00:00.000Z", "dataLocal": "2026-01-10"},
                           {"codigo": "MX0001", "tipo": "reavaliacao", "linha": "DE", "protocolo": "DE-2 (mantido)", "data": "2026-03-10T12:00:00.000Z", "dataLocal": "2026-03-10"}],
                "MX0002": [{"codigo": "MX0002", "tipo": "recepcao", "linha": "recepcao", "dataLocal": hoje.isoformat(), "data": hoje.isoformat() + "T11:00:00"}]}
        banco_real = self._com_banco(json.dumps({"pacientes": dict(real, MX9105=[{"codigo": "MX9105", "tipo": "primeira", "demo": True, "velho": True}])}))
        m = self.tok["medico"]
        try:
            r = srv.carregar_teste(arq)
            self.assertEqual((r["pacientes"], len(r["fila"]), r["reais"], r["dias"]), (40, 8, 2, (hoje - datetime.date.fromisoformat(velho["referencia"])).days))
            self.assertTrue(r["copia"] and os.path.exists(r["copia"]))
            with open(srv.BANCO, encoding="utf-8") as f:
                d = json.load(f)["pacientes"]
            self.assertEqual({k: d[k] for k in real}, real)                       # real intacto
            self.assertEqual(sorted(k for k in d if k.startswith("MX91")), ["MX%d" % k for k in range(9101, 9141)])
            self.assertFalse(any(x.get("velho") for x in d["MX9105"]))          # ficticio antigo substituido
            self.assertTrue(all(x.get("demo") for k in d if k.startswith("MX91") for x in d[k]))
            self.assertTrue(all(x["dataLocal"] <= hoje.isoformat() for k in d if k.startswith("MX91") for x in d[k]))
            fila = self.req("GET", "/api/triagens-hoje", token=m)[1]["triagens"]
            self.assertEqual(sorted(t["codigo"] for t in fila), sorted(r["fila"] + ["MX0002"]))
            # numeracao: os ficticios nao empurram o proximo real
            for perfil in ("medico", "recepcao"):
                self.assertEqual(self.req("GET", "/api/proximo-codigo", token=self.tok[perfil])[1]["codigo"], "MX0003")
            lista = {p["codigo"]: p for p in self.req("GET", "/api/pacientes", token=m)[1]["pacientes"]}
            self.assertEqual((lista["MX9101"]["ficticio"], lista["MX0001"]["ficticio"], lista["MX0002"]["ficticio"]), (True, False, False))
            hist = self.req("GET", "/api/historico/MX9102", token=m)[1]["ciclos"]
            self.assertGreaterEqual(len([c for c in hist if c.get("tipo") != "recepcao"]), 3)
            # atender ficticio da fila: o registro novo e ficticio; paciente real novo, nao
            self.assertEqual(self.req("POST", "/api/ciclo", {"codigo": "MX9113", "tipo": "primeira", "linha": "DE"}, token=m)[0], 200)
            self.assertEqual(self.req("POST", "/api/ciclo", {"codigo": "MX0003", "tipo": "primeira", "linha": "DE"}, token=m)[0], 200)
            with open(srv.BANCO, encoding="utf-8") as f:
                d = json.load(f)["pacientes"]
            self.assertTrue(d["MX9113"][-1].get("demo"))
            self.assertNotIn("demo", d["MX0003"][-1])
            self.assertEqual(self.req("GET", "/api/proximo-codigo", token=m)[1]["codigo"], "MX0004")
            # recarregar e seguro (substitui os ficticios, nao duplica)
            srv.carregar_teste(arq)
            with open(srv.BANCO, encoding="utf-8") as f:
                d = json.load(f)["pacientes"]
            self.assertEqual(len(d["MX9102"]), len(teste["pacientes"]["MX9102"]))
            # apagar: sobra exatamente o real
            n, restam = srv.apagar_ficticios()
            with open(srv.BANCO, encoding="utf-8") as f:
                d = json.load(f)["pacientes"]
            self.assertEqual(sorted(d), ["MX0001", "MX0002", "MX0003"])
            self.assertEqual({k: d[k] for k in real}, real)
            # codigo do teste com registro REAL: recusa tudo e nao mexe no banco
            d["MX9120"] = [{"codigo": "MX9120", "tipo": "primeira", "linha": "DE"}]
            srv.gravar({"pacientes": d})
            with open(srv.BANCO, encoding="utf-8") as f:
                antes = f.read()
            with self.assertRaises(SystemExit):
                srv.carregar_teste(arq)
            with open(srv.BANCO, encoding="utf-8") as f:
                self.assertEqual(f.read(), antes)
        finally:
            pasta = os.path.dirname(srv.BANCO)
            for x in os.listdir(pasta):
                if x.startswith(os.path.basename(srv.BANCO)):
                    os.remove(os.path.join(pasta, x))
            srv.BANCO = banco_real

    def _com_banco(self, conteudo):
        """Troca o banco por um arquivo com 'conteudo' (texto cru) so neste teste."""
        banco_real = srv.BANCO
        srv.BANCO = os.path.join(self.tmp, "codigo-%d.json" % id(conteudo))
        if conteudo is not None:
            with open(srv.BANCO, "w", encoding="utf-8") as f:
                f.write(conteudo)
        return banco_real

    def test_proximo_codigo_banco_vazio(self):
        # sem arquivo, arquivo de 0 bytes e "{}": sempre MX0001, sem erro 500
        # e sem gerar copia ".corrompido" (bug do app ao vivo, 30/09/2026)
        m = self.tok["medico"]
        for conteudo in (None, "", "  \n", "{}", '{"pacientes": {}}'):
            banco_real = self._com_banco(conteudo)
            try:
                st, j = self.req("GET", "/api/proximo-codigo", token=m)
                self.assertEqual((st, j), (200, {"codigo": "MX0001"}), repr(conteudo))
                st, j = self.req("GET", "/api/pacientes", token=m)
                self.assertEqual((st, j), (200, {"pacientes": []}), repr(conteudo))
                self.assertEqual(self.req("GET", "/api/triagens-hoje", token=m)[0], 200)
                pasta = os.path.dirname(srv.BANCO)
                self.assertFalse([x for x in os.listdir(pasta) if ".corrompido" in x], repr(conteudo))
                # a primeira gravacao funciona e o proximo passa a ser MX0002
                st, _ = self.req("POST", "/api/ciclo", {"codigo": "MX0001", "tipo": "primeira", "linha": "DE"}, token=m)
                self.assertEqual(st, 200, repr(conteudo))
                self.assertEqual(self.req("GET", "/api/proximo-codigo", token=m)[1]["codigo"], "MX0002")
            finally:
                if os.path.exists(srv.BANCO):
                    os.remove(srv.BANCO)
                srv.BANCO = banco_real

    def test_proximo_codigo_com_pacientes_e_recepcao(self):
        # o proximo livre passa do maior codigo, inclusive de quem so passou
        # pela recepcao hoje (a fila) e de codigos fora do padrao MX
        import datetime
        hoje = datetime.date.today().isoformat()
        banco_real = self._com_banco(json.dumps({"pacientes": {
            "MX0003": [{"codigo": "MX0003", "tipo": "primeira", "linha": "DE"}],
            "MX0007": [{"codigo": "MX0007", "tipo": "recepcao", "linha": "recepcao", "dataLocal": hoje}],
            "LIM000": [{"codigo": "LIM000", "tipo": "primeira", "linha": "DE"}]}}))
        try:
            for perfil in ("medico", "recepcao"):
                st, j = self.req("GET", "/api/proximo-codigo", token=self.tok[perfil])
                self.assertEqual((st, j["codigo"]), (200, "MX0008"), perfil)
            fila = self.req("GET", "/api/triagens-hoje", token=self.tok["medico"])[1]["triagens"]
            self.assertIn("MX0007", [t["codigo"] for t in fila])
        finally:
            os.remove(srv.BANCO)
            srv.BANCO = banco_real

    def test_banco_com_pacientes_invalido_nao_e_sobrescrito(self):
        # "pacientes" que nao e objeto e banco estragado: copia de seguranca, nunca
        # zera em silencio
        banco_real = self._com_banco('{"pacientes": []}')
        try:
            self.assertEqual(srv.carregar(), {"pacientes": {}})
            pasta = os.path.dirname(srv.BANCO)
            copias = [x for x in os.listdir(pasta) if x.startswith(os.path.basename(srv.BANCO) + ".corrompido")]
            self.assertEqual(len(copias), 1)
            for c in copias:
                os.remove(os.path.join(pasta, c))
        finally:
            os.remove(srv.BANCO)
            srv.BANCO = banco_real

    def test_codigo_invalido(self):
        self.assertEqual(self.req("GET", "/api/paciente/..%2Fetc", token=self.tok["medico"])[0], 400)


if __name__ == "__main__":
    unittest.main(verbosity=1)
