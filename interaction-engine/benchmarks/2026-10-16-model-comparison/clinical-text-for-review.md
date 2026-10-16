# Model output for manual review

## gpt-5.6-terra.fast.1.response.json (41.54s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může významně zvýšit krvácivé riziko při léčbě warfarinem.",
  "mechanism": "Ibuprofen tlumí funkci trombocytů a poškozuje sliznici trávicího traktu, což se sčítá s antikoagulačním účinkem warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vyhněte; pro analgezii zvažte vhodnou alternativu po poradě s lékařem."
    },
    {
      "action": "monitor",
      "description": "Je-li kombinace nutná, sledujte známky krvácení a kontrolujte INR podle klinické situace."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová zvyšuje krvácivé riziko warfarinu.",
  "mechanism": "Součet antikoagulačního účinku warfarinu a antiagregačního účinku kyseliny acetylsalicylové; přispívá také poškození sliznice trávicího traktu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci nepoužívejte bez jasné indikace a vedení lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytné kombinaci sledujte krvácení a pravidelně kontrolujte INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení, změně dávky nebo vysazení flukonazolu zajistěte častější kontrolu INR."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR a klinického stavu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a kyselina acetylsalicylová společně zvyšují gastrointestinální toxicitu a krvácivé riziko.",
  "mechanism": "Současné podávání dvou nesteroidních protizánětlivých léčiv zvyšuje poškození sliznice a krvácivé riziko.",
  "clinicalEffects": [
    "Zvýšené riziko podráždění, vředu a krvácení v trávicím traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Současnému užívání se pokud možno vyhněte; ověřte vhodnost léčby u lékaře nebo lékárníka."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit antiagregační účinek nízkodávkové kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může při souběžném podání kompetitivně bránit nevratné inhibici destičkové COX-1 kyselinou acetylsalicylovou.",
  "clinicalEffects": [
    "Možné snížení kardioprotektivního antiagregačního účinku nízké dávky kyseliny acetylsalicylové."
  ],
  "recommendations": [
    {
      "action": "separate_administration",
      "description": "Pokud je nízkodávková kyselina acetylsalicylová nezbytná, řešte načasování nebo alternativu ibuprofenu s lékařem či lékárníkem."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit koncentraci a účinky ibuprofenu.",
  "mechanism": "Flukonazol inhibuje CYP2C9, který se podílí na metabolismu ibuprofenu.",
  "clinicalEffects": [
    "Zvýšená expozice ibuprofenu.",
    "Možné zvýšení nežádoucích účinků ibuprofenu, zejména gastrointestinálních a renálních."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Sledujte nežádoucí účinky ibuprofenu, zejména při vyšších dávkách nebo poruše funkce ledvin."
    },
    {
      "action": "adjust_dose",
      "description": "Může být vhodné použít nejnižší účinnou dávku ibuprofenu po co nejkratší dobu."
    }
  ]
}

## gpt-6-luna.fast.1.response.json (7.37s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při užívání warfarinu významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen tlumí funkci trombocytů a poškozuje sliznici trávicího traktu; warfarin snižuje srážlivost krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména gastrointestinálního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; vhodnou alternativu proti bolesti konzultovat s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin spolu s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Aspirin tlumí funkci trombocytů a může poškozovat sliznici trávicího traktu; warfarin současně snižuje srážlivost krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně závažného gastrointestinálního nebo jiného krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze na výslovný pokyn lékaře; předepsaný aspirin nevysazovat bez konzultace."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může zvýšit účinek warfarinu a hodnotu INR.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9, a může zesílit jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Může dojít ke zvýšení INR a k závažnému krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení, změně nebo ukončení flukonazolu je nutné častější sledování INR a případná úprava léčby pod dohledem lékaře."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Souběžné užívání ibuprofenu a aspirinu zvyšuje riziko krvácení; ibuprofen může také oslabit protidestičkový účinek nízké dávky aspirinu.",
  "mechanism": "Ibuprofen a aspirin oba tlumí funkci trombocytů a mohou poškozovat sliznici trávicího traktu; ibuprofen navíc může při souběžném podání oslabit protidestičkový účinek nízké dávky aspirinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení a podráždění či vředu trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Pravidelné souběžné užívání konzultovat s lékařem nebo lékárníkem, zejména při nízké dávce aspirinu na ochranu srdce."
    }
  ]
}

