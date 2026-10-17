# Rakathon / PillGaze — kontext pro dalšího agenta

### Aktualizace 17. 10. 2026 — jednotný čtyřmístný PIN storage

- Větev `feat/storage-four-digit-pin`, worktree `/home/rhodes/rakathon-storage-four-digit-pin`: API POST generuje přesně čtyři ASCII číslice `0000`–`9999`; GET/PUT, pacientské receipts, lékařský formulář/query i kontrakt používají stejný formát. PIN je řetězec, počáteční nuly se zachovají; admin zobrazuje PIN vydaný serverem.
- Generování používá kryptografickou náhodu bez modulo bias. Po kolizích projde zbývající prostor; unikátní DB klíč brání přepsání při souběhu. Kapacita je 10 000 obsazených PINů, při zaplnění POST vrací 503 a PUT stále funguje. Bez expirace a bez nové DB migrace.
- Staré šestimístné PINy nové GET/PUT odmítají; původní DB řádky zůstávají v adminu, bez přečíslování či mazání. Pacient v1/v2 receipt migruje do rozepsaného seznamu pro nové uložení, zachová rozpracovaná data i původní localStorage klíče. Aktivní pacientský klíč je `pillgaze:patient:v3`, lékařský `pillgaze:doctor:v2` (starý v1 zůstává uložený).
- Ověření offline/non-root: **82 aplikačních + 22 Rust + 11 Playwright testů**. Pokryty `0042`, neplatné/staré kódy bez zkracování query, poslední volný PIN při souběhu, plné úložiště, lokální migrace a pacient → admin → lékař na mobilu i desktopu.
- Hostový `/home/rhodes/pillgaze-transfer/bin/check-storage.py` přijímá 4 číslice i dosavadní 6 znaků, aby fungoval před i po rollout; služba sama po změně vydává/přijímá pouze 4 číslice. Záloha probe a testovací skripty/logy jsou v `/home/rhodes/logs/storage-four-digit-pin/`.
- **Nenasazeno; vyžaduje společný API/UI deploy.** Žádné produkční uploady, mazání, DNS/firewall/porty ani restart služeb. Pro rollback kódu vrátit příslušný commit a nasadit API/UI společně; data ani HMAC secret neměnit. Původní probe lze obnovit ze `check-storage.before.py`.
- Testy běžely v tmux `rakathon-four-pin` / `rakathon-four-pin-final`; `tmux ls`, `tmux attach -t rakathon-four-pin-final`, přerušení Ctrl-C uvnitř. Session po dokončení skončí. Testy používají pouze dočasnou SQLite a samostatný build cache volume, nikoli runner credentials nebo živou DB.


### Aktualizace 17. 10. 2026 — odstranění Expo prototypu

- Kořenový Expo prototyp (`App.tsx`, `index.ts`, `src/`), jeho demo testy,
  konfigurace a npm závislosti byly odstraněny.
- `npm start`, `npm run web` a `npm run web:patient` spouštějí stejnou PWA
  z `apps/patient-web/`, včetně lékařského UI na `/lekar`.
- Aplikační CI nyní spouští webové testy a kontrolu katalogu bez TypeScript
  kompilace či Expo exportu. Kořenová aplikace nemá externí npm závislosti.
- Níže uvedené poznámky o Expo a jeho starých worktrees jsou historické;
  aktuální strukturu popisují `README.md` a `architecture.md`.
- Tato změna neupravuje živé nasazení ani jiné worktrees.

### Aktualizace 17. 10. 2026 — úplné odstranění demo rozpoznávání

- Z pacientského `services.js` odstraněna celá demo větev a její tři
  připravené léky. `recognizePhoto` vždy volá `/api/transcribe`;
  ani starý argument `{mode: 'demo'}` už nemůže vrátit lokální příklady.
- Test přenosu používá syntetickou odpověď pouze v testu, nikoli v klientovi.
  Regrese ověřuje, že 503 i při starém demo argumentu skončí chybou.
- Dříve uložené seznamy v localStorage nejsou automaticky mazány: z názvu
  léčiva nelze bezpečně poznat skutečný záznam od dřívější demo položky.
  Staré ukázkové položky je nutné smazat v UI; čistý prohlížeč začíná prázdný.
- Předchozí zjištění o externí 503 platí do nového ověření po změně její
  konfigurace; při tomto úklidu se externí modelové požadavky neposílají.

### Aktualizace 17. 10. 2026 — produkční napojení fotografií, externí služba blokuje rozpoznání

- Frontend oprava **bf30163** je pushnutá v main a nasazená: kamera i galerie
  volají skutečné `recognizePhoto(file)` místo vynuceného demo režimu.
  UI už nepopisuje ukázkové léky.
- Aktivní web image: `rakathon-web:main-bf301639da73-transcription-tls-depth`,
  healthy. API/admin zůstaly na `a11be5e`; šlo pouze o deploy webu.
- `rakathon-site/patient-nginx.conf` směruje přesnou cestu
  `/api/transcribe` na `https://rakathon.josefkuchar.com/transcribe`.
  Gateway i web propustí na této cestě 20 MiB; timeouty web/gateway/klient
  jsou 125/130/135 s. Upstream TLS se ověřuje s hloubkou řetězce 4.
  Žádné nové porty, změny dat, credentials, DNS či firewallu.
- Typecheck, **71/71 testů**, Nginx syntaxe a HTTPS/health kontroly prošly.
  Skutečný Chromium test kamerového rozhraní odeslal syntetický JPEG
  **1 078 709 bajtů** přes veřejné HTTPS až do externí služby.
