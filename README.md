# PillGaze · pacient

Malá pacientská PWA bez závislostí. Funguje v mobilním prohlížeči a lze ji přidat na plochu jako aplikaci.

[Checklist zadání](docs/requirements.md) · [Pravidla spolupráce a CI](CONTRIBUTING.md) · [Katalog SÚKL](data/sukl/README.md)

## Spuštění

Node.js 22.13 nebo novější; není potřeba instalovat balíčky ani sestavovat bundle.

```sh
npm run web
# http://localhost:8081/pacient
npm test
```

Server neotevírá prohlížeč automaticky. Jiný port: `PORT=8082 npm run web`.
Na tomto VPS spouštějte příkazy v sandboxu podle [CONTRIBUTING.md](CONTRIBUTING.md).

## Flow

- `/pacient` rovnou otevře jeden hlavní seznam. Nový uživatel začíná s prázdným seznamem; vracejícímu se obnoví poslední uložené položky včetně rozpracovaných úprav.
- Fotoaparát nebo galerie přidají snímky do hlavního seznamu, galerie podporuje více fotografií. Každý snímek se zpracovává zvlášť a může vrátit více léčiv.
- Výsledek obsahuje název léčiva, dosage (sílu / dávkování) a počet dávek v balení. Položky lze upravit a odstranit.
- **Odeslat seznam** se zpřístupní při alespoň jedné kompletní položce a po dokončení zpracování. Připraví text a otevře samostatnou obrazovku se šestimístným PINem z demo služby a tlačítkem **Domů**, které vrací na hlavní seznam. Odeslání seznam nevyprázdní.
- Malá záložka **Odeslání** obsahuje datum, PIN a rozbalovací kopii odeslaných položek. Pozdější úpravy hlavního seznamu tyto kopie nemění.
- Hlavní seznam i historie odeslání se průběžně ukládají společně do localStorage pod klíčem `pillgaze:patient:v2`. Při přechodu ze starší verze se jednorázově převezme naposledy upravený seznam a dostupná odeslání; původní záznamy `pillgaze:list:v1:<id>` se nemažou. I prázdný poslední seznam zůstane prázdný.
- Chyba ukládání je viditelná. Poškozená aktuální data se nepřepisují a úpravy zůstanou zablokované do úspěšného načtení. Vymazání dat prohlížeče odstraní seznam i historii odeslání; data se nesynchronizují mezi zařízeními či prohlížeči.

## Placeholdery

- `TODO(model)` v `public/services.js`: nahradit `recognizePhoto(file)` lokálním modelem nebo externím API. Nyní každý čitelný obrázek vrací dvě fiktivní položky Alfa/Beta, bez analýzy obsahu. UI to označuje jako demo.
- `TODO(server)` v `public/services.js`: `sendList(text)` má odeslat pouze text a vrátit serverový PIN. Zatím nic neodesílá a PIN vzniká lokálně; neslouží ke skutečnému předání seznamu.

Fotografie se neukládají do localStorage ani neposílají na server. Dočasné náhledy žijí jen v paměti. Po reloadu zůstávají již přepsané položky; probíhající zpracování je nutné zopakovat. Fotky mají limit 20 MB; nečitelný formát má chybový stav. Používejte ukázková data.

## Instalace a hosting

Instalaci otevře ikona vpravo nahoře. Na iOS použijte Safari → Sdílet → Přidat na plochu; na Androidu nabídku instalace prohlížeče. Fotoaparát používá systémový výběr souboru s `capture="environment"`; na počítači se může otevřít běžný dialog pro soubory.

Instalace a service worker vyžadují HTTPS (nebo localhost). Samotné HTTP přes LAN stačí pro náhled, ne pro ověření instalace. Po prvním online načtení se ukládá pouze aplikační shell pro offline použití. Jde o instalaci PWA z prohlížeče; APK ani balíček pro App Store se negeneruje. Viz [požadavky PWA](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) a [podpora fotoaparátu](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/capture).

Pro hosting vystavte pouze `public/`, mapujte `/pacient` a `/pacient/` na `index.html` a zachovejte soubory v kořeni URL. Nevystavujte kořen repozitáře. Přiložený Node server používá explicitní seznam veřejných souborů. Při změně shellu zvyšte verzi cache v `public/sw.js`.

## Podklady

Katalog SÚKL je připravený pro další vývoj, ale aplikace ho zatím nepoužívá.
Jeho záznamy rozlišují síly a varianty balení pomocí kódu SÚKL; nejde o seznam
pacientů, doporučené dávkování ani databázi interakcí. Podrobnosti a pravidla
aktualizace jsou v [popisu katalogu](data/sukl/README.md).

[Zadání](docs/requirements.md), `assets/`, `data/`, výzkumné `scripts/` a jejich Python testy zůstávají nezávislé na aplikaci. Pokyny k výzkumu a `knowledge-base/` jsou v [AGENTS.md](AGENTS.md).
