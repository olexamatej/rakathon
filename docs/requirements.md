# PillGaze — checklist zadania

## Pacient a spracovanie vstupov
- [ ] Funkčná mobilná aplikácia pre pacienta na fotenie zoznamov a obalov liekov doma alebo v čakárni.
- [ ] Čítanie názvov a síl liekov z fotografií obalov (OCR).
- [ ] Čítanie liekov a dávkovania z tlačených zoznamov.
- [ ] Automatické spojenie údajov z viacerých vstupov do jedného štruktúrovaného zoznamu: názov lieku, sila/gramáž, denný rozpis užívania.
- [ ] Zohľadnenie spoľahlivosti zdrojov pri rozporných údajoch; kontrola údajov zo zoznamu proti obalu lieku.
- [ ] Možnosť pri ladení meniť váhy zdrojov samostatne pre názov lieku, gramáž a denný rozpis.

## Rozhranie lekára
- [ ] Funkčné webové rozhranie alebo plugin do prehliadača.
- [ ] Prijatie pacientovho zoznamu ako prehľadnej editovateľnej tabuľky.
- [ ] Možnosť upraviť celý zoznam liekov a dávkovanie.
- [ ] Skopírovanie výsledného zoznamu do zdravotníckej dokumentácie cez Ctrl+C / Ctrl+V.

## Interakcie a onkologická liečba
- [ ] Kontrola závažných interakcií v celom výslednom zozname cez verejne dostupné databázy/nástroje.
- [ ] Zahrnutie onkologickej liečby do kontroly interakcií.
- [ ] Identifikácia aspoň najpoužívanejších onkologických režimov vo verejnej databáze a vypísanie liečiv, ktoré obsahujú.
- [ ] Upozornenie lekára na zistené závažné interakcie.
- [ ] Výsledky kontroly interakcií a identifikácie onkologickej liečby zobrazovať oddelene od pacientom zadaného zoznamu, iba na vyžiadanie a výlučne v rozhraní lekára.

## Anonymita a prenos
- [ ] Pracovať bez citlivých osobných a identifikačných údajov; prenášaný obsah tvorí iba anonymný textový zoznam liečiv.
- [ ] Bezpečné odovzdanie zoznamu z mobilu priamo do rozhrania lekára bez identifikácie pacienta.
- [ ] Prenos cez jednorazový krátky PIN s obmedzenou platnosťou (v zadaní max. 4 číslice, platnosť napr. 3 minúty).
- [ ] Neukladať zoznam na externé úložisko; pri prenose nevyžadovať dlhodobé externé uloženie.

## Optimálne / rozšírené oproti minimu na 48 hodín
- [ ] Čítanie ručne písaných zoznamov (súčasť cieľového riešenia, pre 48-hodinové MVP označené ako optimálne).
- [ ] Identifikácia onkologickej liečby zo zadaného alebo odfoteného názvu režimu v správe; spracovanie akronymov režimov, generických názvov liekov a ich skratiek.
- [ ] Lokálne uloženie zoznamu v telefóne pacienta na opakované použitie.

## Ukážka do 48 hodín
- [ ] Predviesť funkčný tok: fotografie obalov a tlačeného zoznamu → zlúčený zoznam → anonymný prenos medzi zariadeniami → editácia lekárom → kontrola interakcií → kopírovanie do dokumentácie.
- [ ] Predviesť identifikáciu bežného onkologického režimu a jeho liečiv.

Zdroje: [zadanie](../assets/RAKATHON_2026_MOU_Rusinko.md), [prezentácia](../assets/Rakathon_Rusinko_prezentace.md).
