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
            ("GET", "/api/export", None, {"medico": 200, "recepcao": 403, "financeiro": 403}),
            ("POST", "/api/ciclo", {"codigo": "MX0100", "tipo": "primeira", "linha": "DE"},
             {"medico": 200, "recepcao": 403, "financeiro": 403}),
            ("POST", "/api/ciclo", {"codigo": "MX0101", "tipo": "recepcao", "linha": "recepcao"},
             {"medico": 200, "recepcao": 200, "financeiro": 403}),
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

    def test_codigo_invalido(self):
        self.assertEqual(self.req("GET", "/api/paciente/..%2Fetc", token=self.tok["medico"])[0], 400)


if __name__ == "__main__":
    unittest.main(verbosity=1)
