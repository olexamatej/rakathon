# **RAKATHON 2026**

Akce proběhne o víkendu 16.-18.října 2026

<table>
<thead>
<tr class="header">
<th><p><strong>Výzva PillGaze</strong></p>
<p><strong>mentor Rusinko</strong></p></th>
<th></th>
<th></th>
<th></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td><strong>1</strong></td>
<td><strong>Název výzvy</strong></td>
<td><em>PillGaze - Využití umělé inteligence k digitalizaci farmakologické anamnézy z rukou psaných seznamů a obalů léků do strukturované formy k dalšímu zpracování a bezpečnému přenosu do zdravotnické dokumentace.</em></td>
<td></td>
</tr>
<tr class="even">
<td><strong>2</strong></td>
<td><strong>Popis výzvy</strong></td>
<td><p><em>Získávání relevantních informací o užívaných lécích je často komplikované, protože pacienti souhrn všech užívaných léků buďto nemají, nebo si přináší na rukou psaných seznamech obsahujících chyby či nepřesnosti. Úkolem této výzvy je vytvořit nástroj, který pomocí mobilní aplikace zpracuje ručně psané poznámky spolu s fotografiemi krabiček léků. Získané informace systém automaticky integruje, zohlední váhu spolehlivosti jednotlivých zdrojů dat a vytvoří relevantní seznam medikace včetně gramáží a denního rozpisu užívání. V této formě bude systém schopen pomocí informací dostupných z veřejných databází/nástrojů na podnět lékaře zkontrolovat lékové interakce mezi užívanými léčivy a upozornit na ně.</em></p>
<p><em>Nezbytnou podmínkou úspěchu tohto systému je vhodné zasazení do workflow při práci klinika za dodržení striktních pravidel ochrany osobních údajů. Navržené řešení musí proto umožnit pacientovi vyfotit seznamy a léky doma či v čekárně na mobilní telefon a samotný přenos dat musí proběhnout anonymně, bez citlivých identifikačních informací přímo do webového rozhraní či pluginu ve webovém prohlížeči lékaře pomocí krátkého PINu s časově omezenou platností. Po přenosu pak může lékař dodatečně s digitálním seznamem pracovat a přímo jej vkládat do zdravotnické dokumentace pacienta.</em></p>
<p><em>Specifickým problémem v onkologii jsou informace o probíhající onkologické léčbě (chemoterapii, imunoterapii, biologické léčbě), která je často uvedená v dokumentaci pacienta pod akronymem daného léčebného režimu, generického léku, či dokonce jen jeho zkratkou. Proto zadání počítá i se schopností systému identifikovat a zpracovat informace o onkologické léčbě.</em></p></td>
<td></td>
</tr>
<tr class="odd">
<td><strong>3</strong></td>
<td><strong>Současný stav/ řešení a jeho nedostatky</strong></td>
<td><em>V současné klinické praxi probíhá odběr farmakologické anamnézy ručně a je velmi zdlouhavý. Někdy jsou informace na pacientově seznamu nedůvěryhodné (neexistující gramáže, léky se stejným názvem o vícero dostupných gramážích) a kontrola proti balení, které má pacient doma nabízí nejrychlejší dostupnou kontrolu. Při manuálním přepisování medikace do lékařské dokumentace není možnost okamžité kontroly případných interakcí protože dostupné veřejné nástroje nabízí jen možnost zadávání jednotlivých léků a navíc často jen v omezeném počtu. Přes fakt, že existují četné nástroje na identifikaci léků z fotografií obalů, stahování příbalových letáků, dohledávání informací o léčivech, kontrolu interakcí, či tvorbu seznamů užívaných léků, žádný z těchto nástrojů nenabízí možnost jednoduché editace kompletního seznamu s možností jednoduchého a bezpečného sdílení seznamu s lékařem.</em></td>
<td></td>
</tr>
<tr class="even">
<td><strong>4</strong></td>
<td><strong>Požadavky na řešení</strong></td>
<td><p><em><span class="underline">Platforma:</span> Mobilní aplikace určená pro pacienta a webové rozhraní či plugin pro webový prohlížeč pro lékaře.</em></p>
<p><em><span class="underline">Integrace vstupních dat:</span> Kombinace vstupů z fotografie krabičky léků (OCR), rukou psaného seznamu či tištěného seznamu, optimálně i schopnost identifikace onkologické léčby ze zadaného názvu režimu či vyfoceného názvu režimu ve zprávě pacienta. Důležitá je možnost při ladění systému upravovat váhu zdrojů pro jednotlivé entity (název léku, gramáž, denní rozpis).</em></p>
<p><em><span class="underline">Integrace externích zdrojů:</span> Kontrola závažných interakcí léčiv a identifikace onkologické léčby s využitím veřejně dostupných databází. Výsledné zobrazení těchto informací musí být odděleno od samotného seznamu pacientem zadaných léků, dostupné na vyžádání a vylučně v pracovním rozhraní lékaře.</em></p>
<p><em><span class="underline">Bezpečnost:</span> Nástroj nesmí pracovat se žádnými citlivými osobními údaji. Systém bude pracovat s anonymními textovými poli obsahujícími výlučně seznamy léčiv. Přenos anonymního textového pole mezi pacientem a lékařem nesmí využívat žádné identifikační údaje a měl by probíhat např. prostřednictvím jednorázového krátkého PINu (max 4 místního) s omezenou časovou platností (např. 3 minuty). Seznam může být uložen v telefonu pacienta k opakovanému použití, ale nesmí být ukládán na externím úložišti.</em></p></td>
<td></td>
</tr>
<tr class="odd">
<td><strong>5</strong></td>
<td><strong>Úspěch v 48 hodinách</strong></td>
<td><p><em><span class="underline">Funkční MVP (minimal viable product):</span> Použitelný prototyp prostředí pro pacienta a lékaře s funkčním bezpečným přenosem výsledného seznamu léků. Mobilní aplikace pro pacienta, webové rozhraní nebo plugin pro lékaře.</em></p>
<p><em><span class="underline">Zpracování vstupů:</span> Funkční čtení dat z fotografií obalů léků a tištěných seznamů, optimálně i funkční čtení rukou psaných seznamů. Schopnosti tyto informace integrovat a vytvořit výsledný seznam.</em></p>
<p><em><span class="underline">Zpracování externích vstupů:</span> Kontrola závažných interakcí ve výsledném seznamu léků za použití veřejně dostupných databází/nástrojů. Schopnost identifikovat alespoň nejpoužívanější režimy onkologické léčby ve veřejné databáze režimů a uvézt léčiva obsažené v režimu.</em></p>
<p><em><span class="underline">Anonymní přenos:</span> Spolehlivá ukázka předání dat mezi zařízeními, např. pomocí PIN kódu, bez nutnosti dlouhodobého ukládání dat na externím úložišti. Přenos dat bez nutnosti identifikačních údajů.</em></p></td>
<td></td>
</tr>
<tr class="even">
<td><strong>6</strong></td>
<td><strong>Vstupy/data</strong></td>
<td><p><em>1/ Modelové příklady ručně psaných a tištěných seznamů užívaných léků (ve formátu PDF). Obsahuje i příklady obsahující nejčastější chyby, překlepy či neúplné údaje o lécích/dávkování.</em></p>
<p><em>2/Datová sada fotografií obalů běžně užívaných léků (všechny léky/léčiva použitá v modelových seznamech budou dostupná ve formě fotografii obalů).</em></p>
<p><em>3/ Seznam veřejně dostupných nástrojů ve formě webových stránek ke kontrole interakcí (dle dostupnosti event. API).</em></p>
<p><em>4/ Přehled veřejně dostupných zdrojů o používaných onkologických léčebných režimech vč. názvů konkrétních léčiv.</em></p></td>
<td></td>
</tr>
<tr class="odd">
<td><strong>7</strong></td>
<td><strong>Potenciál dopadu</strong></td>
<td><p><em>Zásadním přínosem výzvy je radikální zrychlení a zjednodušení administrativy spojené s odběrem farmakologické anamnézy pacienta. Navržená kombinovaná platforma umožňuje pacientovi připravit relevantní seznam léků ještě před příchodem do zdravotnického zařízení a počítá i s jeho opakovaným</em></p>
<p><em>použitím. Bezpečnostní aspekty výzvy zahrnující striktně anonymní předávání dat představují významný krok k univerzální použitelnosti systému napříč mnoha poskytovateli zdravotních služeb. Pokročilé funkce kontroly interakcí léčiv v celém seznamu najednou a identifikace léčiv dle terapeutických režimů jsou zcela nové prvky, které zatím žádný z dostupných nástrojů v obdobném využití nenabízí.</em></p></td>
<td></td>
</tr>
</tbody>
</table>
