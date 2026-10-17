# PillGaze · Rakathon 2026

Pacientská PWA a webové rozhraní lékaře v HTML, CSS a JavaScriptu, obsluhované Node serverem. Vychází ze [zadání PillGaze](assets/RAKATHON_2026_MOU_Rusinko.md) a [prezentace](assets/Rakathon_Rusinko_prezentace.md).

[Checklist zadání](docs/requirements.md) · [Architektura systému](architecture.md) · [Transfer API](services/transfer-api/README.md) · [Pravidla spolupráce a CI](CONTRIBUTING.md) · [Katalog SÚKL](data/sukl/README.md)

Samostatný [prepis fotky cez prihlásený Codex alebo OpenCode](services/transcription/README.md)
je dostupný ako Python príkaz aj lokálny HTTP endpoint; vracia iba názov lieku
a dávkovanie. Alternatíva bez LLM je [offline OCR servis](services/ocr/README.md)
(RapidOCR + párovanie proti SÚKL katalógu). Zapojenie do aplikácie je samostatný
krok.

## Spuštění

Node.js 24; webové UI nevyžaduje instalaci závislostí.

```sh
npm start           # nebo npm run web / npm run web:patient
# http://localhost:8081/pacient — pacient
# http://localhost:8081/lekar   — lékař
```

### Lokální UI proti nasazenému backendu

Podrobný postup, konfigurace, bezpečnost a srovnání návrhů:
[readme-local-ui.md](readme-local-ui.md).

```sh
npm run web:remote
# http://localhost:8081/pacient
# http://localhost:8081/lekar
# http://localhost:8081/storage-admin
```

Všechna tři UI a katalogy se načítají z vašeho checkoutu. Lokální server proxyuje
API požadavky přes HTTPS na `https://rakathon.denishromada.com`, včetně storage,
přepisu fotografií a interakcí. Prohlížeč zůstává na localhostu, takže není potřeba
CORS ani lokální backend, databáze nebo klíč Gemini. Remote režim má přednost před
`TRANSCRIBE_API_URL` a `INTERACTION_API_URL`; nemění demo/real režim rozpoznávání v UI.

**Nejde o sandbox dat:** odeslané seznamy se ukládají na nasazeném backendu,
PINy fungují i na veřejném webu a admin mazání mění živou databázi. Používejte jen
syntetická data. Admin vyžaduje stávající heslo zadané do formuláře; nedávejte je
do konfigurace ani Gitu. Respektujte `Retry-After`; proxy požadavky automaticky neopakuje.

Vlastní nasazený backend nastavíte přes `WEB_BACKEND_URL` v lokálním `.env`
(HTTP(S) origin **bez `/api`**, cesty nebo credentials). Tato proměnná zapíná proxy
i pro `npm start`. `PORT` mění port; remote režim naslouchá jen na `127.0.0.1`.
Pro sdílení do LAN lze výslovně nastavit `HOST`, ale tím zpřístupníte i proxy
a admin na vaší síti; webkamera mimo localhost vyžaduje HTTPS.
Bez remote režimu a bez `WEB_BACKEND_URL` zůstává dosavadní chování serveru.

## Pacientská PWA

Webové UI je v `apps/patient-web/public/`. Pro skutečné rozpoznávání fotografií
nastavte engine podle [Gemini transcription](docs/gemini-transcription.md).

Fotografie z galerie nebo fotoaparátu přidají léčiva do seznamu. Na počítači
fotoaparát otevře náhled webkamery, na telefonu systémový fotoaparát. Položky lze
odstranit; rozepsaný seznam uchovává localStorage tohoto prohlížeče.
Pacientské UI historii odeslání nezobrazuje ani nenabízí její procházení.
Po odeslání se PIN zobrazí přímo na potvrzovací obrazovce ke zkopírování.
Volitelný režim onkologické léčby má našeptávání z HemOncKB.
Volitelný rozpis užívání (např. `1-0-0`) se zobrazuje u léčiva;
pokud je vyplněný, textové předání přidá sloupec **Kdy**.
Instalace PWA a přístup k webkameře vyžadují HTTPS nebo localhost.

Pacientské UI odesílá fotografie přes `POST /api/transcribe` na lokální Node
server, který je předá interaction enginu (`POST /transcribe`). Engine volá
přímo OpenRouter, standardně model `google/gemini-3.6-flash`. Do kořenového `.env`
nastavte `OPENROUTER_API_KEY`, případně `OPENROUTER_MODEL`, a pro lokální přepis
`TRANSCRIBE_API_URL=http://127.0.0.1:6767`. Spusťte z kořene `cargo run` vedle
`npm run web:patient`. Klíč zůstává na serveru; CLIProxyAPI není potřeba.
`WEB_BACKEND_URL` musí být pro lokální přepis vypnuté, protože přesměrovává všechny
API požadavky na vzdálený backend.

