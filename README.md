# PillGaze · Rakathon 2026

Základ pacientské aplikace a náhledu pracovního rozhraní lékaře v React Native / Expo / TypeScript. Vychází ze [zadání PillGaze](assets/RAKATHON_2026_MOU_Rusinko.md) a [prezentace](assets/Rakathon_Rusinko_prezentace.md).

## Spuštění

Node.js 22.13+ (ověřeno na 24), npm. Bez účtu, API klíčů a backendu.

```sh
npm ci
npm start          # QR kód pro Expo Go; telefon a počítač na stejné síti
npm run web       # webový server; vypsanou adresu otevřete ručně v prohlížeči
```

`npm run android` otevře Android emulátor; `npm run ios` vyžaduje macOS s Xcode. Použité Expo SDK 57 odpovídá doporučení pro Expo Go na fyzickém telefonu během přechodu na SDK 58 ([Expo, 16. 10. 2026](https://docs.expo.dev/get-started/create-a-project/)).

Webový skript používá `BROWSER=none`, aby fungoval i na Linuxu bez grafického prostředí, kde automatické `xdg-open` selhává kódem 3. Na Linuxu/macOS otevřete vypsanou adresu (obvykle `http://localhost:8081`) ručně. V PowerShellu spusťte `$env:BROWSER='none'; npx expo start --web`.

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

- `App.tsx` — obrazovky, stav, fotografie, lokální předání a schránka.
- `src/ui.tsx` — společné komponenty, editor a styly.
- `src/medication.ts` — datový model, validace, export a demo předání.
- `tests/medication.test.ts` — validace, export, podmínky předání, expirace a oddělení kopií.
- `assets/` — původní zadání a modelová data; hromadné fotografie se do aplikace nebalí.

```sh
npm run typecheck
npm test
npm run export:web
npx expo install --check
npx expo export --platform ios --platform android --output-dir /tmp/pillgaze-native-export
```

Export pro iOS/Android ověřuje JS bundle, nikoli nativní sestavení nebo fotoaparát na zařízení.

`npm audit` k 16. 10. 2026 hlásí 22 položek (15 high, 7 moderate), odvozených z `braces`, `node-forge` a `uuid` ve vývojových nástrojích Expo/Metro/Xcode. Nabízené vynucené opravy snižují Expo na SDK 44 a React Native na 0.72; nebyly aplikovány. Před nasazením znovu ověřte opravy upstreamu.

## Výzkumné podklady

`knowledge-base/` je gitignorovaný lokální klon týmového Fieldnotes workspace; není potřeba ke spuštění aplikace. Pokyny k práci s ním jsou v `AGENTS.md`.