- **Rozpoznávání stále není funkční:** externí služba vrací HTTP 503
  `Rozpoznávání fotografií není nakonfigurováno.` Podle jejího OpenAPI
  chybí `GEMINI_API_KEY`. Na tomto VPS konfigurace nebyla nalezena;
  uživatel dostal dotaz na zapnutí služby nebo jiný endpoint.
  Neposílat další fotografie bez změny konfigurace.
- Výsledky, zálohy konfigurací a postup návratu:
  `/home/rhodes/rakathon-site/state/transcription-20261017/README.md`.
  Zachovaný návratový image:
  `rakathon-web-recovery:before-production-transcription-20261017`.
  Další standardní UI deploy přebírá opravenou proxy z hostové konfigurace.


### Aktuální stav ověřený 16. 10. 2026, přibližně 23:05 UTC

- Transfer API a storage admin jsou nasazené z `main` revize `c63a9158eb42`.
  API image: `pillgaze-transfer:main-c63a9158eb42-20261016T230213Z-579693`;
  admin image: `pillgaze-storage-admin:main-c63a9158eb42-20261016T230245Z-581646`.
  Oba kontejnery byly při kontrole healthy.
- UI je stále na revizi `a7d407de1f67`, image
  `rakathon-web:main-a7d407de1f67-20261016T225154Z-573389`, healthy.
  API/admin a UI tedy momentálně nejsou ze stejného commitu.
- Požadované heslo storage adminu bylo změněno v chráněném
  `/home/rhodes/pillgaze-transfer/.secrets/transfer.env` (0600) a byl znovu
  vytvořen pouze API kontejner; API je healthy. `TRANSFER_HMAC_SECRET` a data
  zůstaly zachovány. Heslo neukládat do Git, dokumentace, image ani logů.
- Git checkout `/home/rhodes/rakathon-main-release` je čistý na `main`/
  `origin/main` při `c63a915`. Hlavní `/home/rhodes/rakathon` je nadále na
  `master` s jedním lokálním commitem; pro změny určené do `main` použij
  `/home/rhodes/rakathon-main-release`.
- Ostatní níže uvedené aktualizace jsou pracovní historie. Jejich časové pořadí
  a tvrzení o aktuálním nasazení vždy ověř podle živého stavu.


### Aktualizace 16. 10. 2026 — oprava storage refresh a release

- `~/refresh-rakathon.sh` původně končil před buildem API: deploy skript i
  `pillgaze-transfer/bin/check.sh` odkazovaly na odstraněný lokální image podle
  samotného SHA. Nahrazen stažitelným ARM64 image
  `python:3.13-slim-bookworm@sha256:55432fc4…`, a Python entrypoint cestou
  `/usr/local/bin/python3`.
- Refresh následně úspěšně nasadil společnou revizi **`a7d407de1f67`**:
  API `pillgaze-transfer:main-a7d407de1f67-20261016T224506Z-560832`, admin
  `pillgaze-storage-admin:main-a7d407de1f67-20261016T224536Z-562896`, UI
  `rakathon-web:main-a7d407de1f67-20261016T224612Z-563830`.
- API/admin/UI jsou healthy, `~/refresh-rakathon.sh --status` ověřil shodnou
  revizi. Prošly API syntetický probe a HTTPS/origin kontroly; testy: Rust 16/16,
  admin 6/6, UI 58/58. Během prvního pokusu selhal pouze izolovaný probe před
  přepnutím služby; produkce zůstala beze změny až do úspěšného druhého běhu.
- Refresh skripty jsou hostové soubory (ne Git checkout); změny jsou přímo
  v `/home/rhodes/pillgaze-transfer/bin/{deploy-storage.sh,check.sh}`.
  Žádné volume, credentials, firewall ani DNS nebyly měněny.

### Aktualizace 17. 10. 2026 — oprava E2E kontroly lékařského seznamu

- CI fail byl v zastaralém Playwright selektoru `#main .name`: lékařská tabulka
  vykresluje název jako editační `input[data-field="name"]`.
- Oba E2E scénáře nyní ověřují hodnotu inputu přes `toHaveValue`, včetně
  kontroly po reloadu. Izolovaný workflow kontejner lokálně prošel: **2/2 testy**
  (storage admin 102 → 103).
- Oprava je v `main` jako **997839a** (`fix(e2e): assert doctor medication input value`),
  push po bezpečném rebase na souběžný commit `d7504ea`. Actions běh po pushu
  ještě ověřit; žádný deploy aplikace nebyl proveden.


### Aktualizace 17. 10. 2026 — oprava E2E kontroly lékařského seznamu

- CI fail byl v zastaralém Playwright selektoru `#main .name`: lékařská tabulka
  vykresluje název jako editační `input[data-field="name"]`.
- Oba E2E scénáře nyní ověřují hodnotu inputu přes `toHaveValue`, včetně
  kontroly po reloadu. Izolovaný workflow kontejner lokálně prošel: **2/2 testy**
  (storage admin 102 → 103).
- Oprava je v `main` jako **997839a** (`fix(e2e): assert doctor medication input value`),
  push po bezpečném rebase na souběžný commit `d7504ea`. Actions běh po pushu
  ještě ověřit; žádný deploy aplikace nebyl proveden.


### Aktualizace 16. 10. 2026 — E2E začleněno do main, pouze dočasný kontejner

- Na výslovné zadání sloučeno/pushnuto do **main: 703ebf6**. Zachována
  souběžná změna lékaře `4db4a81`; vlastní změna izolace CI je `3ace28f`.
  Worktree `/home/rhodes/rakathon-storage-playwright` zůstává čistý.
- `.github/workflows/storage-e2e.yml` automaticky reaguje na push/PR do
  main/pillgaze a má workflow_dispatch bez parametrů a bez secrets.
  GitHub hosted Ubuntu sestaví `e2e/Dockerfile` a spustí disposable non-root
  kontejner s `--network none`, readonly root, tmpfs, resource limity,
  bez host mountů, Docker socketu a publikovaných portů. Uvnitř běží skutečné
  Rust API, SQLite, pacient, admin a Chromium; API i UI jen na loopbacku.