## gpt-5.6-terra.standard.1.response.json (43.97s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při léčbě warfarinem významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a ovlivňuje funkci trombocytů, čímž zesiluje antikoagulační účinek warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení včetně krvácení do trávicího traktu.",
    "Možné zvýšení hodnoty INR."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vyhněte; pro analgezii zvažte vhodnou alternativu po poradě s lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledujte známky krvácení a hodnotu INR."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin zesiluje krvácivé riziko při léčbě warfarinem.",
  "mechanism": "Aspirin nevratně tlumí agregaci trombocytů a může poškodit sliznici trávicího traktu, což se s účinkem warfarinu sčítá.",
  "clinicalEffects": [
    "Výrazně zvýšené riziko krvácení, zejména do trávicího traktu.",
    "Možné zvýšení hodnoty INR."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci nepoužívejte bez jasné indikace a lékařského dohledu."
    },
    {
      "action": "monitor",
      "description": "Je-li souběh nezbytný, sledujte krvácení a pravidelně kontrolujte INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může významně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9, a může zvýšit jeho expozici.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení, změně dávky nebo ukončení flukonazolu často kontrolujte INR a klinické známky krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod vedením lékaře."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Souběh zvyšuje krvácivé riziko a může oslabit protidestičkový účinek aspirinu.",
  "mechanism": "Oba léky zvyšují poškození sliznice a krvácivé riziko; ibuprofen může kompetitivně bránit vazbě aspirinu na COX-1 v trombocytech.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení do trávicího traktu.",
    "Ibuprofen může snížit protidestičkový účinek nízkodávkovaného aspirinu, je-li užit před ním nebo současně."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Pravidelné souběžné užívání omezte; při aspirinu kardiovaskulární prevenci se poraďte s lékařem o vhodném analgetiku."
    },
    {
      "action": "separate_administration",
      "description": "Pokud je jednorázové užití ibuprofenu nezbytné, neužívejte jej současně s aspirinem."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit koncentraci a účinek ibuprofenu.",
  "mechanism": "Flukonazol inhibuje CYP2C9, který se podílí na metabolismu ibuprofenu.",
  "clinicalEffects": [
    "Možné zvýšení expozice ibuprofenu.",
    "Vyšší riziko nežádoucích účinků ibuprofenu, zejména zažívacích a renálních."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při souběhu sledujte nežádoucí účinky ibuprofenu, zejména při vyšších dávkách nebo poruše funkce ledvin."
    },
    {
      "action": "adjust_dose",
      "description": "Může být vhodné použít nejnižší účinnou dávku ibuprofenu po co nejkratší dobu."
    }
  ]
}

## gpt-6.1-sol.standard.1.response.json (33.72s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu. Krvácení může nastat i bez zvýšení INR.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení a INR; samotná kontrola INR riziko nevylučuje."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Warfarin s aspirinem zvyšuje riziko závažného krvácení.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí funkci destiček a poškozuje žaludeční sliznici; její účinky se sčítají s antikoagulačním působením warfarinu.",
  "clinicalEffects": [
    "Krvácení do trávicího traktu.",
    "Další závažné krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu svévolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR; krvácení může nastat i při terapeutickém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9, a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Před zahájením nebo ukončením flukonazolu kontaktovat lékaře, který řídí léčbu warfarinem."
    },
    {
      "action": "monitor",
      "description": "Častěji kontrolovat INR během souběžné léčby i po vysazení flukonazolu."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod dohledem lékaře."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s aspirinem zvyšuje riziko vředů a krvácení.",
  "mechanism": "Sčítá se poškození sliznice trávicího traktu a ovlivnění funkce destiček.",
  "clinicalEffects": [
    "Žaludeční nebo dvanáctníkové vředy.",
    "Krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžnému užívání se pokud možno vyhnout a vhodné analgetikum konzultovat s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkodávkovaného aspirinu.",
  "mechanism": "Ibuprofen může obsazením destičkové cyklooxygenázy bránit nevratnému účinku nízkodávkované kyseliny acetylsalicylové; význam závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení protidestičkové ochrany aspirinu."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci infarktu nebo cévní mozkové příhody dát po konzultaci přednost jinému analgetiku."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zvyšuje expozici ibuprofenu zpomalením jeho metabolismu.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Při souběžné léčbě zvážit jiné analgetikum nebo úpravu dávky ibuprofenu s lékařem či lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a při rizikové nebo delší léčbě také funkci ledvin."
    }
  ]
}

## gpt-6-luna.standard.1.response.json (7.43s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při léčbě warfarinem významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen může poškodit žaludeční sliznici a ovlivnit funkci destiček; warfarin navíc tlumí srážení krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména gastrointestinálního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; vhodnou alternativu proti bolesti konzultujte s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin spolu s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Aspirin tlumí funkci krevních destiček a může dráždit žaludeční sliznici; warfarin snižuje srážlivost krve.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívejte pouze na výslovné doporučení lékaře; při známkách krvácení vyhledejte neodkladnou péči."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může zesílit účinek warfarinu a zvýšit INR.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9.",
  "clinicalEffects": [
    "Může se zvýšit účinek warfarinu a hodnota INR, což zvyšuje riziko krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení nebo vysazení flukonazolu je třeba pečlivě sledovat INR a podle lékaře upravit léčbu warfarinem."
    }
  ]
}