Rozpoznávání vrací `[{"name":"Concor","strength":"5 mg","schedule":"1-0-0"}]`;
nečitelné údaje jsou `null`. Síla se v UI zobrazí v poli dávkování, neznámý počet
dávek v balení zůstává prázdný. Řádek s nečitelným názvem je nutné odebrat a
vyfotit znovu. Podrobnosti: [OpenRouter transcription](docs/gemini-transcription.md).
„Odeslat seznam“ uloží verzovaný strukturovaný JSON `{ version: 1, regimen, items }` přes
`POST /api/v1/transfers`. Každá položka obsahuje pouze název, dávkování, počet
dávek v balení a případný rozpis užívání; lékař tyto položky načte a vykreslí.
Čtyřmístný číselný PIN (`0000`–`9999`, včetně počátečních nul) vrací storage API a PWA jej zobrazí po úspěšném odeslání. Blob lze vyzvednout
přes `GET /api/v1/transfers/{pin}`. Lékař nadále
umí načíst i dřívější textový formát `{ text }`.
Používejte pouze syntetická data: storage nevynucuje šifrování ani expiraci.
Lokální Node server obsluhuje UI, proxy rozpoznávání fotografií a proxy interakcí;
pro předání seznamu na nasazený storage použijte `npm run web:remote` výše.
Automatické opakování odeslání není zapnuté.
Při změně souborů UI zvyšte verzi cache v `apps/patient-web/public/sw.js`. Testy PWA jsou součástí
`npm test`; samostatně je spustíte příkazem
`node --test tests/patient.test.mjs tests/server.test.mjs`.

Našeptávání a přehled látek režimu používají `data/regimens.json`, zmenšený výpis
z `data/solid-tumors-regimens.json` s metadaty původu. Z lokálního
`data/dataverse_files.zip` obnovíte zdroj příkazem
`python3 scripts/extract_solid_tumors.py` a výpis příkazem
`python3 scripts/slim_regimens.py`; zdrojový ZIP není v Gitu.

Lékařské rozhraní je dostupné na `/lekar` ve stejném lokálním serveru. Nabízí
lokální historii PINů, přímé úpravy léčiv v tabulce, našeptávání názvů ze SÚKL,
režimy a kopírování seznamu po řádcích i do jednoho řádku.
Seznam se načítá ze storage podle skutečného PINu. Účinné látky se doplňují
podle názvu léčiva z katalogu SÚKL a režim lze upravit přímo v přehledu.
Křížek v hlavičce seznamu zavře aktuální PIN i seznam a vrátí fokus na zadání
dalšího PINu; neodstraňuje záznam ze storage. U sdíleného odkazu odstraní PIN
také z adresy, aby se zavřený seznam po obnovení znovu nenačetl.
Změna látek zneplatní načtené interakce; úprava dávkování je zachová.
Interakce se načítají z interaction API; po otevření podrobností se prohledají
podporované weby. Jejich stav se zobrazuje v pills a odkaz se shrnutím se objeví
jen u nalezené stránky. Lokální server používá proxy na `INTERACTION_API_URL`
(výchozí `https://rakathon.josefkuchar.com`).

## Kód a ověření

```text
apps/patient-web/       Pacientská PWA, lékařské UI a lokální Node server
apps/storage-admin/     Samostatné administrační UI úložiště
services/transfer-api/  Rust API pro předání seznamu přes PIN
interaction-engine/    Rozpoznávání fotografií a kontrola interakcí
tests/                 Testy webové aplikace a veřejného katalogu
e2e/                   Prohlížečové testy pacientského a lékařského toku
docs/                  Dokumentace a checklist požadavků
data/sukl/             Veřejný katalog léčiv a metadata jeho původu
assets/                Původní zadání, modelové seznamy a fotografie
.github/               CI workflows a PR checklist
```

Katalog SÚKL používá lékařské UI pro našeptávání názvů a doplnění účinných látek.
Podrobnosti a pravidla aktualizace jsou v [popisu katalogu](data/sukl/README.md).

Původní podklady v `assets/` se hromadně nebalí do aplikace a CI je nečte.
Lokální `knowledge-base/` není potřeba ke spuštění ani testům.

```sh
npm test
node --test apps/storage-admin/tests/*.test.mjs
```

Při pushi a PR do `main` nebo `pillgaze` běží aplikační CI na Node.js 24:
instalace z lockfilu, testy webové aplikace a kontrola veřejného katalogu.
Prohlížečové testy popisuje [E2E průvodce](e2e/README.md).
Nic se automaticky nenasazuje. Na VPS spouštějte instalaci a testy v izolovaném
sandboxu; viz [CONTRIBUTING.md](CONTRIBUTING.md).

## Výzkumné podklady

`knowledge-base/` je gitignorovaný lokální klon týmového Fieldnotes workspace; není potřeba ke spuštění aplikace. Pokyny k práci s ním jsou v `AGENTS.md`.

## Nasazení na VPS

Živé demo je **https://rakathon.denishromada.com** a používá Docker Compose,
nikoli Kubernetes. Frontend a Rust API mají oddělené Compose projekty;
pushe do repozitáře je automaticky nemění. Provozní cesty, ruční aktualizaci
frontendu a návrat popisuje [VPS průvodce](infra/vps/README.md).
Nepoužité AKS/k3s podklady a jejich deploy workflow byly odstraněny.
