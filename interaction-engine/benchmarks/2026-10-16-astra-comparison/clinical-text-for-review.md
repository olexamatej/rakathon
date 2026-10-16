# Model output for manual review

## gpt-6-astra.fast.1.response.json (28.50s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při užívání warfarinu.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček, čímž zvyšuje krvácivé riziko při antikoagulační léčbě warfarinem.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem. Krvácení může nastat i při terapeutickém INR."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová s warfarinem významně zvyšuje riziko krvácení i v nízkých antiagregačních dávkách.",
  "mechanism": "Nevratná inhibice destiček kyselinou acetylsalicylovou a poškození žaludeční sliznice se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Nitrolební a jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci používat pouze při jasné indikaci a pod lékařským dohledem. Již předepsanou léčbu samostatně neměnit."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení; samotné INR nezachycuje přidané riziko způsobené inhibicí destiček."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Fluconazole může výrazně zvýšit účinek warfarinu a riziko krvácení.",
  "mechanism": "Fluconazole inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR",
    "Závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení i ukončení léčby fluconazolem zajistit častější kontroly INR."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a kyselina acetylsalicylová společně zvyšují riziko vředů a závažného krvácení.",
  "mechanism": "Souběžná inhibice cyklooxygenázy zvyšuje poškození sliznice trávicího traktu a poruchu funkce destiček.",
  "clinicalEffects": [
    "Žaludeční a dvanáctníkové vředy",
    "Krvácení do trávicího traktu"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžnému užívání se pokud možno vyhnout, zvláště při současné léčbě warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit antiagregační účinek nízkých dávek kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může obsazením destičkové cyklooxygenázy zabránit nevratnému antiagregačnímu působení kyseliny acetylsalicylové; účinek závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou"
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání kyseliny acetylsalicylové k prevenci cévních příhod zvolit po poradě jiné analgetikum; časový odstup nemusí při opakovaném užívání interakci spolehlivě odstranit."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Fluconazole může zvýšit koncentraci ibuprofenu a jeho nežádoucí účinky.",
  "mechanism": "Fluconazole inhibuje CYP2C9 a zvyšuje expozici farmakologicky aktivnímu enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu",
    "Krvácení do trávicího traktu",
    "Poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Zvážit jiné analgetikum nebo úpravu dávky ibuprofenu; při kombinaci sledovat gastrointestinální obtíže, krvácení a funkci ledvin podle rizika."
    }
  ]
}

## gpt-6-astra.standard.1.response.json (38.91s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen výrazně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček, čímž zvyšuje krvácivé riziko při antikoagulačním účinku warfarinu. Riziko může vzrůst i bez změny INR.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení a INR; samotné INR nevystihuje celé riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová zvyšuje riziko závažného krvácení při léčbě warfarinem i v nízkých protidestičkových dávkách.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí funkci destiček a poškozuje žaludeční sliznici; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Nitrolební a jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Souběh má být podložen konkrétní indikací a veden lékařem. Předepsanou léčbu svévolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR; krvácení může vzniknout i při terapeutickém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Fluconazole může výrazně zesílit účinek warfarinu a zvýšit riziko krvácení.",
  "mechanism": "Fluconazole inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9, a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR",
    "Závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení i ukončení fluconazolu zajistit častější kontroly INR a sledovat krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a kyselina acetylsalicylová společně zvyšují riziko vředů a závažného krvácení.",
  "mechanism": "Souběžná inhibice cyklooxygenázy zesiluje poškození sliznice trávicího traktu a poruchu funkce destiček.",
  "clinicalEffects": [
    "Žaludeční a dvanáctníkové vředy",
    "Krvácení do trávicího traktu"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběhu se pokud možno vyhnout, zvláště při současné léčbě warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkých dávek kyseliny acetylsalicylové; dopad na výskyt cévních příhod je méně jistý.",
  "mechanism": "Ibuprofen může obsazením destičkové cyklooxygenázy bránit nevratnému protidestičkovému účinku kyseliny acetylsalicylové. Interakce závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem a ischemickou cévní mozkovou příhodou"
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání kyseliny acetylsalicylové k prevenci cévních příhod upřednostnit po konzultaci jiné analgetikum; samotný časový odstup nemusí při pravidelném užívání ibuprofenu stačit."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Fluconazole zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Fluconazole inhibuje CYP2C9 a zpomaluje metabolismus ibuprofenu, čímž zvyšuje jeho expozici.",
  "clinicalEffects": [
    "Zvýšení nežádoucích účinků ibuprofenu",
    "Krvácení do trávicího traktu",
    "Poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Posoudit potřebu ibuprofenu a případné snížení jeho dávky nebo náhradu."
    },
    {
      "action": "monitor",
      "description": "Při souběhu sledovat zažívací obtíže, krvácení a podle rizikových faktorů funkci ledvin."
    }
  ]
}