## gpt-6.1-sol.fast.1.response.json (19.41s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení; samotné INR nevystihuje celé riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin s warfarinem zvyšuje riziko závažného krvácení i při nízkých dávkách aspirinu.",
  "mechanism": "Protidestičkový účinek kyseliny acetylsalicylové a poškození žaludeční sliznice zesilují krvácivé riziko antikoagulace warfarinem.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci a pod lékařským dohledem; předepsanou léčbu samovolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR; krvácení může vzniknout i při terapeutickém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Fluconazole může výrazně zesílit účinek warfarinu.",
  "mechanism": "Fluconazole inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Zajistit častější kontroly INR při zahájení i ukončení léčby fluconazolem."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod vedením lékaře."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s aspirinem zvyšuje riziko krvácení a poškození trávicího traktu.",
  "mechanism": "Souběžná inhibice cyklooxygenázy zvyšuje poškození sliznice trávicího traktu a poruchu funkce destiček.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a střevních vředů a krvácení."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžnému užívání se pokud možno vyhnout, zejména při současné léčbě warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / limited

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkodávkovaného aspirinu.",
  "mechanism": "Ibuprofen může při nevhodném načasování obsadit destičkovou COX-1 a omezit nevratný protidestičkový účinek nízkodávkovaného aspirinu; klinický dopad není spolehlivě vyčíslen.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu nebo ischemickou cévní mozkovou příhodou."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod preferovat po poradě s lékařem jiné analgetikum."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Fluconazole zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Fluconazole inhibuje CYP2C9 a zpomaluje odbourávání účinného enantiomeru ibuprofenu, čímž zvyšuje jeho expozici.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Vhodnost ibuprofenu a případnou úpravu dávky posoudit s lékařem; při současném warfarinu se ibuprofenu pokud možno vyhnout."
    }
  ]
}

## gpt-5.6-terra.fast.2.response.json (36.09s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může u pacientů užívajících warfarin významně zvýšit riziko krvácení.",
  "mechanism": "Součet antikoagulačního účinku warfarinu a účinku ibuprofenu na hemostázu a sliznici zažívacího traktu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do zažívacího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Pokud je to možné, vyhněte se kombinaci; při nutnosti ji konzultujte s lékařem a sledujte známky krvácení."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová zvyšuje při současném užívání warfarinu riziko krvácení.",
  "mechanism": "Součet antikoagulačního účinku warfarinu a protidestičkového účinku kyseliny acetylsalicylové.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, včetně krvácení do zažívacího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci používejte pouze při jasné lékařské indikaci; je nutné pečlivé sledování krvácení."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit antikoagulační účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9.",
  "clinicalEffects": [
    "Vzestup INR.",
    "Zvýšené riziko krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Je nutné častější sledování INR a podle výsledků může být zapotřebí upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen a kyselina acetylsalicylová společně zvyšují riziko krvácení do zažívacího traktu.",
  "mechanism": "Součet nežádoucích účinků obou nesteroidních protizánětlivých léčiv na sliznici zažívacího traktu a hemostázu.",
  "clinicalEffects": [
    "Vyšší riziko podráždění, vředu a krvácení v zažívacím traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Současnému užívání se vyhněte, pokud lékař neurčí jinak."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit kardioprotektivní protidestičkový účinek nízkodávkované kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může při nevhodném časování obsadit vazebné místo cyklooxygenázy v krevních destičkách před kyselinou acetylsalicylovou.",
  "clinicalEffects": [
    "Možné snížení protidestičkového účinku nízkodávkované kyseliny acetylsalicylové."
  ],
  "recommendations": [
    {
      "action": "separate_administration",
      "description": "Pokud je kombinace nezbytná, konzultujte vhodné časování dávek s lékařem nebo lékárníkem."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit expozici ibuprofenu.",
  "mechanism": "Flukonazol inhibuje CYP2C9, který se podílí na metabolismu ibuprofenu.",
  "clinicalEffects": [
    "Možné zvýšení koncentrace ibuprofenu a jeho nežádoucích účinků, včetně zažívacích a renálních."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Sledujte nežádoucí účinky ibuprofenu; při dlouhodobém nebo vysokodávkovaném užívání se poraďte s lékařem."
    }
  ]
}

## gpt-6-luna.standard.2.response.json (6.80s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při užívání warfarinu významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen narušuje funkci krevních destiček a poškozuje sliznici trávicího traktu; warfarin současně tlumí srážení krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména gastrointestinálního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; případné současné užití konzultovat s lékařem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin spolu s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Aspirin tlumí funkci krevních destiček a může poškodit sliznici trávicího traktu; warfarin snižuje srážlivost krve.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci a pod dohledem lékaře."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zvýšit účinek warfarinu a riziko krvácení.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9, a může zesílit jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšené hodnoty INR a riziko krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení nebo ukončení flukonazolu častěji kontrolovat INR a úpravu léčby řešit s lékařem."
    }
  ]
}

