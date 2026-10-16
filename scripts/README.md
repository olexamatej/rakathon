# Deterministická mapa interakcí SÚKL → DDInter

Python 3.9+, bez dalších závislostí. Používá místní export DLP v `data/sukl/dlp/`
a jeho `data/sukl/metadata.json`. Aplikace Expo mapu zatím nenačítá.

```sh
# Stáhne chybějících 14 CSV do .local/ddinter/ a sestaví mapu.
python3 scripts/sukl_interactions.py build --download

# Opakované sestavení ze stejných místních vstupů nepotřebuje síť.
python3 scripts/sukl_interactions.py build

# Warfarin Orion + Ibalgin; doplní a uloží skutečný anglický popis DDInter.
python3 scripts/sukl_interactions.py check 0094113 0254290 --fetch-details

# Stejný dotaz pouze nad místními daty a již uloženými popisy.
python3 scripts/sukl_interactions.py check 0094113 0254290

# Testy se syntetickými vstupy, bez sítě a pacientských dokumentů.
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Vstupem jsou sedmimístné SÚKL kódy včetně úvodních nul. Duplicitní kódy v dotazu
se sloučí; neexistující nebo zkrácený kód způsobí chybu.

## Výstupy

- `exports/interactions/dataset.json`: `medications` mapuje SÚKL kód na složky
  a stav pokrytí; `substances` obsahuje přiřazení látky a cesty podání k DDInter
  ID, metodu shody nebo důvod odmítnutí; `interactions` obsahuje závažnost pro
  neuspořádané dvojice ID. `drugs` uchovává názvy DDInter.
- `exports/interactions/coverage.json`: počty, metody, důvody nepokrytí a SHA-256
  zdrojových souborů i pravidel. `snapshotId` je stejný pro stejné vstupy.
- Příkaz `check` vrací JSON na standardní výstup. Pole `map` má požadovaný tvar
  `suklKod → [{suklKod, popis, ...}]`. Doplňuje závažnost, DDInter ID, odkazy na
  zdroje, datum získání textu a případně management a reference.

Příklad výsledku bez dosud staženého textu:

```json
{
  "map": {
    "0094113": [{
      "suklKod": "0254290",
      "popis": null,
      "descriptionStatus": "missing",
      "zavaznost": "Major",
      "ddinterIds": ["DDInter1951", "DDInter900"],
      "zdroje": []
    }]
  }
}
```

Skutečný výstup navíc obsahuje opačný směr, `coverage` pro každý zadaný přípravek,
`snapshotId`, `errors` a `absenceMeansSafe: false`. U kombinovaných přípravků se
porovnávají všechny spárované složky; stejná dvojice DDInter ID se pro tutéž
dvojici přípravků neopakuje. Jeden partner může mít více položek, pokud se
interakce týká více různých dvojic složek.

`mapped` znamená nalezené přiřazení všech složek podle těchto pravidel;
`partial` jen některých, `unmapped` žádné nebo chybějící složení. **Nejde
o označení bezpečnosti nebo klinické ověření.** Pozitivní nálezy se vracejí
i při částečném pokrytí; chybějící látky zůstávají uvedené v `coverage`.

## Pravidla přiřazení

1. Přesný anglický název po sjednocení mezer a velikosti písmen.
2. Explicitní výjimky v `data/interactions/aliases.json`: paracetamol →
   acetaminophen s kontrolou CAS; potassium clavulanate → clavulanic acid
   s kontrolou přímé vazby SÚKL. Při změně očekávaného názvu, ID či identifikátoru
   generátor skončí chybou.
3. Jedna přímá vazba `dlp_soli` pouze tehdy, když celý název základní látky zůstává
   stejný a mění se jen povolený přívlastek soli/hydrátu. Uzavřený seznam je
   v `COUNTERIONS` a `HYDRATES` ve skriptu. Nejde o obecné procházení grafu ani
   o přibližnou shodu názvů. Estery jako abiraterone acetate a fluticasone
   propionate, stereoisomery a různé konjugáty se tímto pravidlem neslučují.

Systémová entita bez závorky se používá pouze pro `POR`, `IVN`, `IMS`, `SDR`.
Pro `DRM`, `OPH`, `NAS`, `AUR` je nutná explicitní entita DDInter `topical`,
`ophthalmic`, `nasal`, `otic`. Kombinace cest je přípustná pouze tehdy, pokud
každá vede ke stejnému ID. Ostatní cesty, včetně inhalací a transdermálních
náplastí, zůstávají nepokryté; systémová entita je nenahrazuje.

Pokud DDInter rozlišuje další formulace stejné látky, například liposomální
doxorubicin či paclitaxel vázaný na protein, obecná systémová shoda se odmítne
jako `formulation_requires_review`. Síla přípravku ani dávka pacienta se
nepoužívá k automatickému rozhodnutí o významnosti interakce; podmínky zůstávají
v původním popisu. Pravidla přiřazení nejsou klinicky validovaná.

## Popisy a síť

CSV obsahují jen dvojice a závažnost. `--fetch-details` načítá webový seznam
interakcí a HTML detaily pouze pro nalezené dvojice. Požadavky jsou postupné
s odstupem alespoň jedné sekundy; neposílají se fotografie ani pacientské údaje.
HTML parser ověřuje ID obou látek a čte označenou buňku `Interaction`.

Zdroj někdy obsahuje více detailních záznamů pro stejnou dvojici. Všechny se
zachovají prostřednictvím spojených odlišných textů a seznamu `zdroje`.
`sourceLevels` zaznamenává závažnost z webového seznamu; `levelConflict` označí
rozpor s CSV. Texty se nepřekládají ani nevytvářejí modelem.

Cache je v `.local/ddinter/indexes/` a `.local/ddinter/details/`. Chyba sítě nebo
změna HTML se objeví v `errors`, zachová pozitivní nález s `popis: null` a příkaz
skončí kódem 2. Ostatní chyby vstupů mají kód 1; úspěch kód 0. Bez příznaku
`--fetch-details` se síť nepoužívá, chybějící popis zůstává explicitně označený.
`Unknown` je skutečná hodnota závažnosti ve zdroji a není totéž co chybějící text.

Existující CSV a texty se automaticky neobnovují. Pro aktualizaci odstraňte
příslušné soubory z cache, znovu stáhněte vstupy a spusťte sestavení. Datum textu
a hashe vstupů umožňují zjistit, se kterou verzí se pracovalo. Webové rozhraní
není dokumentované veřejné API; případná změna vyžaduje úpravu parseru.

Zdrojové CSV, cache a generované exporty jsou lokální, gitignorované artefakty.
Do Gitu patří generátor, pravidla a testy. Data DDInter mají licenci
[CC BY-NC-SA 4.0](https://ddinter2.scbdd.com/terms/); komerční použití je potřeba
řešit zvlášť. Ani export všech 14 CSV neodpovídá počtem úplné databázi uváděné
na webu. Chybějící hrana neznamená bezpečnou kombinaci.

Podklady a ověřené limity zdrojů jsou v
[poznámce z průzkumu](../docs/research/ddinter-mapping.md).
