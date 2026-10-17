# Lokální UI proti nasazenému backendu

Pacient, lékař a storage admin běží z vašeho lokálního checkoutu. API používají
nasazený backend; nemusíte spouštět Rust, databázi ani konfigurovat CORS.

**Tento režim není datový sandbox.** Upload ukládá záznam do živé databáze,
admin mazání jej skutečně odstraní a „Smazat vše“ odstraní všechny aktuální
bloby. Používejte pouze syntetická data, nikoli skutečné pacientské seznamy
nebo fotografie. Rozpoznávání a interakce mohou volat placeného poskytovatele.

## 1. Spuštění

Potřebujete Node.js 24, npm a přístup k internetu. V kořeni repozitáře:

```sh
git switch main
git pull --ff-only
npm run web:remote
```

Větev přepínejte jen v checkoutu bez rozpracovaných změn; pro vývoj lze příkaz
spustit i z vlastní pracovní větve založené na aktuálním `main`.
Web nemá externí npm závislosti, takže pro spuštění není potřeba `npm install`.
Docker ani backendové credentials nejsou potřeba.

Otevřete:

| UI | Lokální URL |
| --- | --- |
| Pacient | http://localhost:8081/pacient |
| Lékař | http://localhost:8081/lekar |
| Storage admin | http://localhost:8081/storage-admin |

Server vypnete pomocí `Ctrl+C`. Změny veřejných HTML/CSS/JS souborů uvidíte po
obnovení stránky; není tu HMR. Po změně serveru nebo `.env` jej restartujte.
Katalogy server načítá do paměti, jejich změna také vyžaduje restart.

## 2. Co je lokální a co vzdálené

```text
prohlížeč → http://localhost:8081
              ├─ HTML/CSS/JS pacienta, lékaře a adminu z checkoutu
              ├─ veřejné katalogy SÚKL a režimů z checkoutu
              └─ /api/* → https://rakathon.denishromada.com/api/*
                              └─ nasazená gateway směruje na příslušné služby
```

Proxy podporuje storage upload a čtení přes PIN, admin listing/mazání, health,
přepis fotografií a kontrolu/výzkum interakcí. Předává také query parametry,
například stránkovací `offset`. Neproxyuje libovolné URL nebo jiné webové cesty.

- Browser volá pouze vlastní localhost origin. Nehardcodujte vzdálené API URL
  do browserového JS a neoslabujte produkční CORS nebo CSP.
- JSON a fotografie se předávají bez změny obsahu; statusy a `Retry-After`
  z backendu se zachovávají. Proxy nemá automatické retry a nesleduje redirecty.
- Remote režim směruje podporované API cesty na jeden nasazený origin,
  i když máte nastavené `TRANSCRIBE_API_URL` nebo `INTERACTION_API_URL`.
  Volbu demo/skutečného rozpoznávání v samotném UI nijak nepřepíná.
- LocalStorage a sessionStorage patří lokálnímu originu, nikoli veřejnému webu.
  Historie a rozepsaný seznam se z veřejného webu automaticky nepřenášejí.
  Ani `localhost` a `127.0.0.1` nejsou stejný browserový origin.
- Nový PIN ze storage můžete ručně použít i na nasazeném webu a naopak,
  pokud obě UI používají tentýž backend a kompatibilní formát seznamu.

## 3. Konfigurace

Bez konfigurace `npm run web:remote` používá backend
`https://rakathon.denishromada.com`, port `8081` a bind `127.0.0.1`.

Pro jiný backend nebo port vytvořte v kořeni repozitáře lokální `.env`
(je gitignorovaný). Soubor `.env.example` obsahuje další možnosti;
existující `.env` nepřepisujte:

```dotenv
WEB_BACKEND_URL=https://rakathon.denishromada.com
PORT=8081
HOST=127.0.0.1
```

`WEB_BACKEND_URL` musí být HTTP(S) **origin bez `/api`, další cesty,
query, fragmentu a credentials**. Cílový server musí vystavovat stejné `/api/`
cesty jako nasazená webová gateway, nikoli pouze přímé Rust `/v1/` endpointy.
Pro vzdálený backend používejte HTTPS; HTTP je vhodné pouze pro důvěryhodné
lokální prostředí. URL může například odkazovat na kompatibilní staging gateway,
pokud ji tým zřídí; tento postup žádný staging sám nevytváří.

Nastavení `WEB_BACKEND_URL` aktivuje remote proxy také pro `npm start`.
Bez této proměnné a bez `--remote` zůstává původní režim: UI plus samostatné
proxy přepisu a interakcí, ale bez storage proxy a lokálního adminu.

### Admin a přístup z jiného zařízení

Admin heslo zadávejte pouze do přihlašovacího formuláře. Používá stejné heslo
jako nasazený admin. Neukládejte je do URL, `.env`, Gitu nebo logů.
Formulář uchovává přístup v sessionStorage dané karty, nejvýše po původních
15 minut; logout a odmítnuté credentials jej odstraní.

Proxy předává Authorization pouze admin API, nepředává cookies ani klientské
forwarding headers. Sama ale nepřidává další přihlášení k lokálnímu serveru.
Spouštějte ji jen s důvěryhodným lokálním kódem a na důvěryhodném počítači.
Loopback není plnohodnotná autentizační nebo sandboxová hranice.