## gpt-5.6-terra.standard.2.response.json (48.17s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může významně zvýšit krvácivost při léčbě warfarinem.",
  "mechanism": "Ibuprofen inhibuje funkci trombocytů a poškozuje sliznici trávicího traktu; současně může ovlivnit účinek warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména z trávicího traktu.",
    "Možné zvýšení hodnoty INR."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vyhněte; pro analgezii zvažte vhodnější alternativu po poradě s lékařem."
    },
    {
      "action": "monitor",
      "description": "Je-li souběžné užití nezbytné, sledujte známky krvácení a INR."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin významně zvyšuje krvácivé riziko spojené s warfarinem.",
  "mechanism": "Aspirin nevratně tlumí agregaci trombocytů a zvyšuje poškození sliznice trávicího traktu, což se sčítá s antikoagulačním účinkem warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, včetně krvácení do trávicího traktu.",
    "Možné prodloužení krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívejte pouze při jasné indikaci stanovené lékařem."
    },
    {
      "action": "monitor",
      "description": "Sledujte známky krvácení a podle klinické situace kontrolujte INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9, a může tak zesílit jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Výrazné zvýšení INR.",
    "Zvýšené riziko klinicky významného až závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Pokud je to možné, zvažte jiné antimykotikum nebo postup po dohodě s předepisujícím lékařem."
    },
    {
      "action": "monitor",
      "description": "Při souběžném podání je nutná časná a častější kontrola INR a sledování krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod lékařským dohledem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Souběh zvyšuje riziko krvácení z trávicího traktu a může snížit kardioprotektivní účinek aspirinu.",
  "mechanism": "Oba přípravky jsou nesteroidní protizánětlivé léky a zvyšují poškození sliznice; ibuprofen může při nevhodném časování kompetitivně bránit vazbě aspirinu na trombocyty.",
  "clinicalEffects": [
    "Vyšší riziko podráždění, vředů a krvácení z trávicího traktu.",
    "Při pravidelném ibuprofenu může dojít k oslabení protidestičkového účinku nízkodávkovaného aspirinu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Pravidelnému souběžnému užívání se pokud možno vyhněte."
    },
    {
      "action": "separate_administration",
      "description": "Je-li nízkodávkovaný aspirin nezbytný, řešte vhodné časování ibuprofenu s lékařem nebo lékárníkem."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit koncentraci a účinky ibuprofenu.",
  "mechanism": "Flukonazol může inhibovat CYP2C9, který se podílí na metabolismu ibuprofenu.",
  "clinicalEffects": [
    "Možné zvýšení expozice ibuprofenu.",
    "Vyšší pravděpodobnost nežádoucích účinků ibuprofenu, zejména zažívacích a renálních."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při souběžném užívání sledujte nežádoucí účinky ibuprofenu, zvláště při vyšších dávkách nebo poruše funkce ledvin."
    },
    {
      "action": "adjust_dose",
      "description": "Může být vhodná nejnižší účinná dávka ibuprofenu po co nejkratší dobu."
    }
  ]
}

## gpt-6.1-sol.standard.2.response.json (37.12s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem, i bez zvýšení INR.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci krevních destiček; tyto účinky se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Pokud je kombinace nezbytná, sledovat známky krvácení; samotné sledování INR nevylučuje zvýšené riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin zvyšuje riziko krvácení při léčbě warfarinem i v nízkých protidestičkových dávkách.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí agregaci krevních destiček a poškozuje žaludeční sliznici, čímž zvyšuje krvácivé riziko warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci používat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu samovolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení; normální nebo cílové INR nevylučuje zvýšené riziko."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu a zvýšit INR.",
  "mechanism": "Flukonazol inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Před zahájením nebo ukončením flukonazolu kontaktovat lékaře, který řídí léčbu warfarinem."
    },
    {
      "action": "monitor",
      "description": "Častěji kontrolovat INR během souběžné léčby i po ukončení flukonazolu."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod vedením lékaře."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a aspirin společně zvyšují riziko vředů a krvácení do trávicího traktu.",
  "mechanism": "Sčítá se poškození sliznice trávicího traktu a útlum funkce krevních destiček.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a dvanáctníkových vředů.",
    "Zvýšené riziko krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžnému užívání se pokud možno vyhnout a vhodnou alternativu konzultovat s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkodávkovaného aspirinu.",
  "mechanism": "Ibuprofen může obsazením destičkové COX-1 bránit její nevratné inhibici kyselinou acetylsalicylovou; účinek závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné oslabení protidestičkové a kardioprotektivní účinnosti nízkodávkovaného aspirinu."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod přednostně zvolit jiné analgetikum po konzultaci; pouhé oddělení dávek nemusí při pravidelném užívání ibuprofenu stačit."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zvyšuje expozici aktivnímu enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Zvážit jiné analgetikum nebo úpravu dávky ibuprofenu, zejména při opakovaném užívání."
    },
    {
      "action": "monitor",
      "description": "Při souběžné léčbě sledovat nežádoucí účinky; u rizikových pacientů také funkci ledvin."
    }
  ]
}