- **Živý režim odstraněn**, `E2E_BASE_URL` odmítnuto. Produkční heslo
  ani GitHub secret nejsou potřeba. Test ověří přesně 101 → 102 záznamů,
  serverový PIN a shodný obsah uloženého JSON; kontejner/DB po běhu zaniknou.
- Ověřeno plné sestavení image z checkoutu a stejný izolovaný docker run:
  1 passed (4.4s); po začlenění aktuálního mainu 1 passed (5.9s).
  Actionlint i git diff --check prošly. Main push ověřen přes git ls-remote.
- Výsledek přímo v GitHub Actions **zatím nepotvrzen**: GitHub konektor pro
  privátní `olexamatej/rakathon` vrací 404, na hostu není GitHub API token.
  Uživateli odeslána žádost o zpřístupnění repa konektoru. Existující deploy
  klíč dovolil Git push; runner credentials nebyly čteny ani kopírovány.
  Workflow: https://github.com/olexamatej/rakathon/actions/workflows/storage-e2e.yml
- Lokální plná validace: `/tmp/rakathon-e2e-ci-main-verify.log`; reproducible
  příkaz v `e2e/README.md`. Žádný deploy ani změny produkčních služeb.


### Aktualizace 16. 10. 2026 — Playwright pacient → storage admin

- Větev `test/storage-playwright`, commit **3b5769f**, pushnuta na origin;
  worktree `/home/rhodes/rakathon-storage-playwright`. Zatím nesloučeno do main.
- `e2e/storage.spec.mjs`: přihlásí admin, spočítá všechny stránky, odešle
  syntetický draft tlačítkem Odeslat seznam, ověří zobrazený serverový PIN,
  shodný JSON přes GET pod PINem a nárůst celkového počtu admin záznamů o 1.
- `e2e/patient-doctor.spec.mjs`: samostatný scénář pacientského odeslání a
  zobrazení stejného seznamu lékařem pomocí právě vydaného PINu v čistém
  browser contextu.
- `.github/workflows/storage-e2e.yml`: automatické push/PR testy main/pillgaze
  na GitHub hosted Ubuntu s reálným Rust API a dočasnou SQLite (101 výchozích
  syntetických řádků pro pagination). Zachována izolace Hetzner runneru.
- Ruční `workflow_dispatch` s `live=true` pouze na main testuje veřejný web;
  vyžaduje GitHub Actions secret `STORAGE_ADMIN_PASSWORD` (dosud nenastaven tímto
  úkolem). Žádné automatické retry, screenshoty, trace ani browser artefakty.
  Live běh ponechá jeden syntetický záznam. Viz `e2e/README.md`.
- Ověřeno: actionlint 1.7.12, lokální Chromium flow **1 passed (5.1s)**,
  živý HTTPS flow **1 passed (6.4s)** se skutečným uploadem. Živý záznam ponechán.
  Lokálně použit API binary z image revize `3e53e97` odpovídající výchozímu mainu.
  Jednorázové non-root sandbox kontejnery a stažený browser image odstraněny;
  žádné host porty, změny provozních stacků ani deployment aplikace.


### Aktualizace 16. 10. 2026 — lékařská stránka `/lekar`

- UI bylo nasazeno z aktuálního `origin/main`, revize **`3e53e97ba771`**.
  Živý image: `rakathon-web:main-3e53e97ba771-20261016T221124Z-520288`.
- Veřejné **https://rakathon.denishromada.com/lekar** nyní obsluhuje lékařskou
  stránku; pacientská `/pacient` a přesměrování kořene zůstávají zachované.
- `rakathon-site/patient-nginx.conf` povoluje `/lekar`, související JS/CSS a
  JSON katalog režimů. `bin/deploy-ui.sh` přibalí `data/regimens.json` do
  build snapshotu a vytvoří veřejné `regimens.json` a `regimen-drugs.json`.
  Probe image ověřuje tyto cesty před výměnou kontejneru.
- Ověření: typecheck, **47/47 testů**, Nginx konfigurace, origin HTTPS,
  veřejné HTTPS `/lekar`, JS a JSON katalog (HTTP 200), kontrola `/pacient`,
  API health a automatického Certbot timeru.
- První build odhalil, že exportní allowlist vynechával `data/regimens.json`;
  přednasazovací test jej zachytil a živý web zůstal beze změny. Allowlist i
  generování JSON byly doplněny a opakovaný deploy prošel.
- `/home/rhodes/rakathon-main-release` byl fast-forwardnut na `3e53e97`.
  Hlavní `/home/rhodes/rakathon` zůstává na větvi `master` s lokálním commitem;
  deploymentový wrapper jen bezpečně aktualizoval jeho `origin/main` ref.

### Aktualizace 16. 10. 2026 — storage distinct uploads

- Commit **070166c** z `fix/storage-distinct-uploads` byl sloučen do aktuálního
  `origin/main` přes merge commit **e8325af** a pushnut. Změna garantuje
  nezávislé záznamy pro opakované stejné uploady; backend kontrakt a regresní
  testy jsou zahrnuté. Podle autora prošlo 15 Rust a 34 klientských testů.
- **Nenasazeno.** Další deploy může použít `RAKATHON_REVISION=e8325af`;
  nejprve ověř aktuální provozní stav a postup v příslušném README.

**Aktualizováno: 16. 10. 2026, přibližně 21:22 UTC.**

### Nejnovější ověřené nasazení — storage admin

