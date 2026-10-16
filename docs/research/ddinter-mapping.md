# SÚKL → DDInter: proveditelnost mapy interakcí

Ověřeno 16. 10. 2026. Jde o průzkum dat a proveditelnosti, ne o klinicky validovaný interakční checker. Aplikační kód se nemění.

## Závěr

Deterministické napojení je realistické přes účinné látky: `SÚKL kód → složení → normalizovaná látka → DDInter ID → dvojice interakcí`. Nelze slíbit úplnou mapu všech přípravků. Samotné stažené CSV dodává dvojice a závažnost; požadovaný skutečný `popis interakce` vyžaduje další zdroj nebo stažení detailů DDInter. [CSV A](https://ddinter2.scbdd.com/static/media/download/ddinter_downloads_code_A.csv), [příklad detailu](https://ddinter2.scbdd.com/server/interact/21807/)

## Co skutečně nabízí DDInter

Oficiální článek DDInter 2.0 uvádí 2 310 záznamů léčiv, 2 122 různých léčiv, 302 516 interakcí a 8 398 různých popisů mechanismů a doporučení. Aktualizace popsaná v článku pracovala s literaturou do května 2023. Interakce s třídami léčiv autoři ručně rozepisovali do jednotlivých dvojic; názvy sjednocovali slovníkem z DrugBank a Drugs@FDA. Tyto údaje nejsou měřením kompletnosti dnešního exportu. [Článek autorů, DOI 10.1093/nar/gkae726](https://academic.oup.com/nar/article/53/D1/D1356/7740584)

### CSV export

Aktuální [stránka Download](https://ddinter2.scbdd.com/download/) odkazuje jen na osm souborů pro ATC skupiny A, B, D, H, L, P, R, V. Přímým ověřením však fungují i soubory C, G, J, M, N, S na shodné cestě, například [neodkazovaný soubor C](https://ddinter2.scbdd.com/static/media/download/ddinter_downloads_code_C.csv). Je potřeba stáhnout všech 14, ne pouze odkazy ze stránky.

Ověřená hlavička všech souborů:

```csv
DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level
```

Místní měření všech 14 souborů:

| Co počítáme | Počet |
| --- | ---: |
| Řádky před deduplikací | 507 655 |
| Různé neuspořádané dvojice DDInter ID | 234 981 |
| Různá DDInter ID | 1 971 |
| Moderate | 143 748 |
| Major | 39 082 |
| Minor | 9 736 |
| Unknown | 42 415 |

Osm odkazovaných souborů obsahuje pouze 160 235 různých dvojic; dalších šest přidá 74 746 dvojic. Příklad: simvastatin + amiodaron v původních osmi chybí, ve všech 14 je `Major` a [webový detail existuje](https://ddinter2.scbdd.com/server/interact/21807/). Ani všech 14 CSV počtem nedosahuje oficiálně uváděných 302 516 interakcí. Důvod rozdílu není ověřen; nelze jej bez dalšího označit za starší vydání.

Měření vychází z přímých veřejných souborů, stažených pro průzkum do `/tmp/rakathon-ddinter/`; neověřuje medicínskou správnost dvojic.

### Kde jsou popisy a identifikátory

- [Detail interakce](https://ddinter2.scbdd.com/server/interact/21807/) obsahuje samostatná pole `Interaction`, `Management`, `References`; text je anglicky. Export CSV žádné z těchto polí ani číselné ID detailu neobsahuje.
- Ověřený veřejný frontend na [detailu léčiva DDInter1](https://ddinter2.scbdd.com/server/drug-detail/DDInter1/) načítá tabulku přes POST `/server/interact-with/DDInter1/` s CSRF tokenem/cookie. Třířádkový vzorek odpovědi obsahoval `drug_id`, `drug_name`, `interaction_id`, `level` a příznaky mechanismů. Popisy v této odpovědi nejsou. `interaction_id` vede na HTML `/server/interact/{id}/`. Jde o pozorované rozhraní webu, nikoli ověřené veřejné API se stabilní smlouvou.
- [Detail léčiva DDInter1](https://ddinter2.scbdd.com/server/drug-detail/DDInter1/) má CAS, ATC, strukturu, DrugBank a další externí odkazy. Pole označené `InChI` má ve zkontrolovaných příkladech formát InChIKey. PubChem odkaz je SID, nelze ho automaticky považovat za CID. Tyto identifikátory nejsou v interakčních CSV.

Praktický dopad: pro plné texty je vhodné nejprve získat od autorů strukturovaný export. Jinak lze technicky doplnit webové detaily pouze pro potřebné dvojice a ukládat jejich původ a datum získání. Hromadný export popisů ani dokumentované API se při tomto průzkumu nepodařilo ověřit; nebyl proveden plošný scraping.

## Přesná identita látky a cesta podání

Čisté porovnání anglického názvu není úplné. Ověřený [DDInter14 Acetaminophen](https://ddinter2.scbdd.com/server/drug-detail/DDInter14/) má CAS `103-90-2` a v popisu výslovně synonymum paracetamol. CAS tedy nabízí deterministický most tam, kde se názvy liší. Získání CAS pro DDInter vyžaduje doplnit metadata mimo CSV.

Chemický identifikátor ale sám nestačí na výběr správné interakční entity. [DDInter537 Diclofenac](https://ddinter2.scbdd.com/server/drug-detail/DDInter537/) a [DDInter539 Diclofenac (topical)](https://ddinter2.scbdd.com/server/drug-detail/DDInter539/) mají při přímém ověření stejné CAS `15307-86-5`, stejný InChIKey `DCOPUUMXTXDBNB-UHFFFAOYSA-N` a stejný široký seznam ATC. CSV mají zvlášť i `DDInter538 Diclofenac (ophthalmic)`. Nelze tedy zahodit závorky v názvech a všechny entity sloučit ani vybrat první shodu CAS.

Ani ATC není obecně jednoznačný klíč. [Abacavir DDInter1](https://ddinter2.scbdd.com/server/drug-detail/DDInter1/) uvádí vedle samostatného `J05AF06` také kombinace `J05AR02`, `J05AR04`, `J05AR13`. Vhodný postup je určit látku, zvlášť rozlišit cestu podání/formulaci podle dat SÚKL a problematické či vícenásobné shody ponechat explicitně nepokryté.

## Místní data SÚKL

Zdrojem je místní [metadata.json](../../data/sukl/metadata.json), stav 25. 9. 2026 pro říjen 2026. CSV jsou oddělena středníkem a používají cp1250. Katalog obsahuje 69 847 různých SÚKL kódů balení, ve složení používá 2 860 různých kódů účinných látek; 1 445 přípravků nemá uvedenu žádnou účinnou látku.

Pro napojení jsou užitečné zejména [dlp_lecivepripravky.csv](../../data/sukl/dlp/dlp_lecivepripravky.csv), [dlp_slozeni.csv](../../data/sukl/dlp/dlp_slozeni.csv), [dlp_lecivelatky.csv](../../data/sukl/dlp/dlp_lecivelatky.csv) a [dlp_latky.csv](../../data/sukl/dlp/dlp_latky.csv). Pole `NAZEV_EN` dává anglické názvy, které hotový seznam přípravků nemusí přenášet. [dlp_synonyma.csv](../../data/sukl/dlp/dlp_synonyma.csv) navíc obsahuje identifikátory se `ZDROJ=CAS`.

Mechanické měření proti všem 14 CSV DDInter, po oříznutí názvu a sjednocení velikosti písmen:

| Postup | Látky s kandidátem DDInter | Přípravky se shodou pro všechny složky | Podíl všech přípravků |
| --- | ---: | ---: | ---: |
| Přesná shoda anglického názvu | 577 | 24 621 | 35,25 % |
| Navíc hledání přes graf `dlp_soli`, pouze při jediném nalezeném DDInter ID | 1 139 | 54 270 | 77,70 % |

Druhý řádek je **míra mechanicky nalezených kandidátů, nikoli validované pokrytí**. Nebyla zkontrolována cesta podání. Počet přípravků s nalezenou látkou rovněž nevyjadřuje úplnost interakčních dvojic.

[dlp_soli.csv](../../data/sukl/dlp/dlp_soli.csv) není bezpečné chápat jako bezpodmínečný slovník synonym nebo klinické ekvivalence. Průzkum našel například řetězce sufentanil citrát → sufentanil → fentanyl, remifentanil hydrochlorid → remifentanil → fentanyl a fosnetupitant → netupitant. Čtyři použité látky vedly k více DDInter ID a byly v uvedeném měření odmítnuty. I po tomto odmítnutí se dexibuprofen přiřadil k ibuprofenu, což není přesná identita látky. Tabulka navíc propojuje trastuzumab deruxtekan s trastuzumabem; v našem měření tuto záměnu odvrátila přednostní přesná shoda názvu, ale plošné nahrazování podle grafu by rozdíl ztratilo. Zvlášť u onkologických léčiv je nutné zachovat rozdílné entity. Graf lze použít pro návrhy k ověření, nikoli plošně pro automatickou náhradu látky.

Konkrétní zlepšení bez odhadování názvů: místní paracetamol, kód látky `1064`, má CAS `103-90-2`, tedy ověřitelnou shodu s [DDInter14 Acetaminophen](https://ddinter2.scbdd.com/server/drug-detail/DDInter14/). Podobné přiřazení přes identifikátor je silnější než přibližné hledání názvu; dále je ale třeba určit správnou cestu podání.

Ukázkově byly přečteny SPC Warfarin Orion (`0094113`, `SPC231218.pdf`) a Ibalgin (`0254290`, `SPC226794.pdf`), dohledané přes [dlp_nazvydokumentu.csv](../../data/sukl/dlp/dlp_nazvydokumentu.csv). Bod 4.5 kombinuje konkrétní látky, třídy, dávky a podmínky. U warfarinu se paracetamol objevuje jak v kontextu dočasného doporučení, tak interakce při delším užívání. Samotná přítomnost názvu tedy nestačí k bezpečné extrakci dvojice s jedním univerzálním popisem.

## Doporučený minimální model

Interně uchovat malé vazby `suklKod → DDInter ID[]` a sdílenou tabulku interakcí DDInter, místo materializace všech balení každé dvojice látek. U kombinovaných přípravků porovnat každou složku proti složkám druhého přípravku. Požadovaný výstup `suklKod → {suklKod, popis}[]` lze odvodit až pro dotazované přípravky. Tím se zabrání násobení stejného popisu přes mnoho sil a balení.

K výstupu má smysl zachovat závažnost, zdrojový odkaz a informaci o pokrytí. `Unknown` v DDInter je existující záznam s neurčenou závažností; nenalezená látka nebo nenalezená dvojice je jiný stav. Samotné prázdné pole nemá znamenat, že kombinace je bezpečná: [podmínky DDInter](https://ddinter2.scbdd.com/terms/) výslovně upozorňují na neúplnost a možnost chyb.

## Licence a hranice průzkumu

[Datová licence DDInter](https://ddinter2.scbdd.com/terms/) je **CC BY-NC-SA 4.0**, nikoli licence bez omezení komerčního použití. Stránka dále popisuje osobní nekomerční, informační či akademické použití. Pro produkt s komerčním využitím je třeba vyjasnit oprávnění; veřejná dostupnost souboru jej sama nedokládá. Licenci článku nelze zaměňovat s licencí databáze.

SPC 4.5 zůstává vhodným dohledatelným podkladem pro ověření konkrétního přípravku. Tento průzkum nepřeváděl SPC do strukturovaných dvojic, nepřekládal anglické texty a nevalidoval klinickou úplnost ani správnost mapování.
