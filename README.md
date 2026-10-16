# PillGaze · Rakathon 2026

Základ pacientské aplikace a náhledu pracovního rozhraní lékaře v React Native / Expo / TypeScript. Vychází ze [zadání PillGaze](assets/RAKATHON_2026_MOU_Rusinko.md) a [prezentace](assets/Rakathon_Rusinko_prezentace.md).

[Checklist zadání](docs/requirements.md) · [Architektura systému](architecture.md) · [Transfer API](services/transfer-api/README.md) · [Pravidla spolupráce a CI](CONTRIBUTING.md) · [Katalog SÚKL](data/sukl/README.md)

## Spuštění

Node.js 22.13+ (ověřeno na 24), npm. Bez účtu, API klíčů a backendu.

```sh
npm ci
npm start          # QR kód pro Expo Go; telefon a počítač na stejné síti
npm run web       # webový server; vypsanou adresu otevřete ručně v prohlížeči
```

`npm run android` otevře Android emulátor; `npm run ios` vyžaduje macOS s Xcode. Použité Expo SDK 57 odpovídá doporučení pro Expo Go na fyzickém telefonu během přechodu na SDK 58 ([Expo, 16. 10. 2026](https://docs.expo.dev/get-started/create-a-project/)).

Webový skript používá `BROWSER=none`, aby fungoval i na Linuxu bez grafického prostředí, kde automatické `xdg-open` selhává kódem 3. Na Linuxu/macOS otevřete vypsanou adresu (obvykle `http://localhost:8081`) ručně. V PowerShellu spusťte `$env:BROWSER='none'; npx expo start --web`.

## Pacientská PWA

Nové webové UI v `apps/patient-web/public/` lze spustit samostatně bez instalace závislostí:

```sh
# Node.js 24; vyplňte GEMINI_API_KEY v .env
cp .env.example .env # pouze pokud ještě neexistuje
npm run web:patient
# http://localhost:8081/pacient
```

Fotografie z galerie nebo fotoaparátu přidají léčiva do seznamu. Na počítači
fotoaparát otevře náhled webkamery, na telefonu systémový fotoaparát. Položky lze
odstranit; seznam a historii odeslání uchovává localStorage tohoto prohlížeče.
Volitelný režim onkologické léčby má našeptávání z HemOncKB a uchovává se také
v historii odeslání. Poslední PIN lze znovu otevřít a zkopírovat.
Volitelný rozpis užívání (např. `1-0-0`) se zobrazuje u léčiva a v historii;
pokud je vyplněný, textové předání přidá sloupec **Kdy**.
Instalace PWA a přístup k webkameře vyžadují HTTPS nebo localhost.

Fotografie se odesílá přes `POST /api/transcribe` do serverového adaptéru Gemini
3.6 Flash. Server načítá klíč `GEMINI_API_KEY` a model `GEMINI_MODEL` z kořenového
`.env`; klíč se nikdy neposílá do prohlížeče. Rozpoznávání vrací pouze
`[{"name":"Concor 5 mg","schedule":"1-0-0"}]`; nečitelné údaje jsou `null`.
Viditelná síla zůstává v názvu. Samostatná síla a počet dávek v balení zůstávají
prázdné a neblokují předání; řádek s nečitelným názvem je nutné odebrat a vyfotit znovu.
Podrobnosti: [Gemini transcription](docs/gemini-transcription.md). „Odeslat seznam“
uloží verzovaný strukturovaný JSON `{ version: 1, regimen, items }` přes
`POST /api/v1/transfers`. Každá položka obsahuje pouze název, dávkování, počet
dávek v balení a případný rozpis užívání; lékař tyto položky načte a vykreslí.
PIN vrací storage API a PWA jej zobrazí i uloží do historie až po úspěšném
odeslání. Blob lze vyzvednout přes `GET /api/v1/transfers/{pin}`. Lékař nadále
umí načíst i dřívější textový formát `{ text }`.
Používejte pouze syntetická data: storage nevynucuje šifrování ani expiraci.
Lokální Node server obsluhuje UI, rozpoznávání a proxy interakcí; předání seznamu
vyžaduje stejný origin s `/api/v1/` proxy na storage. Automatické opakování odeslání není zapnuté.
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
Změna látek zneplatní načtené interakce; úprava dávkování je zachová.
Interakce se načítají z interaction API; po otevření podrobností se prohledají
podporované weby. Jejich stav se zobrazuje v pills a odkaz se shrnutím se objeví
jen u nalezené stránky. Lokální server používá proxy na `INTERACTION_API_URL`
(výchozí `https://rakathon.josefkuchar.com`).

## Co funguje

- České rozhraní s částmi Moje léky, Podklady a Předání.
- Pořízení fotografie / výběr obrázku, náhled a odstranění podkladu; volba krabičky nebo seznamu. Na webu závisí otevření fotoaparátu na prohlížeči, galerie používá výběr souboru.
- Ruční přidání, úprava, odstranění a potvrzení léku. Název, síla a dávkování jsou samostatná textová pole; dávkování se automaticky neinterpretuje.
- Výslovně označená ukázková data z modelového seznamu „Pacient 1“ v `assets/Data/50_Pacientu.md`.
- Lokální ukázka čtyřmístného PINu s platností 3 minuty, jedním použitím a zneplatněním při změně pacientova seznamu. Předání vyžaduje potvrzení všech položek.
- Lékař převezme nezávislou pracovní kopii, může ji editovat a zkopírovat text s tabulátory do dokumentace.

## Rychlé demo

1. V části Pacient zvolte **Vyzkoušet ukázkový seznam**.
2. U jednotlivých léků potvrďte údaje, případně je upravte tužkou.
3. Přejděte do **Předání** a vytvořte demo PIN.
4. Ve stejné otevřené aplikaci přepněte nahoře na **Lékař** a PIN zadejte.
5. Upravte pracovní seznam a zvolte **Zkopírovat do schránky**. Na webu schránka vyžaduje localhost nebo HTTPS; při odmítnutí lze text označit ručně.

## Hranice tohoto základu

Jde o lokální prototyp, nikoli celé soutěžní MVP. PIN nefunguje v jiné kartě, telefonu ani počítači a není bezpečnostním mechanismem. Žádné fotografie ani seznamy aplikace neodesílá na server. Stav žije jen v paměti; reload/restart ho smaže. Snímky mohou být dočasně v cache systémového pickeru, odstranění podkladu odstraní náhled, nikoli původní soubor v galerii.

OCR, slučování údajů s vahami spolehlivosti, databázová validace léčiv, kontrola interakcí a rozpoznávání onkologických režimů nejsou implementované. UI neukazuje smyšlené rozpoznané léky, míru jistoty ani tvrzení o bezpečnosti kombinace. Používejte modelová data, ne identifikovatelné zdravotní záznamy.

Další kroky podle zadání:

1. Zapojit zpracování fotografií, uvádět původ a spolehlivost jednotlivých polí a řešit konflikty před potvrzením. Před odesíláním obrazů vyřešit odstranění osobních údajů.
2. Nahradit `createDemoHandoff` / `receiveDemoHandoff` skutečným anonymním přenosem mezi zařízeními. PIN vydávat na serveru, omezit pokusy, řešit kolize, atomické jednorázové převzetí, expiraci a mazání; žádné dlouhodobé externí ukládání seznamů.
3. Připojit externí klinické zdroje pouze v rozhraní lékaře a výsledky zobrazovat odděleně od původního seznamu, na vyžádání.
4. Doplnit chráněné lokální uložení pro opakované použití a otestovat oprávnění fotoaparátu a obnovu aplikace na telefonech.

## Kód a ověření

```text
App.tsx, index.ts       Expo vstup, obrazovky a stav aplikace
src/                   Sdílené UI a pravidla pro seznam léků / demo předání
tests/                 Testy logiky a offline kontrola veřejného katalogu
docs/                  Checklist požadavků, nikoli potvrzení jejich implementace
data/sukl/             Veřejný katalog léčiv a metadata jeho původu
assets/                Původní zadání, modelové seznamy a fotografie
.github/               CI workflows a PR checklist
```

Katalog SÚKL je připravený pro další vývoj, ale aplikace ho zatím nepoužívá.
Jeho záznamy rozlišují síly a varianty balení pomocí kódu SÚKL; nejde o seznam
pacientů, doporučené dávkování ani databázi interakcí. Podrobnosti a pravidla
aktualizace jsou v [popisu katalogu](data/sukl/README.md).

Původní podklady v `assets/` se hromadně nebalí do aplikace a CI je nečte.
Lokální `knowledge-base/` není potřeba ke spuštění ani testům.

```sh
npm run typecheck
npm test
npm run export:web -- --max-workers 1
npx expo install --check
npx expo export --platform ios --platform android --output-dir /tmp/pillgaze-native-export
```

Export pro iOS/Android ověřuje JS bundle, nikoli nativní sestavení nebo fotoaparát na zařízení.

Při pushi a PR do `main` nebo `pillgaze` běží kontroly repozitáře a aplikační CI: instalace
z lockfilu, TypeScript, testy a webový export na Node.js 24. Nic se automaticky
nenasazuje. Na tomto VPS spouštějte instalaci a testy v izolovaném sandboxu,
nikoli pod host účtem s přístupem k Dockeru; viz [CONTRIBUTING.md](CONTRIBUTING.md).

`npm audit` k 16. 10. 2026 hlásí 22 položek (15 high, 7 moderate), odvozených z `braces`, `node-forge` a `uuid` ve vývojových nástrojích Expo/Metro/Xcode. Nabízené vynucené opravy snižují Expo na SDK 44 a React Native na 0.72; nebyly aplikovány. Před nasazením znovu ověřte opravy upstreamu.

Audit je v CI viditelný, ale zatím neblokující. Zelený build neznamená čistý
bezpečnostní audit; nepoužívejte `npm audit fix --force`.

## Výzkumné podklady

`knowledge-base/` je gitignorovaný lokální klon týmového Fieldnotes workspace; není potřeba ke spuštění aplikace. Pokyny k práci s ním jsou v `AGENTS.md`.

## Nasazení na VPS

Živé demo je **https://rakathon.denishromada.com** a používá Docker Compose,
nikoli Kubernetes. Frontend a Rust API mají oddělené Compose projekty;
pushe do repozitáře je automaticky nemění. Provozní cesty, ruční aktualizaci
frontendu a návrat popisuje [VPS průvodce](infra/vps/README.md).
Nepoužité AKS/k3s podklady a jejich deploy workflow byly odstraněny.