- Jednotný `/home/rhodes/refresh-rakathon.sh` nyní zahrnuje API → admin → UI
  ze stejného `RAKATHON_REVISION`; status/rollback zahrnují všechny tři části.
  Nový samostatný wrapper `refresh-rakathon-admin.sh` používá
  `pillgaze-storage-admin/bin/deploy-admin.sh` (offline testy, minimální snapshot,
  probe bez portů, automatická obnova při chybě, logy a previous-image).
  Ověřena syntaxe, help, živý read-only status a 7 mock scénářů orchestrace.
  Při této úpravě nebyl spuštěn nový živý deploy.

- Následná oprava **a9a7ca3** pushnuta do main a nasazena pouze do admin
  kontejneru (`pillgaze-storage-admin:a9a7ca3`). Přihlášení přežije refresh
  v téže kartě přes sessionStorage, bez prodloužení původních 15 minut.
  Logout a HTTP 401 uložený přístup odstraní. Prošlo 6 klientských testů,
  privátní Nginx probe a ověření přesné JS verze přes origin HTTPS.
  API/web mezitím aktualizovaly jiné relace; tato oprava je neměnila.

- `feat/storage-admin` fast-forward začleněna a pushnuta do `main`: **82fe4fa**.
- API: `pillgaze-transfer:main-82fe4fac4396-20261016T211742Z-462346`.
- Web: `rakathon-web:main-82fe4fa-admin-proxy-fix`, frontend z `82fe4fa`.
  Živá proxy má limit `1m`, admin routing před dotfile pravidlem a jednoznačné
  `Cache-Control: no-store` pro admin a API. Zdroj této konfigurace zůstává
  `rakathon-site/patient-nginx.conf`; další UI refresh ji zachová.
- Admin: **https://rakathon.denishromada.com/storage-admin**, samostatný projekt
  `/home/rhodes/pillgaze-storage-admin/compose.yml`, image
  `pillgaze-storage-admin:82fe4fa`, žádné publikované porty, jen privátní API síť.
- Silné vygenerované `STORAGE_ADMIN_PASSWORD` je v chráněném externím souboru
  `pillgaze-transfer/.secrets/transfer.env` (0600); nikdy netisknout do chatu/logů.
  Původní HMAC secret a SQLite volume zachovány.
- Online SQLite záloha před nasazením je v `pillgaze-transfer/backups/` (0700),
  prošla integrity check. Data/credentials nevkládat do zdrojového repa.
- Prošlo 14 Rust testů, 3 admin klientské testy, frontend test/typecheck,
  origin HTTPS admin/auth/no-store a smazání pouze vlastního syntetického řádku,
  veřejné HTTPS `/storage-admin` a health všech stávajících webů.
- Provoz/rollback: `pillgaze-storage-admin/README.md`; původní orchestrátor skončil
  na přísném proxy checku, cílená oprava je nasazena a následné kontroly prošly.
  Konečný stav je `pillgaze-storage-admin/state/final-status`.
- Nový čistý checkout větve main: `/home/rhodes/rakathon-main-release`.
  Ostatní worktrees a jejich rozpracované změny nebyly přepínány ani přepisovány.

Starší inventář níže zachycuje dřívější stav; pro API/web revize a kontrakt platí
tento odstavec (JSON POST/GET, nikoli původní šifrované transfer demo).
Toto je předávací kontext, ne zadání k automatickým změnám nebo nasazení.
Stav se rychle mění. Před prací ověř skutečný Git, soubory a běžící služby;
historická README a logy někdy popisují jiné období. Tento soubor neobsahuje
credentials ani pacientské záznamy.

## 1. Co stavíme

Na hackathonu **Rakathon 2026** pracujeme na **PillGaze**: pacient si vyfotí
krabičky léků nebo tištěný/ručně psaný seznam, aplikace z toho sestaví
strukturovaný seznam a pacient jej anonymně předá lékaři. Lékař seznam upraví,
na vyžádání zkontroluje interakce a onkologickou léčbu a zkopíruje výsledek
do zdravotnické dokumentace.

Cílový tok:

```text
fotografie → OCR / rozpoznání → sloučení údajů + kontrola pacientem
→ anonymní krátkodobý přenos → editace lékařem
→ volitelná kontrola interakcí / režimů → kopírování do dokumentace
```

- Zachovat odděleně název, sílu a dávkování; nepřevádět chybějící údaj na odhad.
- Při konfliktech sledovat původ a spolehlivost jednotlivých polí.
- Interakce a onkologické režimy patří do rozhraní lékaře, odděleně od původního
  seznamu a pouze na vyžádání. Nevyvozovat bezpečnost léčby z chybějícího nálezu.
- Zadání uvádí krátký PIN, max. 4 číslice, přibližně 3 minuty. Současné prototypy
  mají různé jiné kódy; **není to splněný ani sjednocený požadavek**.
- Používat syntetická/modelová data. Jde o prototyp, ne klinicky schválenou službu.

Zdroje v aplikaci: `docs/requirements.md`, `architecture.md`,
`assets/RAKATHON_2026_MOU_Rusinko.md`, `assets/Rakathon_Rusinko_prezentace.md`.
Checklist je cílové zadání, ne důkaz hotové implementace.

## 2. Nejdůležitější rozlišení: co opravdu funguje