## gpt-6-astra.fast.2.response.json (27.01s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen výrazně zvyšuje riziko krvácení při léčbě warfarinem, i bez zvýšení INR.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček, čímž zvyšuje riziko krvácení při antikoagulačním účinku warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodnou alternativu k léčbě bolesti zvolit s lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení; terapeutické INR nevylučuje zvýšené riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin zvyšuje riziko závažného krvácení při léčbě warfarinem, a to i v nízkých antiagregačních dávkách.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí funkci destiček a poškozuje žaludeční sliznici; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Souběh používat jen při jasné indikaci a pod dohledem lékaře; předepsanou léčbu samostatně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení; samotné sledování INR nezachytí celé riziko."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu a zvýšit riziko krvácení.",
  "mechanism": "Flukonazol inhibuje zejména CYP2C9, zpomaluje odbourávání účinnějšího S-warfarinu a zesiluje antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR",
    "Závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení i ukončení flukonazolu zajistit častější kontroly INR a sledovat krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Kombinace ibuprofenu a aspirinu zvyšuje riziko vředů a závažného krvácení do trávicího traktu.",
  "mechanism": "Souběžná inhibice cyklooxygenáz zvyšuje poškození sliznice trávicího traktu a poruchu funkce destiček.",
  "clinicalEffects": [
    "Žaludeční nebo dvanáctníkové vředy",
    "Krvácení do trávicího traktu"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat; alternativu k ibuprofenu konzultovat s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit antiagregační účinek nízkých dávek aspirinu; dopad na výskyt cévních příhod je méně jistý.",
  "mechanism": "Ibuprofen může obsazením destičkové COX-1 bránit její nevratné inhibici kyselinou acetylsalicylovou. Účinek závisí na pořadí podání a lékové formě.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou"
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod preferovat jiné analgetikum po konzultaci; samotný časový odstup nemusí při pravidelném užívání interakci spolehlivě odstranit."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zvyšuje expozici účinnému S-ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení do trávicího traktu",
    "Zvýšené riziko poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Při souběhu zvážit s lékařem snížení dávky ibuprofenu nebo jiné analgetikum."
    },
    {
      "action": "monitor",
      "description": "Sledovat nežádoucí účinky ibuprofenu, zejména krvácení a při rizikových faktorech také funkci ledvin."
    }
  ]
}

## gpt-6-astra.standard.2.response.json (38.09s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen výrazně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci krevních destiček, čímž zvyšuje krvácivé riziko při antikoagulačním účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení; normální INR nevylučuje zvýšené riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin zvyšuje krvácivé riziko warfarinu i při nízkých protidestičkových dávkách.",
  "mechanism": "Protidestičkový účinek kyseliny acetylsalicylové a její poškození žaludeční sliznice se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu a nitrolebního krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinovat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu samostatně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR; samotné INR nezachycuje protidestičkový účinek."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Zajistit častější kontroly INR při nasazení, změně dávky a vysazení flukonazolu."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen a aspirin společně zvyšují riziko vředů a krvácení.",
  "mechanism": "Oba léky inhibují cyklooxygenázu a jejich nepříznivé účinky na sliznici trávicího traktu a krevní destičky se sčítají.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a dvanáctníkových vředů a krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat a výběr analgetika konzultovat."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkých dávek aspirinu.",
  "mechanism": "Ibuprofen může zabránit nevratné inhibici destičkové COX-1 kyselinou acetylsalicylovou; účinek závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod preferovat po konzultaci jiné analgetikum, zejména při pravidelném užívání."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol může zvýšit koncentraci ibuprofenu a jeho toxicitu.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zvyšuje expozici aktivnímu enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při souběhu sledovat nežádoucí účinky ibuprofenu, zejména při delší léčbě nebo onemocnění ledvin."
    },
    {
      "action": "adjust_dose",
      "description": "Podle klinického stavu může být vhodné snížení dávky ibuprofenu lékařem."
    }
  ]
}

