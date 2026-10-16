# OUTLIER · Když realita překoná prognózu

Lokální pracovní přehled pro výzvu dětské onkologie FN Brno. Z dodaných CSV
odhaduje očekávanou zátěž péče, řadí neobvyklé průběhy, ukazuje vysvětlení
jednotlivce i skupin a ukládá odborná hodnocení. Aplikace funguje bez API klíčů,
externích služeb, frontendového buildu a připojení k internetu po instalaci závislostí.

## Spuštění

Python 3.10+; ověřeno na Pythonu 3.12, NumPy 1.26.4 a SciPy 1.11.4.

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py
```

Otevřít **http://localhost:8000**. Pokud už prostředí obsahuje NumPy a SciPy,
stačí `python app.py`. Jiný port: `python app.py --port 8001`.

Vstupy jsou `assets/patients.csv`, `assets/episodes.csv`, `assets/labs.csv` a
`assets/datapackage.json`. Alternativní umístění: `--data-dir /cesta/k/datum`.
Server je úmyslně dostupný pouze na `127.0.0.1`, ne v síti.

```bash
# CSV celé kohorty včetně vysvětlení, nejistoty a hodnocení, bez spuštění serveru:
python app.py --export exports/outliers.csv

# Testy se syntetickými pacienty:
OPENBLAS_NUM_THREADS=1 python -m unittest discover -s tests -v
node --check web/app.js
```

## Průchod demem

1. **Přehled případů:** graf očekávání proti skutečnosti a seřazená fronta kandidátů.
   Kliknout na bod nebo pseudonym. Filtry umí oba směry odchylky, hledání,
   celou kohortu, omezená data i stav hodnocení.
2. **Detail:** očekávané a skutečné dny, predikční interval, počet referenčních
   pacientů se stejnou diagnózou a stabilita při posunu indexu. Přesný aditivní
   rozklad předpovědi podle diagnózy, věku a pohlaví; popis skutečné péče oproti
   referenci, časová osa a dostupná laboratoř.
3. **Posouzení:** stav, komentář a zpochybněné údaje. „Klinicky zajímavé“ ponechá
   případ v aktivní frontě. „Nezajímavé“ jej skryje z výchozí fronty a vyřadí ze
   skupin, ale zachová jako platné pozorování pro model. „Chyba dat“ navíc vyřadí
   pacienta z trénování i kalibrace a přepočítá očekávání, intervaly a pořadí.
   Návrat na „Neposouzeno“ účinek vrátí. Zaškrtnutí sporného údaje samo hodnotu
   neopravuje; jde o úkol k odbornému ověření.
4. **Skupiny odchylek:** shluky vznikají pouze mezi aktivními kandidáty,
   s porovnáním charakteristik vůči celé srovnatelné kohortě. Jednočlenná skupina
   je explicitně označená jako jednotlivý případ.
5. **Model a kvalita dat:** definice, validační metriky, datové výluky a zdroje.
6. **Exportovat CSV:** celá kohorta, včetně vyřazených případů a uložených poznámek.
   Export respektuje aktuální model po zpětné vazbě, ne filtr tabulky.

Hodnocení jsou uložena v `.local/reviews.sqlite3`, oddělená otiskem vstupních CSV.
Přežijí restart. `--state-dir` umožní vlastní soukromé úložiště. Souběžné přepsání
změněného hodnocení se odmítne; uživatel musí načíst aktuální verzi.

## Co přesně měříme

**Výsledek:** počet unikátních dnů ve vícedenních epizodách během 365 dnů od
první epizody s hlavní diagnózou shodnou s prvním nádorovým záznamem pacienta.
Sjednocujeme intervaly `[day_start, day_end)` a ořezáváme je na roční okno.
Překryvy se nepočítají dvakrát. Délky neznámých pobytů nedoplňujeme nulou.

CSV nemá typ epizody. `day_end > day_start` je zástupný znak vícedenního pobytu;
záznamy stejného dne nelze rozlišit na ambulanci a jednodenní hospitalizaci.
Proto nepředstíráme přesný počet všech hospitalizací ani readmisí. Úmrtí není
vhodný endpoint při jediném výskytu a nevstupuje do modelu.

**Index není datum diagnózy ani začátku léčby.** Před první onkologickou epizodou
se často nachází roky jiné péče. Pro srovnání požadujeme doložený kontakt alespoň
371 dnů po indexu (365 + konzervativní 6denní rezerva pro relativní posun dvou
záznamů). Ani pozdní kontakt nedokazuje úplný záchyt péče ve FN Brno nebo mimo něj.

Z reference a řazení vylučujeme chybějící index, krátký rozsah sledování,
neznámý konec pobytu, který mohl zasahovat do okna, a více nádorů u jednoho
pacienta. Poslední podmínka zabraňuje dvojímu počítání a nejasnému přiřazení péče.
Všichni pacienti přesto mají odhad očekávání; pozorovaný výsledek je u neúplných
dat jen doložené minimum a odchylka/skóre se neuvádí. Při chybějícím indexu
neuvádíme ani pozorovanou roční hodnotu.

Citlivost na ±3 dny ukazuje posun samotného indexu. Není to úplná simulace
nezávislého posunu každé epizody; překryvy a ořezání na hranici okna zůstávají
ovlivněné anonymizací. Podle přesnějšího `datapackage.json` je posun −3 až +3 dny;
stručná formulace DOCX „0–3“ je neúplná.

## Model a interpretace

- One-hot diagnóza MKN-10, věková skupina a pohlaví; ridge regrese s předem
  pevnou penalizací 8, nepenalizovaným interceptem a výstupem omezeným na 0–365.
- Pro každého pacienta trénování bez něj. Jeho vlastní výsledek se nepoužívá
  ani při kalibraci jeho intervalu. Následné laboratoře, délka péče, úmrtí,
  stadium ani TNM nejsou prediktory; dostupnost a úplnost stadium/TNM je omezená.
- Přesné aditivní příspěvky v jednotkách dnů jsou
  `(x_pacient − průměr_x_reference) × koeficient`, sečtené po charakteristikách.
  Referenční očekávání + příspěvky + případné omezení na 0–365 = predikce.
  Není nutná aproximace pomocí dalšího vysvětlovacího modelu.
- Skutečný průběh doplňují pobyty, nejdelší pobyt, jednodenní kontakty,
  epizody D70 a epizody s hlavními kódy A/B, porovnané s ostatními pacienty
  stejné diagnózy; při méně než třech používáme celou srovnatelnou kohortu.
  Tyto následné charakteristiky jsou popis souvislostí, nikoli kauzální vysvětlení.
- Laboratoř se zobrazuje pouze jako kontext v ročním okně. Chybějící měření
  není normální výsledek. Interní kódy metod zachováváme včetně nul; bez
  číselníku jim nepřiřazujeme názvy. Příznaky L/N/H jsou zdrojové, reference
  mohou být dospělé a detekční meze jsou v tomto souboru neoznačené.

## Nejistota, kandidáti a skupiny

Používáme [jackknife+ (Barber a kol.)](https://arxiv.org/abs/1905.02928) s α = 0,05.
Po vynechání hodnoceného pacienta znovu vynecháváme jednotlivé pacienty reference.
Jejich absolutní rezidua a předpovědi pro hodnoceného pacienta tvoří spodní a horní
meze. Finální pořadové statistiky mají konečný výběrový korekční člen `(n + 1)`.
Analytická aktualizace ridge je testovaná proti skutečnému opakovanému fitování.

Metoda má dolní mez marginálního pokrytí 90 % za předpokladu zaměnitelnosti
pacientů a symetrického algoritmu. Nejde o slib 90% správnosti konkrétního
případu, diagnózy ani skupiny vybrané podle extrémního skóre. Směs diagnóz,
administrativní výběr a zpětná vazba podle výsledků tyto předpoklady mohou narušit.
Kalendářní čas ani nezávislou externí kohortu nemáme.

Překvapivost = absolutní reziduum / `max(polovina šířky intervalu, 1 den)`.
Kandidáti jsou horních 10 % pořadí nebo případy mimo interval (nulovou odchylku
nevybíráme). Percentil není p-hodnota; neděláme korekci vícenásobného testování
ani tvrzení o řízení falešných objevů. „Mimo interval“ jako silnější štítek
vyžaduje také aspoň pět jiných pacientů stejné diagnózy a stabilitu vůči posunu
indexu ±3 dny. Slabě podložené a hraniční případy zůstávají označené.

Wardovo hierarchické shlukování pouze aktivních kandidátů používá reziduum,
počet pobytů, nejdelší pobyt, jednodenní kontakty, D70 a A/B. Proměnné se škálují
směrodatnou odchylkou s minimem 1. Počet skupin je nejvýše tři a nejvýše
`floor(počet_kandidátů / 2)`; algoritmus může přesto vytvořit jednotlivosti.
Shrnutí ukazuje nejvýraznější rozdíly mediánů a zastoupení diagnóz. Skupiny se
po hodnocení mohou změnit; jejich čísla nejsou stabilní klinické klasifikace.

## Ověření a výchozí výsledek

Na dodaném souboru, před odbornou zpětnou vazbou:

| Ukazatel | Hodnota |
| --- | ---: |
| Pacienti / epizody / laboratorní výsledky | 157 / 17 864 / 1 624 |
| Srovnatelné roční okno | 129 |
| Chybějící index / krátké sledování / neuzavřený pobyt | 10 / 5 / 13 |
| Kandidáti / mimo interval | 13 / 6 |
| MAE modelu při vynechání pacienta | 26,92 dne |
| MAE průměru zbývající kohorty | 32,13 dne |
| Pokrytí predikčním intervalem v tomto souboru | 95,35 % |

Jde o interní vývojové ověření, ne nezávislou klinickou validaci. Penalizace
ani hranice kandidátů nejsou optimalizované podle anotací lékařů. Pravidla
nejprve potřebují kontrolu s mentorem. Syntetické testy pokrývají časové okno,
překryvy, chybějící údaje, vazby CSV, absenci úniku vlastního výsledku,
intervaly, rozklad modelu, shlukování pouze kandidátů, uložení/obnovu hodnocení,
ochranu před souběžným přepsáním a CSV formulemi.

## Podklady a další odborné ověření

Zadání: `assets/Vyzva_KDO_Rakathon_Outlier.docx`; skutečné schéma a počty mají
přednost před orientačními staršími údaji v přiložené prezentaci.

Zapracované podklady z [týmové knowledgebase](https://github.com/olexamatej/rakathon-knowledgebase),
revize `4399248a22987d2c1a87b88c46fc5a2dfb966197`: poznámky `methods`, `hypotheses`,
`mentor`, `initial-synthesis` a `hackathon`. Z nich vycházejí důraz na výchozí
čas, dostupnost vstupů, jednoduchý model, nejistotu a oddělení modelového
vysvětlení od biologické příčiny. Rešeršní poznámky nejsou klinicky ověřená
doporučení. Survival metody z rešerše nejsou pro tento endpoint použité.

S mentorem zbývá ověřit zejména přijatelnost indexu, úplnost zachycení péče,
smysluplnost společného modelu napříč diagnózami a konkrétní případy. Nižší
zátěž neoznačujeme jako lepší přežití, odpověď na léčbu ani léčebný úspěch.

## Uložení a pravidla dat

Vstupní CSV už byla v původním Git commitu. Přidaný `.gitignore` brání novému
nechtěnému přidávání exportů a hodnocení, ale **neodstraní dříve commitovaná
data z historie**. Tento checkout ani jeho historii nezveřejňovat bez vyřešení
pravidel datasetu. Průběžné změny pushujeme do ověřeného soukromého repozitáře;
aplikaci nikde veřejně nepublikujeme.

Nepokoušet se o identifikaci ani propojování s externími záznamy. Po hackathonu
odstranit podle pravidel nejen zdrojová data, ale i odvozené exporty, SQLite,
zálohy a případné snímky obrazovky. Automatické mazání zdrojových dat neprovádíme.

Server zpřístupňuje pouze tři statické soubory a konkrétní API; neservíruje
adresář `assets`, Git ani SQLite. Kontroluje Host/Origin a JSON zápisů,
nepovoluje CORS a odpovědi necachuje. Poznámky jsou při vykreslení escapované,
CSV chrání proti spuštění vzorců. Toto je jednoúčelový lokální prototyp bez
síťového přihlašování a bez nemocničního auditního systému.