| Část | Stav k aktualizaci tohoto dokumentu |
| --- | --- |
| Nová pacientská PWA | Veřejně běží. Fotografie/galerie/webkamera, seznam, mazání položek, historie, localStorage a PWA shell. |
| Rozpoznávání v této PWA | **Simulace**: každý obrázek vrátí dvě ukázková léčiva. Není to OCR. |
| Odesílání v této PWA | **Simulace**: lokální šestiznakový PIN. Seznam se neodesílá a lékař jej tímto PINem nevyzvedne. |
| Kořenová Expo aplikace | Starší samostatný prototyp v `App.tsx` a `src/`; není to nyní veřejně nasazená PWA. Má pacient/lékař a lokální čtyřmístný demo PIN ve stejné aplikaci. |
| Rust transfer API | Skutečně běží, ukládá šifrované obálky, podporuje expiraci, vyzvednutí, idempotenci a revokaci. **Nová PWA jej ještě nepoužívá.** |
| Patient/doctor transfer demo | Samostatné browser demo v Rust API. Šifruje/dešifruje v prohlížeči; není to nová pacientská PWA ani dokončené rozhraní lékaře. |
| Expo → skutečné API | Lokálně rozpracované v dirty worktree `rakathon-connect`; nepřepisovat a nepovažovat za integrované v `main`. |
| SÚKL katalog a párování referencí | Data a přípravné nástroje existují; přítomnost katalogu neznamená jeho zapojení do živého UI. |
| Interaction engine | Rust/Axum + Codex implementace je v `origin/main`; není mezi ověřenými běžícími službami tohoto VPS ani zapojená do živého UI. |
| Celý cílový tok | Zatím není dokončený. Neslibovat funkční OCR, mezizařízení přenos v PWA nebo klinickou validaci. |

Část README stále popisuje Expo, jiné odstavce novou PWA. Nezaměňovat tyto klienty.

## 3. Repo, větve a souběžná práce

Repo: **https://github.com/olexamatej/rakathon**.
Používá se výhradně **`main`** a pracovní větve založené na aktuálním `origin/main`.
Starý prognosis projekt je archivovaný na `legacy-prognosis`.

Aktuální hostové worktrees:

| Cesta | Co je to / upozornění |
| --- | --- |
| `/home/rhodes/rakathon` | Hlavní Git checkout pro správu worktrees a přístup k `origin/main`. Pro změny vytvořit vlastní worktree z aktuálního `origin/main`; nepřepínat checkout agentům pod rukama. |
| `/home/rhodes/rakathon-connect` | `feat/connect-transfer-vps`, HEAD `ca224f4`, **necommitnuté integrační změny** v App/src/testech a deploy podkladech. Zachovat. |
| `/home/rhodes/rakathon-pillgaze-ci` | `chore/pillgaze-ci-hygiene`, **necommitnuté změny** CI, README, CONTRIBUTING, testů a dokumentace. Zachovat. |

Poslední lokálně známé `origin/main`: **`87456dd`** (úklid nepoužité infra),
před ním **`e9f5c52`** (nová pacientská PWA). Toto není čerstvý dotaz na GitHub;
před integrací fetchni potřebnou větev.

**Veřejné UI je pořád z `e9f5c52`, ne automaticky z nejnovějšího `main`.**
Úklid `87456dd` už byl pushnut na `main`, ale nenasazoval aplikaci.

První Git kontroly:

```sh
git -C /home/rhodes/rakathon status --short --branch
git -C /home/rhodes/rakathon worktree list
git -C /home/rhodes/rakathon log -5 --oneline origin/main
```

Pro změny založené na aktuálním mainu použij vlastní worktree, např.:

```sh
git -C /home/rhodes/rakathon fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
git -C /home/rhodes/rakathon worktree add -b feat/TVUJ-UKOL /home/rhodes/rakathon-TVUJ-UKOL origin/main
```

Nejdřív ověř, že jméno větve a adresář nejsou obsazené. Před změnami čti
`/home/rhodes/AGENTS.md` a `AGENTS.md`/`CONTRIBUTING.md` v příslušném worktree.
Neprovádět reset, force push, mazání cizí práce nebo plošné formátování.
Commit identita je lokálně `DenisHromada <denhro@seznam.cz>`; zachovat zavedenou
identitu. Push/deploy provádět jen v rozsahu konkrétního zadání.

Hostový Git používá již nastavený `core.sshCommand` s configem pod
`/home/rhodes/github-runner/.secrets/`. Klíč funguje, není potřeba nový token.
**Klíč nečíst, netisknout, nekopírovat do repa, image ani runneru.**

## 4. Mapa zdrojového kódu na mainu

```text
apps/patient-web/public/      živá pacientská PWA (HTML/CSS/JS)
  app.js                     UI, galerie/webkamera, seznam, historie
  lists.js                   stav, localStorage, export, historie/migrace
  services.js                zatím fake recognizePhoto / sendList
  sw.js, manifest.webmanifest PWA / offline shell
apps/patient-web/server.mjs   lokální Node static server a jeho testovaný routing
App.tsx, index.ts, src/       samostatný původní Expo prototyp
apps/doctor-web/              místo pro budoucí rozhraní lékaře, zatím README
apps/transfer-demo/           pacient/lékař šifrované browser demo
services/transfer-api/        Rust/Axum API a SQLite migrace
packages/api-contract/        sdílený OpenAPI kontrakt transfer API
interaction-engine/          samostatné Rust/Axum API kontrol interakcí přes Codex
data/sukl/                   veřejný katalog léčiv + provenance metadata
data/ground-truth/           obrazové referenční anotace a párování s katalogem
tests/                       aplikační/PWA a SÚKL integrity testy
infra/vps/                   Compose provozní popis / generické image vstupy
```

Zdrojové soubory čti přes vlastní worktree z aktuálního mainu nebo
`git show origin/main:CESTA`, ne podle neověřeného obsahu hostového checkoutu.

## 5. Co kde běží na Hetzner VPS

Agent běží **přímo na VPS** jako `rhodes`, home `/home/rhodes`. NeSSHovat zpět
na tento host. ARM64 Linux, cca 2 CPU / 3,7 GiB RAM, bez swapu; buildy limitovat.

Veřejné adresy:

- **https://rakathon.denishromada.com** → `/pacient`.
- **http(s)://rakaton.denishromada.com** → hlavní HTTPS doména, zachová path/query.
- **https://rakathon.denishromada.com/deployment.json** → commit veřejného UI.
- Transfer API: **https://rakathon.denishromada.com/api/health/ready**.
- Transfer demo: **https://rakathon.denishromada.com/demo/patient** a `/demo/doctor`
  (samostatný klient obsluhovaný API, používat syntetická data).

```text
Cloudflare → gateway Nginx :80/:443
             ├─ denishromada.com          osobní statická homepage
             ├─ obed.denishromada.com     existující PHP Obed
             ├─ rakaton.denishromada.com  redirect na rakathon
             └─ rakathon.denishromada.com → rakathon-web :8080
                                            ├─ pacientská PWA
                                            └─ /api/* → pillgaze-transfer-api :3000
                                               /demo/*, /v1/*, /health/* → API
```

| Služba | Provozní konfigurace | Persistence / poznámka |
| --- | --- | --- |
| Gateway + homepage + Obed | `/home/rhodes/webserver/compose.yml`, `conf.d/site.conf` | Sdílený existující stack, nezasahovat kvůli běžnému UI refreshi. |
| `rakathon-web` | `/home/rhodes/rakathon-site/compose.yml` | Image obsahuje veřejné PWA soubory a Nginx, ne checkout ani Node server. |
| `pillgaze-transfer-api` | `/home/rhodes/pillgaze-transfer/compose.yml` | Image `pillgaze-transfer:8e86a84`, SQLite volume `pillgaze-transfer-data`. |
| Actions runner + egress | `/home/rhodes/github-runner/compose.yml` | Samostatný izolovaný stack, volume `rakathon-runner-data` obsahuje credentials/workspace. |

Živý frontend image při aktualizaci dokumentu:
`rakathon-web:redirect-fix-20261016T195929Z`, zdrojový commit `e9f5c52`.

Frontend má host bind **`127.0.0.1:8080`**, API **`127.0.0.1:3000`**.
**Veřejně neotevírat URL s `:8080` nebo `:3000`.** Port 8080 mluví HTTP uvnitř
VPS, veřejné TLS končí v gateway na 443. Jen gateway publikuje webové porty
80/443 na IPv4 i IPv6; SSH 22 je samostatný přístup hostu.

Frontend je na `denishromada-web` + `pillgaze-transfer-local`, API jen na své
síti. Runner nepatří do sítí webů. Kontejnery mají restart policy a přežijí
restart Dockeru; běh nezávisí na checkoutu, shellu ani tmux.

## 6. Aktualizace veřejného UI a kontroly

Z home directory:

```sh
./refresh-rakathon-ui.sh
./refresh-rakathon-ui.sh --status
./refresh-rakathon-ui.sh --rollback
```

Absolutní cesta `/home/rhodes/refresh-rakathon-ui.sh` funguje odkudkoli bez sudo.
Implementace: `/home/rhodes/rakathon-site/bin/deploy-ui.sh`.

Skript fetchne **`origin/main`**, ne lokální HEAD, z přesného commitu vezme
vybrané frontendové zdroje/testy a veřejný SÚKL katalog, spustí locked instalaci,
TypeScript, npm testy a JS syntax v omezeném non-root kontejneru. Instalace
používá `--ignore-scripts` a stávající egress proxy; testy běží bez sítě.
Nasazuje **`apps/patient-web/public`**, nikoli `npm run export:web` z Expo.
Nejdřív prověří image bez veřejného portu, pak obnoví pouze službu `web`.
API, databázi, gateway, DNS, firewall ani ostatní weby tento refresh nemění.

- `rakathon-site/.env` drží `WEB_IMAGE` (bez tajemství).
- `rakathon-site/logs/` obsahuje deploy logy.
- `rakathon-site/state/previous-image` drží rollback tag. Úspěšný deploy ponechá
  aktivní a předchozí image dané komponenty, starší tagy téže komponenty odstraní.
- Deploy logy starší než 30 dní se odstraňují po úspěšném deployi; chybové logy
  zůstávají pro diagnostiku. Volumes a globální build cache se automaticky nemažou.
- `.build/` je dočasný unikátní snapshot, po běhu se odstraní.
- Vyžaduje min. 2 GiB volného disku; souběžné spuštění blokuje `flock`.
- Image používá digest-pinned Nginx; build digest-pinned Node 24.
- Při výměně UI může být krátký výpadek jen Rakathonu.
- Nové frontendové adresáře/routy nebo závislosti vyžadující instalační skripty
  mohou vyžadovat úpravu snapshotu, allowlistu v Nginx a deploy postupu.

**Pozor na aktuální rollback:** uložený předchozí image je
`rakathon-web:main-e9f5c52c553d-20261016T195142Z-397330`, který má starou chybu
přesměrování na HTTP `:8080`. Běžný `--rollback` proto nyní nemá být používán
jako ověřený návrat bez kontroly; nová redirect kontrola jej má odmítnout.
Při skutečné obnově vybírat kompatibilní image s opraveným redirectem. Po dalším
úspěšném refreshi bude předchozí image dnešní opravená verze.

Rutinní nízkoobjemové kontroly a logy:

```sh
/home/rhodes/rakathon-site/bin/check.sh
/home/rhodes/webserver/bin/check.sh
/home/rhodes/rakathon-site/bin/compose.sh logs --tail=50
/home/rhodes/pillgaze-transfer/bin/compose.sh logs --tail=50 api
docker ps
df -h /
```

Kontroly ověřují origin HTTPS i celý redirect řetězec hlavní domény a aliasu.
Nevypisovat secret-bearing logy nebo request bodies. Pro veřejné ověření
použít omezený počet požadavků bez rychlých retry.

