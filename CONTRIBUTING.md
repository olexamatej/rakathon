# Vývoj

## Orientace v projektu

| Cesta | Obsah |
| --- | --- |
| `app.py` | Lokální HTTP server, hodnocení v SQLite a CSV export |
| `data.py` | Načítání a validace vstupů, odvození pozorovaných charakteristik |
| `analysis.py` | Model, intervaly, řazení kandidátů a skupiny |
| `web/` | Statické HTML, CSS a JavaScript bez frontendového buildu |
| `tests/` | Syntetické jednotkové a HTTP integrační testy |
| `assets/datapackage.json` | Verzované schéma vstupních tabulek potřebné i pro testy |
| `.github/workflows/` | CI a ruční kontrola runneru |

## Lokální prostředí

Použijte Python 3.10 nebo novější; CI ověřuje 3.10, 3.12 a 3.14. Pro kontrolu
JavaScriptu je v CI Node.js 24. Vývojové nástroje jsou připnuté
v `requirements-dev.txt`, který zahrnuje i aplikační závislosti.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
```

Rychlá kontrola změn:

```bash
.venv/bin/ruff check .
OPENBLAS_NUM_THREADS=1 .venv/bin/python -m unittest discover -s tests -v
node --check web/app.js
```

Příkazy pro pokrytí a bezpečnostní kontroly jsou v [README](README.md).
Změny výpočtů, validace nebo HTTP chování doplňte odpovídajícím syntetickým
testem. Testy vytvářejí vlastní dočasné vstupy a SQLite; skutečná pacientská CSV
pro jejich běh nejsou potřeba. CI nic veřejně nenasazuje.

## Styl a verzování

- EditorConfig nastavuje UTF-8 a LF, čtyři mezery pro Python a dvě pro frontend
  a strukturovanou konfiguraci. Podporu EditorConfig zapněte ve svém editoru.
- Ruff kontroluje správnost Pythonu a importů podle `ruff.toml`.
- Zdrojový kód, schéma, konfigurace, testy a případné dependency lockfiles patří
  do Gitu. Virtuální prostředí, cache, sestavené balíčky a lokální stav pokrývá
  `.gitignore`.
- Sdílené VS Code konfigurace `settings.json`, `extensions.json`, `tasks.json`
  a `launch.json` lze verzovat; osobní nastavení patří do uživatelského profilu
  editoru. Sdílené konfigurace nesmějí obsahovat přihlašovací údaje.
- Pro ukázkovou konfiguraci používejte `.env.example` nebo `.env.*.example`
  s prázdnými či demonstračními hodnotami.
- Změny rozdělujte do malých commitů s konkrétním popisem, například
  `fix: close review database connections` nebo `ci: validate workflows`.

## Vstupní data a lokální soubory

Pravidla pro skutečná data jsou v části **Uložení a pravidla dat** v README.
CSV v `assets/` už jsou součástí starší historie soukromého repozitáře;
`.gitignore` brání přidání nových souborů, ale neodstraní dříve verzované vstupy
ani jejich historii. Jejich odstranění nebo změnu pravidel sdílení je potřeba
řešit samostatně podle podmínek datasetu.

`.gitattributes` zachovává CSV beze změn konců řádků: otisk datasetu se počítá
z přesných bajtů. Vstupní CSV neupravujte formátovačem. Schéma
`assets/datapackage.json` je běžný verzovaný zdrojový soubor.

Hodnocení zůstávají v `.local/`, exporty v `exports/`. Do commitů nepatří tyto
výstupy, databáze, logy, soukromé klíče ani skutečné hodnoty z `.env`.
