## Slide 1

Rakathon 2026
Výzva PillGaze
Martin Rusinko

## Slide 2

PillGaze - Využití umělé inteligence k digitalizaci farmakologické anamnézy z rukou psaných seznamů a obalů léků do strukturované formy k dalšímu zpracování a bezpečnému přenosu do zdravotnické dokumentace.
Název výzvy

## Slide 3

získávání relevantních informací o užívaných lécích je komplikované
pacienti seznam nemají, nebo si přináší ve formě rukou psaných poznámek
cílem je vytvořit nástroj, který pomocí mobilní aplikace zpracuje ručně psané poznámky spolu s fotografiemi krabiček léků
dostupné informace systém automaticky integruje a bude schopen pomocí informací dostupných z veřejných databází zkontrolovat lékové interakce
nezbytnou podmínkou je zasazení do workflow při práci klinika
řešení musí umožnit pacientovi vyfotit seznamy a léky doma či v čekárně na mobilní telefon
přenos dat musí proběhnout anonymně, bez citlivých identifikačních informací přímo do webového rozhraní či pluginu ve webovém prohlížeči lékaře pomocí krátkého PINu s časově omezenou platností
po přenosu musí být možné s digitálním seznamem pracovat a přímo jej vkládat do zdravotnické dokumentace pacienta
systém by měl být schopen zpracovat i informace o probíhající onkologické léčbě (chemoterapii, imunoterapii, biologické léčbě)
onkologická léčba je často uvedená v dokumentaci pacienta pod akronymem léčebného režimu, generického léku, či dokonce jen jeho zkratkou
Popis výzvy

## Slide 4

v klinické praxi probíhá odběr farmakologické anamnézy ručně a je velmi zdlouhavý
informace na pacientově seznamu bývají nedůvěryhodné (neexistující gramáže, léky se stejným názvem o vícero dostupných gramážích)
kontrola proti balení, které má pacient doma nabízí nejrychlejší dostupnou kontrolu
při manuálním přepisování medikace do lékařské dokumentace není možnost okamžité kontroly případných interakcí protože dostupné veřejné nástroje nabízí jen možnost zadávání jednotlivých léků a často jen v omezeném počtu
žádný z dostupných nástrojů nenabízí možnost jednoduché editace kompletního seznamu s možností jednoduchého a bezpečného sdílení seznamu s lékařem
Současný stav/ řešení a jeho nedostatky

## Slide 5

Platforma:
Mobilní aplikace určená pro pacienta a webové rozhraní či plugin pro webový prohlížeč pro lékaře.
Integrace vstupních dat:
Kombinace vstupů z fotografie krabičky léků (OCR), rukou psaného seznamu či tištěného seznamu, optimálně i schopnost identifikace onkologické léčby ze zadaného názvu režimu či vyfoceného názvu režimu ve zprávě pacienta. Důležitá je možnost při ladění systému upravovat váhu zdrojů pro jednotlivé entity (název léku, gramáž, denní rozpis).
Integrace externích zdrojů:
Kontrola závažných interakcí léčiv a identifikace onkologické léčby s využitím veřejně dostupných databází. Výsledné zobrazení těchto informací musí být odděleno od samotného seznamu pacientem zadaných léků, dostupné na vyžádání a vylučně v pracovním rozhraní lékaře.
Bezpečnost:
Nástroj nesmí pracovat se žádnými citlivými osobními údaji. Systém bude pracovat s anonymními textovými poli obsahujícími výlučně seznamy léčiv. Přenos anonymního textového pole mezi pacientem a lékařem nesmí využívat žádné identifikační údaje a měl by probíhat např. prostřednictvím jednorázového krátkého PINu (max 4 místního) s omezenou časovou platností (např. 3 minuty). Seznam může být uložen v telefonu pacienta k opakovanému použití, ale nesmí být ukládán na externím úložišti.
Požadavky na řešení

## Slide 6

Funkční MVP (minimal viable product):
Použitelný prototyp prostředí pro pacienta a lékaře s funkčním bezpečným přenosem výsledného seznamu léků. Mobilní aplikace pro pacienta, webové rozhraní nebo plugin pro lékaře.
Zpracování vstupů:
Funkční čtení dat z fotografií obalů léků a tištěných seznamů, optimálně i funkční čtení rukou psaných seznamů. Schopnosti tyto informace integrovat a vytvořit výsledný seznam.
Zpracování externích vstupů:
Kontrola závažných interakcí ve výsledném seznamu léků za použití veřejně dostupných databází/nástrojů. Schopnost identifikovat alespoň nejpoužívanější režimy onkologické léčby ve veřejné databáze režimů a uvézt léčiva obsažené v režimu.
Anonymní přenos:
Spolehlivá ukázka předání dat mezi zařízeními, např. pomocí PIN kódu, bez nutnosti dlouhodobého ukládání dat na externím úložišti. Přenos dat bez nutnosti identifikačních údajů.
Úspěch v 48 hodinách