**Vyřešená chyba:** `return 302 /pacient` v backend Nginx původně vytvořil
absolutní `http://rakathon.denishromada.com:8080/pacient`. V
`rakathon-site/patient-nginx.conf` je nyní **`absolute_redirect off;`**.
Zachovat tuto opravu a testovat kořen `/`, ne pouze přímou cestu `/pacient`.
Gateway alias řeší 301 na kanonickou HTTPS doménu; neklonovat PWA na druhý
origin, jinak se rozdělí localStorage a service worker.

## 7. Transfer API: kontrakt, bezpečnost a obnova

Živý backend má vlastní uložený snapshot v `/home/rhodes/pillgaze-transfer/source`
a revizi v `SOURCE_REVISION`; není navázaný na dnes již odstraněný worktree
`rakathon-main`. `bin/build.sh` sestavuje tento snapshot, **ne nejnovější main**.
Detail: `/home/rhodes/pillgaze-transfer/README.md` (jeho úvod o neveřejném API
je historický; dnes je API proxované přes veřejné HTTPS).

- `POST /v1/transfers`: upload AES-256-GCM obálky, vrací retrieval code,
  revocation token, ID a expiraci.
- `POST /v1/transfers/redeem`: retrieval code + **`Idempotency-Key`**;
  stejný klient může do expirace opakovat vyzvednutí, jiný klíč už ne.
- `DELETE /v1/transfers/{transferId}`: revokace přes samostatný bearer token.
- `/health/live`, `/health/ready`: health/readiness.
- Ve veřejném UI prefix `/api` proxy odstraní, např. `/api/v1/transfers`.
- API dostává **jen ciphertext**. 256bitový klíč vzniká v klientovi a předává se
  lékaři zvlášť; nesmí být v API requestu, URL, logu ani analytice.
- Backend code má 12 znaků Crockford Base32; není to čtyřmístný PIN ani
  dešifrovací klíč. Neodvozovat šifrovací klíč z krátkého PINu.
- Default TTL je 15 minut, bounded 60–3600 s; delší/podstatně jiné chování
  vyžaduje koordinovanou změnu kontraktu a klientů.
- Rate limits bere ze socket IP, takže klienti za společnou proxy limit sdílí.
  U 429 respektovat `Retry-After`, neprovádět rychlé opakované testování.

Skutečný syntetický API test: `/home/rhodes/pillgaze-transfer/bin/check.sh`;
`--expiry` přidá minutové čekání. Mezi běhy počkat alespoň minutu.
Rutinní UI health check nemusí vytvářet přenosy.

**Zachovat** `pillgaze-transfer-data` a `.secrets/transfer.env`.
Změna HMAC secretu zneplatní dostupnost dosud vydaných kódů. Nepoužívat
`down -v`. Pravidelné DB zálohy a produkční monitoring zatím nejsou nastavené.
SQLite není implementovaný PostgreSQL adapter; schema migrace vyžadují plán návratu.

## 8. Interakce, SÚKL a výzkum

`interaction-engine/README.md` a `openapi.yaml` popisují samostatné API:
Rust/Axum, pro každý seznam jeden `codex exec --ephemeral`, modelový JSON výstup
validovaný Rustem, české vysvětlení. Vyžaduje Rust 1.91+ a autentizovaný Codex
CLI (vývojově 0.163.0). Testy používají fake executable; live smoke dělá skutečný
modelový požadavek a není rutinní health check.

**Modelové nálezy nejsou ověřené proti aktuální klinické databázi.** Výstup to
označuje `X-Interaction-Source: model-knowledge`, `X-Sources-Verified: false`.
Nevydávat jej za schválené medicínské doporučení. Default listener
`127.0.0.1:3000` by zde kolidoval s transfer API; při budoucím spuštění zvolit
jiný privátní bind a samostatně navrhnout sandbox, přístup a proxy. Nespouštět
jej automaticky jako součást UI refreshu.

`data/sukl/` má offline snapshot říjen 2026: cca 69 847 záznamů, 7 287 názvů.
Kódy jsou řetězce, zachovat počáteční nuly. Síla není dávkování. Katalog a
`metadata.json` měnit společně; integrity testy nejsou klinická validace.

`data/ground-truth/image-mapping.json`: 307 fotek obalů a 28 fotek seznamů,
**AI vizuální anotace čekající na lidskou kontrolu**, ne adjudikovaný ground truth.
SÚKL kandidát nebo unikátní metadata match není lidsky potvrzená identita.
Zachovat uncertain fields, splitGroup a oddělené tištěné/ručně psané pozorování;
nevyužívat kalibrační data potichu jako nezávislý held-out test.
Podklady `assets/` nebalit hromadně do veřejného webu, CI ani logů.

Knowledge base: samostatné repo **`olexamatej/rakathon-knowledgebase`**,
gitignorovaný lokální adresář `knowledge-base/`, pokud je v daném checkoutu
přítomný. Nenahrazovat jeho absenci tvrzením, že obsah byl přečten.
Pro literaturu používat dostupný `orx`; nejdřív načíst manuál `orx skill`,
pak např. `orx discover pubmed "dotaz"` nebo `orx paper ID --full`.
Lokální rešerše nevyžaduje `orx login`.

## 9. CI a bezpečné spouštění

Stack `/home/rhodes/github-runner`, registrovaný runner `rakathon-hetzner-arm64`:

```yaml
runs-on: [self-hosted, Linux, ARM64, hetzner-sandbox]
```

Na mainu jsou `repository-checks.yml` a `application-ci.yml`: kontroly
konfigurace/actionlint, Node 24, locked npm, TypeScript, testy, Expo export a
Rust transfer API testy s `--locked`. **CI není automatický deployment.**
Aktuální workflow číst přímo z mainu, nikoli ze starých runner README/logů.
Npm audit je viditelný, ale neblokující kvůli historickým upstream nálezům;
zelený build není čistý bezpečnostní audit. Nepoužívat `npm audit fix --force`.