## gpt-6.1-sol.fast.2.response.json (20.70s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen výrazně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci krevních destiček, čímž zvyšuje krvácivé riziko při antikoagulační léčbě warfarinem.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; vhodnou léčbu bolesti konzultovat s lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení; samotná kontrola INR nevylučuje zvýšené riziko."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin zvyšuje krvácivé riziko warfarinu i v nízkých antiagregačních dávkách.",
  "mechanism": "Kyselina acetylsalicylová nevratně tlumí agregaci krevních destiček a poškozuje žaludeční sliznici; tyto účinky se sčítají s antikoagulačním účinkem warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu a nitrolebního krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci stanovené lékařem; předepsanou léčbu samovolně neměnit."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR podle lékaře; krvácení může nastat i při terapeutickém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Fluconazole může výrazně zesílit účinek warfarinu a zvýšit INR.",
  "mechanism": "Fluconazole inhibuje zejména CYP2C9, zpomaluje metabolismus warfarinu a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Zajistit častější kontroly INR při zahájení i ukončení léčby fluconazolem."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s aspirinem zvyšuje riziko vředů a krvácení do trávicího traktu.",
  "mechanism": "Oba léky inhibují cyklooxygenázu, narušují ochranu sliznice trávicího traktu a ovlivňují funkci krevních destiček.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a dvanáctníkových vředů.",
    "Zvýšené riziko krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat a vhodnou alternativu proti bolesti projednat s lékařem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit antiagregační účinek nízkých dávek aspirinu.",
  "mechanism": "Ibuprofen může obsadit destičkovou cyklooxygenázu a zabránit její nevratné inhibici kyselinou acetylsalicylovou; účinek závisí na načasování a lékové formě.",
  "clinicalEffects": [
    "Možné snížení kardioprotektivního účinku nízkých dávek aspirinu."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání aspirinu k prevenci cévních příhod preferovat po konzultaci jiné analgetikum, zejména při pravidelné potřebě léčby."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Fluconazole zvyšuje expozici ibuprofenu a může zesílit jeho nežádoucí účinky.",
  "mechanism": "Fluconazole inhibuje CYP2C9 a zpomaluje metabolismus ibuprofenu, čímž zvyšuje jeho expozici.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Při souběžné léčbě zvážit s lékařem alternativu nebo snížení dávky ibuprofenu."
    },
    {
      "action": "monitor",
      "description": "Sledovat zažívací obtíže, známky krvácení a podle rizik také funkci ledvin."
    }
  ]
}

## gpt-6-luna.fast.2.response.json (7.92s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při léčbě warfarinem významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen může poškodit sliznici trávicího traktu a tlumit funkci trombocytů; warfarin omezuje srážení krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména gastrointestinálního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; případné užití ibuprofenu konzultovat s lékařem nebo lékárníkem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin v kombinaci s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Aspirin tlumí funkci trombocytů a může poškodit žaludeční sliznici; warfarin snižuje srážlivost krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze na výslovné doporučení lékaře; sledovat známky krvácení."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může zesílit účinek warfarinu a zvýšit INR.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9.",
  "clinicalEffects": [
    "Může se zvýšit INR a prodloužit srážení krve, což zvyšuje riziko krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení nebo ukončení flukonazolu je třeba častěji kontrolovat INR a léčbu upravit podle lékaře."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Současné užívání ibuprofenu a aspirinu zvyšuje riziko krvácení; ibuprofen může oslabit protidestičkový účinek nízké dávky aspirinu.",
  "mechanism": "Ibuprofen a aspirin společně zvyšují riziko gastrointestinálního poškození a krvácení; ibuprofen může navíc oslabit protidestičkový účinek nízké dávky aspirinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení a poškození trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Pravidelné současné užívání konzultovat s lékařem nebo lékárníkem; při předepsaném nízkodávkovém aspirinu ověřit vhodný odstup."
    }
  ]
}