## Slide 7

Modelové příklady ručně psaných a tištěných seznamů užívaných léků (ve formátu PDF). Obsahuje i příklady obsahující nejčastější chyby, překlepy či neúplné údaje o lécích/dávkování.
Datová sada fotografií obalů běžně užívaných léků (všechny léky/léčiva použitá v modelových seznamech budou dostupná ve formě fotografii obalů).
Seznam veřejně dostupných nástrojů ve formě webových stránek ke kontrole interakcí (dle dostupnosti event. API).
Přehled veřejně dostupných zdrojů o používaných onkologických léčebných režimech vč. názvů konkrétních léčiv.
Vstupy/data

## Slide 8

Vstupy/data

## Slide 9

zásadním přínosem je radikální zrychlení a zjednodušení administrativy spojené s odběrem farmakologické anamnézy pacienta
kombinovaná platforma umožňuje pacientovi připravit relevantní seznam léků ještě před příchodem do zdravotnického zařízení a počítá i s jeho opakovaným použitím
bezpečnostní aspekty výzvy zahrnující striktně anonymní předávání dat představují významný krok k univerzální použitelnosti systému napříč mnoha poskytovateli zdravotních služeb
pokročilé funkce kontroly interakcí léčiv v celém seznamu najednou a identifikace léčiv dle terapeutických režimů jsou zcela nové prvky, které zatím žádný z dostupných nástrojů v obdobném využití nenabízí
Potenciál dopadu

## Slide 10

1) Mám seznam léků – lísteček, tabulku, seznam od lékaře…
…jsem pacient      …užívám léky

## Slide 11

2) Mám krabičky od léků doma/s sebou…
…jsem pacient      …užívám léky

## Slide 12

3)
Mám mobilní telefon…
…jsem pacient      …užívám léky

## Slide 13

4
)
Lékaři předám PIN…
…jsem pacient      …užívám léky
1234

## Slide 14

5)
Lékař dostává přehlednou tabulku
…může ji editovat
…jsem pacient      …užívám léky

## Slide 15

6
)
Lékař může při editaci vyžádat kontrolu interakcí…
… včetně onkologické léčby
…jsem pacient      …užívám léky
Upozornění – riziko interakcí mezi léčivými
připravky
…      … komentář…

## Slide 16

7)
Lékař má výsledný seznam léků…
…
Ctrl+C
…
Ctrl+V
…jsem pacient      …užívám léky
HELICID 20
ZENTIVA 20
mg
1-0-0
HYDROCHLOROTHIAZID LÉČIVA	25 mg	1-0-0
HYDROCORTISONE
QUINTESENCE 10
mg	0-0-1
LOZAP
50
mg
0-1-0
LOZAP
12,5 mg
0-2-3
LIPERTANCE 10
mg / 5 mg / 5 mg	1x
LIPERTANCE 20
mg / 10 mg / 5 mg	4x
KEPPRA 500 mg
1-0-0
LOZAP
100
mg
1-0-0
KODEIN
FMK 30 mg
0-0-1
KVENTIAX	25 mg
0-1-0
KETILEPT	100 mg
0-2-3
HELICID 20
ZENTIVA 20 mg 1-0-0, HYDROCHLOROTHIAZID
LÉČIVA	25
mg 1-0-0, HYDROCORTISONE QUINTESENCE 10 mg 0-0-1, LOZAP 50 mg 0-1-0, LOZAP 12,5 mg 0-2-3, LIPERTANCE 10
mg / 5 mg / 5
mg 1x, LIPERTANCE 20
mg / 10 mg / 5
mg 4x, KEPPRA 500 mg 1-0-0, LOZAP 100 mg 1-0-0, KODEIN FMK 30 mg 0-0-1, KVENTIAX 25 mg 0-1-0, KETILEPT
100
mg 0-2-3

## Slide 17

8) Možnost opakovaného využití…
…jsem pacient      …užívám léky

## Slide 18

Rakathon 2026
Výzva PillGaze
Martin Rusinko


---

## Speaker notes

### Notes 1


### Notes 2


### Notes 3


### Notes 4


### Notes 5


### Notes 6


### Notes 7


### Notes 8


### Notes 9


### Notes 10


### Notes 11


### Notes 12


### Notes 13


### Notes 14


### Notes 15


### Notes 16


### Notes 17


### Notes 18