Runner je non-root, read-only, resource-limited, bez Docker socketu, veřejných
portů a host mountů. Internet jen přes `rakathon-runner-egress`; izolovaná síť
blokuje přímý přístup k hostu/metadatům/privátním službám. Zachovat izolaci.
Po každém Actions jobu runner hook odstraní přesnou checkout cestu
`_work/<repo>/<repo>`, staré `_temp` položky po 24 hodinách a diagnostické logy
starší než 30 dní. Tool cache, Cargo/Rust cache, action cache a registration
credentials zůstávají persistentní a znovu se používají. Živý Actions workspace
a credential volume neslouží pro agentovo experimentování. Nedávat runneru
Docker přístup kvůli pohodlí a nestopovat jej během jobu.

**Pod hostovým `rhodes` nespouštět nedůvěryhodný kód repa ani npm/cargo testy**:
Docker group dává root-ekvivalentní oprávnění. Použít oddělený non-root sandbox,
bez socketu/credentials a širokých mountů; současný deploy skript je konkrétní
vzor pro frontend, ne univerzální bezpečné prostředí pro libovolný workload.

## 10. HTTPS, ostatní weby a mantinely hostu

- Cloudflare proxuje oba Rakathon názvy; CNAME při poslední práci nebyl měněn.
- Certifikát lineage `/etc/letsencrypt/live/rakathon.denishromada.com/`
  pokrývá `rakathon` i `rakaton`, platnost při aktualizaci do 14. 1. 2027.
- Jediný renewal timer **`snap.certbot.renew.timer`**, enabled/active.
- HTTP-01 webroot **`/opt/ssl_certs/denishromada`**, musí být obsluhovaný pro
  oba názvy před redirectem. Neinstalovat druhý renewal scheduler.
- Deploy hook `/etc/letsencrypt/renewal-hooks/deploy/20-denishromada-reload`
  validuje a reloaduje gateway; dry-run obou domén i hook byly ověřené.
- Reload po změně gateway: `/home/rhodes/webserver/bin/reload-gateway.sh`.
  Zálohovat cíleně, validovat před reloadem, nevracet celý starý config přes
  novější změny dalších agentů.
- Cloudflare má používat Full (strict); jeho aktuální nastavení z VPS nebylo
  nezávisle ověřené. Neprovádět nevyžádané změny DNS/firewallu/cert issuance.
- UFW je podle host guide disabled, provider firewall neověřený. Nezapínat
  vzdáleně firewall bez explicitního SSH allow pravidla; Docker porty mohou
  UFW obcházet. Nepředpokládat filtrování IPv4 ani IPv6.
- **Nesahat do `/home/rhodes/obed`**, jeho PHP runtime ani do legacy
  `/home/rhodes/compose.yml` a `/home/rhodes/nginx` kvůli Rakathonu.

Kubernetes se tu nepoužívá; případné zmínky a soubory jsou pozůstatky dřívějších návrhů.

Neprovádět broad upgrade, reboot ani globální image/volume prune. Rakathon deploy
po úspěchu čistí pouze staré image své komponenty a logy starší než 30 dní;
zachovává aktivní i předchozí rollback image, všechny volumes i globální cache.
Zachovat rollback images a volumes; secrets nikdy do chatu, Git nebo image.

## 11. Doporučený start každé nové session

1. Přečti tento soubor a `/home/rhodes/AGENTS.md`; vyjasni konkrétní úkol.
2. Ověř Git/worktrees a cizí dirty změny. Pracuj pouze z aktuálního mainu ve vlastním
   worktree; název adresáře `rakathon` sám nezaručuje správnou výchozí revizi.
3. Rozliš živou PWA, Expo prototyp, transfer API a interaction engine.
4. Pro infra úkol zkontroluj Compose, běžící kontejnery, disk, porty, DNS a
   relevantní provozní README. Pro čistě aplikační úkol nesahej do host stacků.
5. Implementuj jen zadání, testuj synteticky v sandboxu; při integraci koordinuj
   kontrakty a souběžnou práci. Push sám nic nenasazuje.
6. Deploy UI pouze pokud je součást zadání; kontroluj kořen webu, HTTPS redirect,
   alias a assets, ne jen `/pacient`. Po změně zaznamenej commit/image/testy.

Dlouhou práci vést v vlastní pojmenované tmux session: `tmux new -s JMENO`,
seznam `tmux ls`, attach `tmux attach -t JMENO`, detach Ctrl-b d, Ctrl-C pro
přerušení příkazu. Existující `opencode-rakathon` nezabíjet. Zánik tmux sám
nemusí zastavit kontejner spuštěný na pozadí; ověř jeho stav.

Další předávací zdroje:

- `/home/rhodes/rakathon-site/README.md` — aktuální UI, domény, deployment.
- `/home/rhodes/webserver/README.md` — sdílený gateway a ostatní weby.
- `/home/rhodes/pillgaze-transfer/README.md` — backend snapshot, kontrakt, obnova.
- `/home/rhodes/github-runner/README.md` — izolace a provoz runneru.
- `/home/rhodes/logs/vps-cleanup-20261016.md` — aktuální úklid a integrace do mainu.
- `/home/rhodes/logs/run1.md` až `run7.md`, `rakatohon-handover-1` — **historie**,
  některé návrhy/úkoly již neplatí; nepovažovat je za dnešní požadavek.

Udržuj tento soubor po významné změně aktuální: zejména nasazené revize,
integrace fake služeb, vlastnictví worktrees a způsob deploye. Neopisuj sem secrets.