## gpt-5.6-terra.fast.3.response.json (15.33s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může významně zvýšit riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen může zvyšovat krvácivost inhibicí funkce trombocytů a poškozením gastrointestinální sliznice; může také ovlivnit účinek warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně gastrointestinálního krvácení.",
    "Možné zvýšení hodnoty INR."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívejte; při nutnosti ji řešte s lékařem a sledujte známky krvácení a INR."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová významně zvyšuje krvácivé riziko warfarinu.",
  "mechanism": "Kombinace antikoagulačního účinku warfarinu s ireverzibilní inhibicí funkce trombocytů a poškozením sliznice po kyselině acetylsalicylové.",
  "clinicalEffects": [
    "Výrazně zvýšené riziko krvácení, zejména gastrointestinálního a nitrolebního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci se vyhněte, pokud k ní není jasná lékařská indikace; při nezbytném souběhu je nutné pečlivé klinické sledování."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit antikoagulační účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Při zahájení, změně dávky nebo vysazení flukonazolu je nutná časná a častější kontrola INR; může být potřeba upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen s kyselinou acetylsalicylovou zvyšuje riziko krvácení a může narušit její protidestičkový účinek.",
  "mechanism": "Oba léky poškozují gastrointestinální sliznici a ovlivňují funkci trombocytů; ibuprofen může kompetitivně bránit přístupu kyseliny acetylsalicylové k COX-1 v trombocytech.",
  "clinicalEffects": [
    "Zvýšené riziko gastrointestinálního krvácení a vředů.",
    "Možné oslabení protidestičkového účinku nízkodávkované kyseliny acetylsalicylové při nevhodném časování."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Pravidelnému souběžnému užívání se vyhněte, zejména při kyselině acetylsalicylové k prevenci cévních příhod; případné užití konzultujte s lékařem."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit koncentraci a nežádoucí účinky ibuprofenu.",
  "mechanism": "Flukonazol inhibuje CYP2C9, který se podílí na metabolismu ibuprofenu.",
  "clinicalEffects": [
    "Zvýšená expozice ibuprofenu.",
    "Vyšší riziko nežádoucích účinků ibuprofenu, včetně gastrointestinálního krvácení a poškození ledvin u vnímavých osob."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Používejte nejnižší účinnou dávku ibuprofenu po co nejkratší dobu a sledujte nežádoucí účinky; u rizikových osob konzultujte lékaře."
    }
  ]
}

## gpt-6-luna.fast.3.response.json (9.85s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Ibuprofen narušuje funkci krevních destiček a může poškodit sliznici trávicího traktu; warfarin tlumí srážení krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; pokud je nutná, její vhodnost a sledování krvácení konzultovat s lékařem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin s warfarinem zvyšuje riziko krvácení.",
  "mechanism": "Warfarin tlumí srážení krve a aspirin navíc nevratně potlačuje funkci krevních destiček.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci a pod dohledem lékaře."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může zvýšit účinek warfarinu a INR.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, což může zesílit jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšené INR a riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení nebo vysazení flukonazolu pečlivěji sledovat INR a podle výsledků upravit léčbu pod dohledem lékaře."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen s aspirinem zvyšuje riziko krvácení a může oslabit protidestičkový účinek aspirinu.",
  "mechanism": "Oba léky zvyšují sklon ke krvácení; ibuprofen může obsadit destičkovou COX-1 a bránit aspirinu v jejím nevratném potlačení.",
  "clinicalEffects": [
    "Vyšší riziko krvácení, zejména do trávicího traktu.",
    "Ibuprofen může při současném užití snížit protidestičkový účinek aspirinu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Při pravidelném užívání aspirinu konzultovat vhodnou alternativu k ibuprofenu; případné načasování dávek ověřit s lékařem nebo lékárníkem."
    }
  ]
}