## gpt-6-astra.standard.3.response.json (36.99s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje gastrointestinální sliznici a tlumí funkci krevních destiček, čímž zvyšuje krvácivé riziko při antikoagulační léčbě warfarinem.",
  "clinicalEffects": [
    "Gastrointestinální i jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení a INR; normální INR nevylučuje zvýšené riziko krvácení."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin s warfarinem významně zvyšuje riziko závažného krvácení.",
  "mechanism": "Antiagregační účinek kyseliny acetylsalicylové a poškození gastrointestinální sliznice se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Gastrointestinální krvácení",
    "Nitrolební i jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci používat pouze při jasné indikaci pod dohledem lékaře; předepsanou léčbu samostatně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat krvácení a INR; krvácivé riziko může být zvýšené i při INR v cílovém rozmezí."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Fluconazole může výrazně zesílit účinek warfarinu a vyvolat krvácení.",
  "mechanism": "Fluconazole inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR",
    "Závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Častěji kontrolovat INR při zahájení, během podávání i po ukončení fluconazolu."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit lékařem podle INR."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s aspirinem zvyšuje riziko gastrointestinálního krvácení a dalších nežádoucích účinků.",
  "mechanism": "Souběžná inhibice cyklooxygenázy zesiluje nežádoucí účinky na gastrointestinální sliznici, krevní destičky a prokrvení ledvin.",
  "clinicalEffects": [
    "Gastrointestinální vředy a krvácení",
    "Poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat, zvláště při analgetických dávkách aspirinu."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit antiagregační účinek nízkých dávek aspirinu.",
  "mechanism": "Ibuprofen může obsazením destičkové cyklooxygenázy bránit její nevratné inhibici kyselinou acetylsalicylovou; účinek závisí na pořadí, časování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou"
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod preferovat po poradě jiné analgetikum; samotný časový odstup nemusí při pravidelném ibuprofenu interakci spolehlivě odstranit."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Fluconazole zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Fluconazole inhibuje CYP2C9 a zvyšuje expozici účinnému enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko gastrointestinálních nežádoucích účinků a krvácení",
    "Zvýšené riziko poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při souběhu sledovat nežádoucí účinky ibuprofenu, zejména krvácení a funkci ledvin u rizikových pacientů."
    },
    {
      "action": "adjust_dose",
      "description": "Zvážit s lékařem snížení dávky ibuprofenu nebo jiné analgetikum."
    }
  ]
}

## gpt-6-astra.fast.3.response.json (27.21s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem, i bez změny INR.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci krevních destiček, čímž zvyšuje krvácivé riziko při antikoagulační léčbě warfarinem.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Další závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Pokud je kombinace nezbytná, sledovat známky krvácení; samotné INR nemusí zvýšené riziko zachytit."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Warfarin s kyselinou acetylsalicylovou významně zvyšují riziko závažného krvácení.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí agregaci krevních destiček a poškozuje žaludeční sliznici; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu",
    "Nitrolební a jiné závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci používat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu svévolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat krvácení a INR; krvácivé riziko může být zvýšené i při terapeutickém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu a zvýšit INR i riziko krvácení.",
  "mechanism": "Flukonazol inhibuje zejména CYP2C9 a zpomaluje metabolismus účinnějšího S-warfarinu.",
  "clinicalEffects": [
    "Zvýšení INR",
    "Závažné krvácení"
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení i ukončení flukonazolu častěji kontrolovat INR a sledovat krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit lékařem podle INR."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s kyselinou acetylsalicylovou zvyšují riziko vředů a závažného krvácení.",
  "mechanism": "Sčítá se poškození sliznice trávicího traktu a ovlivnění krevních destiček inhibicí cyklooxygenázy.",
  "clinicalEffects": [
    "Žaludeční nebo dvanáctníkové vředy",
    "Krvácení do trávicího traktu"
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat, zvláště při současné léčbě warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkých dávek kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může obsazením destičkové cyklooxygenázy bránit jejímu nevratnému zablokování kyselinou acetylsalicylovou; účinek závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné oslabení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou"
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání kyseliny acetylsalicylové k protidestičkové léčbě zvolit po konzultaci jiné analgetikum."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zpomaluje metabolismus ibuprofenu, čímž zvyšuje jeho expozici.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu",
    "Krvácení do trávicího traktu",
    "Poškození ledvin"
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Zvážit jiné analgetikum nebo úpravu dávky ibuprofenu s lékařem."
    },
    {
      "action": "monitor",
      "description": "Při souběžné léčbě sledovat zažívací obtíže, krvácení a podle rizika funkci ledvin."
    }
  ]
}
