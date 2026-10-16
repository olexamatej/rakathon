# Veřejný katalog SÚKL

Offline kopie otevřených dat SÚKL DLP pro říjen 2026, nikoli pacientská data.
Aplikace ji zatím neimportuje; samotná přítomnost katalogu neznamená implementaci
validace léků, OCR nebo kontroly interakcí.

- `medications.json` — úplný export, jeden záznam na kód SÚKL / variantu balení.
- `metadata.json` — zdroje, období platnosti, popis polí, počty a SHA-256.
- [Testy katalogu](../../tests/sukl.test.ts) — offline kontrola integrity a konzistence metadat.

Aktuální snapshot má 69 847 záznamů a 7 287 různých názvů. Přesné zdrojové URL,
datum získání, rozsah a ověření proti API jsou v [metadatech](metadata.json).
Katalog obsahuje různé stavy registrace i PZLÚ. Není přehledem skladové dostupnosti
ani všech historických registrací.

## Jak data číst

- `suklCode` a kódy účinných látek jsou **řetězce**. Zachovejte počáteční nuly;
  název přípravku není jednoznačný identifikátor.
- `strength` je původní zápis síly, nikoli pacientův dávkovací režim.
- `null` znamená chybějící údaj ze zdroje. Prázdné `activeSubstances` nedoplňujte
  odhadem; u části záznamů je to očekávané a uvedené v metadatech.
- `registrationStatus` interpretujte podle číselníku v metadatech; přítomnost
  v katalogu sama neznamená aktuální dostupnost nebo vhodnost použití.
- Neodvozujte klinické závěry ani interakce jen ze shody názvu či složení.

## Aktualizace

1. Použijte oficiální zdroje uvedené v metadatech a určete období snapshotu.
2. Zachovejte původní hodnoty a kódy; případnou změnu schématu řešte samostatně.
3. Aktualizujte `medications.json` **společně** s `metadata.json`: zdroj, datum,
   platnost, počty, výsledky ověření a hash přesných bajtů výsledného JSON.
4. Spusťte `npm test` a zkontrolujte diff metadat a souhrn změn. Nepřepisujte
   nebo neformátujte celý katalog jen kvůli úklidu dokumentace.

Testy kontrolují uložený soubor bez síťových požadavků: hash, základní strukturu,
jedinečnost kódů a publikované souhrny. Neověřují aktuálnost proti živému API,
správnost klinických údajů nebo licence pro konkrétní způsob další distribuce.