Výslovné `HOST=0.0.0.0` otevře server v síti, včetně proxy a admin formuláře.
Nedoporučujeme to jako běžný postup, zejména ne na veřejném VPS. Kamerový přístup
a PWA mimo localhost vyžadují HTTPS; pro mobilní vývoj nejprve navrhněte
chráněný HTTPS přístup. Nepovolujte přímo veřejné porty backendových kontejnerů
a nevypínejte ověřování TLS kvůli lokálnímu vývoji.

## 4. Nízkorizikové ověření a řešení problémů

Nejprve otevřete lokální UI a v prohlížeči jednou navštivte
http://localhost:8081/api/health/ready. Úspěšný HTTP status ověří proxy i backend;
health odpověď může mít prázdné tělo. Nemusíte kvůli tomu vytvářet blob.

Pro ověření předání použijte jediný syntetický seznam, odešlete jej z pacienta
a vydaný PIN načtěte v lékařském UI. Pokud testovací záznam uklízíte přes admin,
odstraňte pouze svůj záznam, nikdy „Smazat vše“. Automatizované testy proti živému
backendu tímto příkazem nespouštějte; izolované E2E popisuje [e2e/README.md](e2e/README.md).

| Problém | Co zkontrolovat |
| --- | --- |
| Port je obsazený (`EADDRINUSE`) | Změňte `PORT` v `.env`, restartujte server a otevřete nový port. |
| Upload/admin nefunguje, API vrací lokální 404/405 | Použijte `npm run web:remote`, zkontrolujte cílový backend ve startovacím výpisu. |
| HTTP 502 | Zkontrolujte internet, správný backend origin, TLS a jeho dostupnost. Proxy odmítá redirecty; nastavte přímo konečný origin. Neprovádějte rychlé opakované uploady. |
| HTTP 401 v adminu | Ověřte heslo nebo se po expiraci znovu přihlaste; nejde o jiný lokální účet. |
| HTTP 404 při čtení PINu | PIN neexistuje, byl smazán nebo UI používají různé backendy. |
| HTTP 429 | Počkejte podle `Retry-After`. Backend rate limits mohou být sdílené pro klienty za gateway. |
| HTTP 413 | Storage payload má limit 1 MiB; fotografie pro transcribe 20 MiB. Další limity může vynucovat backend. |
| Vidíte staré UI | Zkontrolujte checkout, obnovte stránku bez cache; případně v DevTools zrušte starý service worker pro localhost. Nemazejte storage, pokud chcete zachovat rozepsaný seznam. |

Ověření implementace na běžném vývojářském počítači:

```sh
npm test
node --test apps/storage-admin/tests/*.test.mjs
```

Tyto testy používají fake upstream na loopbacku, nikoli živý backend. Na tomto
VPS se repo testy spouštějí pouze v non-root sandboxu podle [CONTRIBUTING.md](CONTRIBUTING.md).

## 5. Proč proxy, a co by bylo lepší do budoucna

**Same-origin dev-server proxy je běžný oborový postup**, například přes
`server.proxy` ve Vite nebo `devServer.proxy` ve webpacku. Prohlížeč používá stejné
relativní API cesty jako při nasazení; cílové prostředí vybírá serverová konfigurace.
Není potřeba zveřejňovat credentials nebo přidávat localhost do produkčního CORS.

V tomto repozitáři už existuje malý Node server a HTML/JS aplikace bez bundleru.
Proto je rozšíření tohoto serveru o úzce vymezenou proxy přiměřenější než zavádět
Vite pouze kvůli směrování API. **Není to univerzální reverse proxy**: explicitní
allowlist metod/cest a hlaviček je nutné aktualizovat při změně API. Těla se
bufferují do paměti; řešení není určeno pro velké streamy, WebSockety nebo SSE.

Alternativy a doporučené další kroky, nikoli již implementované funkce:

1. **Oddělený staging se syntetickou DB je nejdůležitější zlepšení.** Stejný
   příkaz by mířil přes `WEB_BACKEND_URL` na staging a vývoj by neohrožoval živá
   data. Izolované E2E má dál používat dočasný backend/databázi, ne staging ani produkci.
2. **Vite/HMR má smysl při skutečné potřebě bundleru nebo rychlého reloadu.**
   Pak lze proxy převést na standardní dev-server konfiguraci. Pro složitější
   transport lze zvolit udržovanou proxy knihovnu místo rozšiřování vlastního
   kódu, po kontrole streamingu, hlaviček, limitů, timeoutů a redirectů.
3. **Sdílený vývojový přístup potřebuje další ochrany.** Před použitím tunelu/LAN
   doplnit autentizaci, HTTPS a kontrolu Host/Origin; současný server je určen
   pro důvěryhodný lokální vývoj, ne jako veřejná služba.
4. Přímé browserové volání vzdáleného API s CORS může být vhodné pro API určené
   třetím stranám. Pro tuto same-origin aplikaci přináší zbytečné změny CORS/CSP
   a rozdíly oproti nasazení. SSH tunel je vhodný pro neveřejný backend, ale zde
   již existuje HTTPS gateway; Docker stack je vhodný pro offline/izolované
   testy, ne nutný pro lokální UI proti nasazenému backendu.

Tento návod ani spuštění lokálního serveru nic nenasazuje, nemění produkční
proxy, DNS, firewall či certifikáty. Push do `main` také není deployment.