## gpt-5.6-terra.standard.3.response.json (39.25s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při léčbě warfarinem významně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci trombocytů, což zesiluje antikoagulační účinek warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení včetně gastrointestinálního krvácení."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno nepoužívejte; pro analgezii zvažte vhodnější alternativu po poradě s lékařem."
    },
    {
      "action": "monitor",
      "description": "Je-li souběžné podání nezbytné, sledujte známky krvácení a kontrolujte INR."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Aspirin v kombinaci s warfarinem výrazně zvyšuje krvácivé riziko.",
  "mechanism": "Aspirin nevratně tlumí agregaci trombocytů a může poškodit sliznici trávicího traktu; účinky se s warfarinem sčítají.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci používejte jen při jasné indikaci stanovené lékařem."
    },
    {
      "action": "monitor",
      "description": "Při nutném souběžném podání sledujte krvácení a pravidelně kontrolujte INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může významně zesílit účinek warfarinu.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména přes CYP2C9, a může zvýšit jeho expozici.",
  "clinicalEffects": [
    "Vzestup INR.",
    "Zvýšené riziko krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Po zahájení, změně dávky nebo ukončení flukonazolu častěji kontrolujte INR a sledujte krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Dávku warfarinu může být nutné upravit podle INR pod dohledem lékaře."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a aspirin společně zvyšují riziko krvácení do trávicího traktu.",
  "mechanism": "Obě léčiva zvyšují poškození sliznice trávicího traktu a tlumí hemostázu.",
  "clinicalEffects": [
    "Vyšší riziko gastrointestinálního krvácení a vředové komplikace."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžnému užívání se pokud možno vyhněte, zejména bez výslovného doporučení lékaře."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může snížit kardioprotektivní protidestičkový účinek aspirinu.",
  "mechanism": "Ibuprofen může při souběžném užití kompetitivně bránit vazbě aspirinu na cyklooxygenázu v trombocytech.",
  "clinicalEffects": [
    "Možné oslabení protidestičkového účinku nízkodávkovaného aspirinu."
  ],
  "recommendations": [
    {
      "action": "separate_administration",
      "description": "Je-li kombinace nezbytná, konzultujte s lékařem vhodné časování nebo alternativní analgetikum."
    }
  ]
}
### fluconazole + ibuprofen / moderate / limited

{
  "summary": "Flukonazol může zvýšit koncentraci a účinek ibuprofenu.",
  "mechanism": "Flukonazol může inhibicí CYP2C9 zvýšit expozici ibuprofenu.",
  "clinicalEffects": [
    "Možné zvýšení nežádoucích účinků ibuprofenu, včetně gastrointestinálních obtíží."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Sledujte nežádoucí účinky ibuprofenu; při potřebě delší léčby konzultujte lékaře nebo lékárníka."
    }
  ]
}

## gpt-6-luna.standard.3.response.json (8.52s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen může při léčbě warfarinem výrazně zvýšit riziko krvácení.",
  "mechanism": "Ibuprofen tlumí funkci trombocytů a může poškodit sliznici trávicího traktu; warfarin navíc tlumí srážení krve.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména gastrointestinálního."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vyhněte; vhodnou alternativu proti bolesti konzultujte s lékařem."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Kyselina acetylsalicylová zvyšuje při užívání warfarinu riziko krvácení.",
  "mechanism": "Warfarin tlumí koagulaci a kyselina acetylsalicylová nevratně inhibuje funkci trombocytů; může také dráždit žaludeční sliznici.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívejte pouze na doporučení a pod dohledem lékaře."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může zvýšit účinek warfarinu a riziko krvácení.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9, a může zesílit jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšené INR a riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při zahájení nebo ukončení flukonazolu je třeba pečlivě sledovat INR a podle lékaře upravit léčbu warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Současné užívání ibuprofenu a aspirinu zvyšuje riziko krvácení a žaludečních komplikací.",
  "mechanism": "Ibuprofen a kyselina acetylsalicylová ovlivňují funkci trombocytů a společně zvyšují riziko poškození sliznice trávicího traktu.",
  "clinicalEffects": [
    "Vyšší riziko krvácení, zejména gastrointestinálního; možné podráždění a vředové poškození žaludku."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Současné užívání bez doporučení lékaře vynechte; kombinace zvyšuje riziko krvácení."
    }
  ]
}

## gpt-6.1-sol.standard.3.response.json (33.25s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci krevních destiček, čímž zvyšuje krvácivé riziko při léčbě warfarinem i bez zvýšení INR.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat; vhodné analgetikum zvolit s lékařem nebo lékárníkem."
    },
    {
      "action": "monitor",
      "description": "Při nezbytném souběhu sledovat známky krvácení a INR; normální INR nevylučuje zvýšené riziko krvácení."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Warfarin a kyselina acetylsalicylová společně výrazně zvyšují riziko krvácení.",
  "mechanism": "Protidestičkový účinek kyseliny acetylsalicylové a její poškozování žaludeční sliznice se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci používat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu svévolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení a INR; zvýšené krvácivé riziko může přetrvávat i při cílovém INR."
    }
  ]
}
### fluconazole + warfarin / major / established

{
  "summary": "Flukonazol může výrazně zesílit účinek warfarinu a zvýšit INR.",
  "mechanism": "Flukonazol inhibuje metabolismus warfarinu, zejména prostřednictvím CYP2C9, a zesiluje jeho antikoagulační účinek.",
  "clinicalEffects": [
    "Zvýšení INR.",
    "Zvýšené riziko závažného krvácení."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Zajistit častější kontroly INR při zahájení, změně i ukončení léčby flukonazolem."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen a kyselina acetylsalicylová zvyšují riziko vředů a krvácení.",
  "mechanism": "Sčítá se poškozování sliznice trávicího traktu a ovlivnění funkce krevních destiček.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a dvanáctníkových vředů.",
    "Zvýšené riziko krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat, zejména při další léčbě zvyšující riziko krvácení."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkých dávek kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může bránit nevratné inhibici destičkové cyklooxygenázy kyselinou acetylsalicylovou; význam závisí na načasování, lékové formě a četnosti užívání.",
  "clinicalEffects": [
    "Možné snížení ochrany před infarktem myokardu a ischemickou cévní mozkovou příhodou."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání nízkých dávek kyseliny acetylsalicylové k prevenci cévních příhod upřednostnit po konzultaci jiné analgetikum."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol může zvýšit koncentraci ibuprofenu a jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a může zvýšit expozici účinnému enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Zvýšené riziko nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "monitor",
      "description": "Při souběžném užívání sledovat nežádoucí účinky ibuprofenu, zejména u osob s onemocněním ledvin nebo zvýšeným rizikem krvácení."
    },
    {
      "action": "adjust_dose",
      "description": "Podle klinické situace může být vhodné snížit dávku ibuprofenu nebo zvolit jiný lék."
    }
  ]
}

## gpt-6.1-sol.fast.3.response.json (21.23s)

### ibuprofen + warfarin / major / established

{
  "summary": "Ibuprofen významně zvyšuje riziko krvácení při léčbě warfarinem.",
  "mechanism": "Ibuprofen poškozuje sliznici trávicího traktu a tlumí funkci destiček, čímž zvyšuje krvácivé riziko při antikoagulační léčbě warfarinem.",
  "clinicalEffects": [
    "Zvýšené riziko krvácení, zejména do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Kombinaci pokud možno vynechat a s lékařem zvolit vhodnější analgetikum; samotné sledování INR nevylučuje riziko krvácení."
    }
  ]
}
### aspirin + warfarin / major / established

{
  "summary": "Warfarin s kyselinou acetylsalicylovou zvyšují riziko závažného krvácení.",
  "mechanism": "Protidestičkový účinek kyseliny acetylsalicylové a poškození žaludeční sliznice se přidávají k antikoagulačnímu účinku warfarinu.",
  "clinicalEffects": [
    "Zvýšené riziko závažného krvácení včetně krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Kombinaci užívat pouze při jasné indikaci a pod dohledem lékaře; předepsanou léčbu svévolně nevysazovat."
    },
    {
      "action": "monitor",
      "description": "Sledovat známky krvácení; krvácení může vzniknout i při INR v cílovém rozmezí."
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
      "description": "Častěji kontrolovat INR při zahájení, změně i ukončení léčby flukonazolem."
    },
    {
      "action": "adjust_dose",
      "description": "Lékař může podle INR upravit dávku warfarinu."
    }
  ]
}
### aspirin + ibuprofen / major / established

{
  "summary": "Ibuprofen s kyselinou acetylsalicylovou zvyšují riziko krvácení a poškození trávicího traktu.",
  "mechanism": "Sčítá se poškození sliznice trávicího traktu a ovlivnění funkce krevních destiček.",
  "clinicalEffects": [
    "Zvýšené riziko žaludečních a dvanáctníkových vředů a krvácení do trávicího traktu."
  ],
  "recommendations": [
    {
      "action": "avoid_combination",
      "description": "Souběžné užívání pokud možno vynechat, zejména při současné léčbě warfarinem."
    }
  ]
}
### aspirin + ibuprofen / moderate / established

{
  "summary": "Ibuprofen může oslabit protidestičkový účinek nízkodávkované kyseliny acetylsalicylové.",
  "mechanism": "Ibuprofen může při nevhodném načasování obsadit destičkovou cyklooxygenázu a bránit jejímu nevratnému zablokování kyselinou acetylsalicylovou.",
  "clinicalEffects": [
    "Možné snížení ochranného účinku nízkodávkované kyseliny acetylsalicylové proti infarktu a cévní mozkové příhodě."
  ],
  "recommendations": [
    {
      "action": "use_alternative",
      "description": "Při užívání kyseliny acetylsalicylové k prevenci cévních příhod zvolit po poradě s lékařem nebo lékárníkem vhodnější analgetikum."
    }
  ]
}
### fluconazole + ibuprofen / moderate / established

{
  "summary": "Flukonazol může zvýšit koncentraci ibuprofenu a jeho nežádoucí účinky.",
  "mechanism": "Flukonazol inhibuje CYP2C9 a zvyšuje expozici aktivnímu enantiomeru ibuprofenu.",
  "clinicalEffects": [
    "Možné zvýšení rizika nežádoucích účinků ibuprofenu, zejména krvácení do trávicího traktu a poškození ledvin."
  ],
  "recommendations": [
    {
      "action": "consult_clinician",
      "description": "Konzultovat vhodnost kombinace; může být nutné snížení dávky ibuprofenu nebo volba jiného analgetika."
    },
    {
      "action": "monitor",
      "description": "Při souběžném užívání sledovat nežádoucí účinky ibuprofenu."
    }
  ]
}
