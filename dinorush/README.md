# DinoRUSH – Závod evoluce

Dětská 3D arkádová závodní hra pro tablet (landscape), určená zhruba pro děti od 4 do 9 let.
Pět dinosauřích závodníků běží samo. Hráč jen včas vybírá správného dinosaura pro terén, který se blíží:

| Terén | Nejlepší dinosaurus |
|---|---|
| Tráva, pevná cesta, most | **Velociraptor – RYCHLÍK** (zelený) |
| Voda, hluboká voda | **Spinosaurus – PLAVEC** (modrý) |
| Kameny, dřevěná bariéra, skalní suť | **Ankylosaurus – BOURÁK** (oranžový) |
| Bahno, písek, sníh, led | **Triceratops – TEREŇÁK** (fialový) |

Technologie: TypeScript, React 19, Vite, Three.js (procedurální low-poly 3D), Web Audio API (syntetizované zvuky), LocalStorage a PWA (manifest a service worker). Hra nemá backend a nepotřebuje internet.

---

## 1. Rychlý start

Potřebujete Node.js 20 nebo novější (testováno s Node 22).

```bash
cd dinorush
npm install          # instalace závislostí
npm run dev          # vývojový server (http://localhost:5173 + adresa v síti)
```

Další příkazy:

```bash
npm test             # 87 unit testů herní logiky (Vitest)
npm run build        # typová kontrola + produkční build do dist/
npm run preview      # spuštění produkčního buildu (http://localhost:4173)
npm run e2e          # build + 25 end-to-end testů v Chromiu (Playwright)
```

> `npm run e2e` potřebuje nainstalovaný Playwright s Chromiem (`npm i -D playwright && npx playwright install chromium`).
> Ve vývojovém kontejneru byl k dispozici globálně.

## 2. Hra na tabletu ve stejné Wi-Fi síti

1. Počítač i tablet musí být ve stejné Wi-Fi.
2. Na počítači spusťte `npm run dev`. Vite vypíše například:
   ```
   ➜  Local:   http://localhost:5173/
   ➜  Network: http://192.168.1.23:5173/
   ```
3. Na tabletu otevřete v Safari nebo Chromu adresu **Network**, tedy `http://192.168.1.23:5173/`.
4. Tablet otočte na šířku. V portrait orientaci hra ukáže výzvu k otočení.
5. Pokud se stránka nenačte, povolte port 5173 ve firewallu počítače.

Produkční verzi lze v síti spustit stejně: `npm run build && npm run preview` a pak na tabletu otevřít `http://<IP>:4173/`.

## 2b. Online verze (GitHub Pages)

Sestavená hra je v repozitáři ve složce `dinorush-hra/` (větev `main`). Pokud má repozitář zapnuté GitHub Pages
(Settings → Pages → Deploy from a branch → `main` / `(root)`), hraje se na adrese:

**https://dahor212.github.io/test/dinorush-hra/**

Aktualizace online verze po změně kódu:

```bash
cd dinorush && npm run build && cd ..
rm -rf dinorush-hra && cp -r dinorush/dist dinorush-hra
git add dinorush-hra && git commit -m "Aktualizace DinoRUSH" && git push
```

## 3. Produkční verze

```bash
npm run build
```

Výsledek je ve složce `dist/` (statické soubory s relativními cestami). Lze ji nahrát na libovolný statický hosting, například GitHub Pages, Netlify nebo vlastní server, i do podsložky.

## 4. Offline PWA – jak ji otestovat

Service worker se registruje jen v produkčním buildu. Prohlížeče ho povolí jen v **zabezpečeném kontextu**, tedy na HTTPS nebo na `localhost`. Přes `http://192.168.x.x` v lokální síti offline režim fungovat nebude.

Test na počítači:

1. `npm run build && npm run preview`
2. Otevřete `http://localhost:4173/` a stránku jednou obnovte (service worker si stáhne všechny soubory).
3. V DevTools → Network zapněte **Offline** (nebo vypněte síť) a stránku znovu obnovte. Hra se načte a lze závodit.

Test na tabletu:

1. Nahrajte `dist/` na HTTPS hosting (např. GitHub Pages).
2. Otevřete hru na tabletu a přidejte ji na plochu: iPad: Sdílet → Přidat na plochu, Android: menu → Nainstalovat aplikaci.
3. Zapněte režim Letadlo a spusťte ikonu DinoRUSH.

Automatický test T20 přesně tento postup ověřuje v Chromiu: zaregistruje service worker, odpojí síť, načte hru znovu a spustí závod.

---

## 5. Struktura projektu

```
dinorush/
├─ index.html, vite.config.ts      # Vite + vlastní plugin generující sw.js (precache všech souborů)
├─ public/                         # manifest.webmanifest, ikony (SVG + PNG + maskable)
├─ scripts/make-icons.mjs          # vyrenderuje PNG ikony z SVG (Playwright)
├─ src/
│  ├─ types/index.ts               # všechny datové typy (DinosaurDefinition, RaceState, PlayerProfile…)
│  ├─ config/                      # LADICÍ HODNOTY – nic z toho není v komponentách
│  │  ├─ gameConfig.ts             # rychlosti, násobiče, perfektní okno, kombo, schopnosti, RPG limity
│  │  ├─ dinosaurs.ts              # archetypy, schopnosti, registr dinosaurů a variant, doplňky
│  │  ├─ terrain.ts                # registr terénů (vhodnost dinosaurů) a překážek
│  │  ├─ worlds.ts                 # 4 světy (pool terénů, události, barvy, mlha, světla)
│  │  ├─ difficulty.ts             # 3 obtížnosti + profily AI
│  │  ├─ modes.ts                  # 6 herních režimů + pravidla poháru
│  │  ├─ campaign.ts               # kariéra: 6 oblastí × 5 míst na mapě, krajina tratí, cíle hvězd, fosilie, úrovně průzkumníka
│  │  ├─ economy.ts                # odměny, XP úrovně, ceny vylepšení, sekvence vajíček, dekorace
│  │  └─ missions.ts               # úkoly (podmínka = funkce nad statistikami)
│  ├─ core/rng.ts                  # deterministický seedovaný generátor
│  ├─ game/                        # ČISTÁ HERNÍ LOGIKA (bez Three.js a Reactu, testovatelná v Node)
│  │  ├─ trackGenerator.ts         # datově řízený generátor tratí (seed, intro, události, mince, endless)
│  │  ├─ physics.ts                # výpočet násobičů (terén, penalizace, RPG, perky)
│  │  ├─ raceEngine.ts             # simulace s pevným krokem: proměny, perfektní proměna, kombo,
│  │  │                            #   schopnosti, překážky, události, cíl, výsledky
│  │  ├─ modes.ts                  # pravidla režimů (T-Rex, pohár, endless, zlatá horečka, tým)
│  │  ├─ ai.ts                     # AI soupeři (reakční doba, přesnost, chyby, oprava chyb)
│  │  ├─ tutorial.ts               # řízení interaktivního tutoriálu
│  │  ├─ ghost.ts                  # záznam a přehrávání jízdy (duch vlastního rekordu)
│  │  └─ setup.ts                  # sestavení závodníků a drah z nastavení
│  ├─ progression/                 # profily, verzované ukládání, odměny, RPG, vajíčka, úkoly, park, pohár,
│  │                               #   campaign.ts (hvězdy, odemykání), daily.ts (denní výzva)
│  ├─ render/                      # 3D VYKRESLOVÁNÍ (jen čte stav enginu)
│  │  ├─ creature.ts               # „modelovací dílna“: plynulá těla (loft), kostra, šupinatá kůže, klouby
│  │  ├─ dinoKit.ts                # společná dílna dinosaurů: kostra, kůže, oči, zuby, svalnaté nohy, ruce
│  │  ├─ dinoModels.ts             # Velociraptor, Spinosaurus/Baryonyx, Ankylosaurus, Triceratops/Styracosaurus, T-Rex, Ptéro + animace
│  │  ├─ species.ts                # Gallimimus, Dilophosaurus, Stegosaurus, Pachycephalosaurus, Brachiosaurus
│  │  ├─ trackPath.ts              # zatáčející stezka (vzdálenost → 3D poloha), údolí, řeky a jezera
│  │  ├─ terrainArt.ts             # ručně „malované“ přírodní textury terénů (bez obrázků) v jednom texture array
│  │  ├─ trail.ts                  # jedna souvislá stezka: plynulé přechody terénů, měkké okraje, pěna u vody
│  │  ├─ trackScene.ts             # dekorace terénů, most, brány se značkami, překážky přes celou cestu, mince
│  │  ├─ worldBuilder.ts           # kopce údolí, vegetace podél zatáček, hory, moře, počasí
│  │  ├─ raceRenderer.ts           # scéna, kamera jedoucí za dinosaury, efekty z událostí
│  │  ├─ racerVisual.ts            # závodník: 4 modely, proměna, aura schopnosti, prach/cákance
│  │  ├─ ghostVisual.ts            # průsvitný duch předchozí nejlepší jízdy
│  │  ├─ particles.ts              # částice v jednom draw callu
│  │  ├─ stage.ts / parkRenderer.ts# 3D náhledy v menu/sbírce/vejcích a 3D Dino Park
│  │  └─ textures.ts               # procedurální textury terénu a značek (canvas)
│  ├─ audio/sound.ts               # syntetizované efekty + jednoduchá hudba (Web Audio)
│  ├─ state/store.ts               # stavový automat aplikace (PROFILES, MENU, CAMPAIGN, DAILY, RACE, REWARDS…)
│  ├─ ui/                          # React obrazovky a herní HUD
│  │  ├─ race/RaceController.ts    # smyčka rAF, pauza, přechod na pozadí, úklid zdrojů
│  │  ├─ race/RaceScreen.tsx       # 3D + HUD + ovládací panely 1–3 hráčů (Pointer Events)
│  │  └─ screens/                  # profily, menu, mapa dobrodružství, denní výzva, nastavení závodu, výsledky,
│  │                               #   pohár, sbírka, vajíčka, park, úkoly, nastavení
│  └─ styles/                      # app.css (základ, závodní HUD, animace), screens.css (jednotný vzhled
│                                  #   všech menu obrazovek: nebe s kopci, bílé panely, karty s obrázkem)
├─ tests/                          # Vitest – generátor, engine, AI, režimy, ekonomika, ukládání, kampaň, duch, profily
└─ e2e/run-e2e.mjs                 # Playwright – 25 scénářů včetně multi-touch, offline PWA, dobrodružství a profilů
```

**Prohlížeč modelů pro vývoj**: při `npm run dev` otevřete `http://localhost:5173/dev/dinos.html`
(parametry např. `?view=side&mode=run`, `?ids=trex,ptero`). Do produkční verze se nedostane.

**Architektonické zásady**

- Herní pravidla (`game/`, `progression/`) nezávisí na vykreslování. Engine se dá spustit v Node a vítěze vždy určí simulace.
- Simulace běží s pevným krokem 1/60 s. Výsledek tak nezávisí na FPS, a co se odehraje mezi snímky, se dopočítá. Po pauze nebo návratu z pozadí se delta času omezí.
- Nový dinosaurus, terén, překážka, svět nebo režim = nový záznam v `config/` (a případně vizuál v `render/`). Herní logiku není třeba přepisovat.
- Modely dinosaurů vytváří továrna `createDino()`. Později je lze nahradit glTF modely, aniž by se měnila logika.

## 6. Co je hotové (skutečně funkční)

**Závod a mechaniky**
- 3D závod **pěti dinosaurů** (1–3 lidští hráči + počítačoví soupeři do počtu pěti) na jedné společné stezce se stejnou tratí pro všechny.
- Odpočet 3–2–1–START, automatický pohyb, startovní a cílová brána, cílová rovinka, výsledky podle skutečných časů.
- 4 archetypy s odlišnými modely a animacemi (běh, plavání, brodění, klouzání, šplhání, náraz, oslava) a proměna jedním dotykem s efektem (0,4 s) a cooldownem 0,3 s.
- Výpočet rychlosti: základ (podle obtížnosti) × vhodnost terénu (správný 1,15 / použitelný 0,72 / špatný 0,45 / úplně nevhodný 0,32) × bonusy (perfektní proměna, turbo komba, týmové turbo, schopnost) × RPG (max. +12 %). Plynulé zrychlení i zpomalení, minimální rychlost, takže nikdo nikdy neuvízne. Špatně zvolený dinosaurus je tak zhruba 2,5–3,5× pomalejší než ten správný a soupeři s dobrou volbou rychle utečou. U obtížnosti Malý dinosaurus je penalizace mírnější.
- Překážky: Ankylosaurus je rozbije (rozpad na kusy, úlomky, otřes kamery), ostatní je pomalu přelezou.
- Upozornění na blížící se terén: plovoucí značka s ikonou (u snadnější obtížnosti i s dinosaurem), barevná brána, čip „další terén“ s odpočtem, pulzující tlačítko s ručičkou (Malý dinosaurus) a zvukový signál.
- **Perfektní proměna**: okno 1,0 s před změnou až 0,3 s po ní. Dává boost 1,2× a mince. Kdo se přepne dřív, nezpomalí (při „připravenosti“ platí násobič aspoň 1,0) a úsek se mu počítá jako správný.
- **Dino kombo** podle úspěšně projetých úseků (aspoň 60 % úseku se správným dinosaurem): každé 3× turbo, každé 5× bonusové mince, chyba kombo přeruší.
- **Speciální schopnosti** se nabíjejí správným používáním a aktivují samy (SUPER SPRINT, VODNÍ VLNA, NEZASTAVITELNÝ NÁRAZ, NEZASTAVITELNÝ POSTUP). Ukazatel nabití je kroužek na tlačítku.
- **Dynamické události** (6 typů: padající strom, sesuv balvanů, záplava s deštěm, sněžení, sopečný otřes, kamenná zeď) jsou ohlášené předem, dávají vždy dost času na reakci a mají animaci i oznámení.
- **AI soupeři** používají stejná pravidla i stejné tlačítkové API. Mají tři profily: Začátečník (~70 % správně), Pokročilý (~85 %), Šampion (~94 %). Mají reakční dobu, chybují, opravují chyby, dělají komba a používají schopnosti. Žádné falešné dohánění.
- **3 obtížnosti** (upozornění 4 / 2,5 / 1,5 s, tempo, délka a střídání úseků, penalizace, nápovědy, síla AI) a **4 světy** (Pravěká džungle, Sopkové údolí, Ledová říše, Dinosauří ostrovy) s vlastním terénem, scenérií, osvětlením, mlhou a počasím.
- Generátor tratí se seedem: stejný seed znamená stejnou trať („HRÁT ZNOVU“ ji zopakuje). Začíná snadnými úseky a hlídá minimální délku úseku, takže reakce je vždy fyzicky možná (ověřeno testy pro všechny světy a obtížnosti).
- **Jedna společná stezka**: všech pět dinosaurů běží po jedné přírodní cestě jako smečka (volně se vlní a v zatáčkách nadbíhají dovnitř). Terény do sebe plynule přecházejí (tráva s vyšlapanou cestičkou, mokrý břeh s pěnou u vody), okraje stezky se nepravidelně ztrácejí v trávě a lemují je trsy trávy, kamínky a kytky. Překážka (kmen, zeď, balvany, ledové bloky) vede přes celou šířku cesty a každý ji prorazí tam, kde běží. Dinosauři i stromy vrhají skutečné stíny, na obloze plují mraky.
- **Trať vede krajinou**: plynule zatáčející stezka údolím mezi kopci. Řeka protéká napříč celým údolím (rákosí, lekníny, kameny na březích), bahno je bažina, písek duny, led zamrzlé jezero, sníh sněžné pole a most vede přes řeku (v sopkách přes lávu). Kamera jede za posledním lidským hráčem, natáčí se se zatáčkami a při větším rozestupu hráčů se oddálí. Skutečné pořadí ukazuje tabulka vlevo nahoře (ikona aktuálního dinosaura a odstup v metrech) a ukazatel postupu tratí nahoře.
- **Dinosauři připomínají skutečné druhy**: plynulé tělo s ohýbajícím se krkem a ocasem, mohutná svalnatá stehna zapuštěná do těla, štíhlé běháky s lýtkem a tříprsté nohy s drápy (dvounožci), sloupovité nohy s polštáři a nehty (čtyřnožci), čelisti se zuby, oči se zornicí a šupinatá kůže se vzorem. **19 dinosaurů v 11 druzích**: Velociraptor, Gallimimus a Dilophosaurus (RYCHLÍCI), Spinosaurus a Baryonyx (PLAVCI), Ankylosaurus, Stegosaurus a Pachycephalosaurus (BOURÁCI), Triceratops, Styracosaurus a Brachiosaurus (TEREŇÁCI). Každý nový druh má vlastní model (ploténky a bodce stegosaura, kopule tvrdohlavce, dlouhý krk brachiosaura, bodcovitý límec styracosaura, hřebínky dilophosaura…) a vlastní malý bonus.

**Režimy (6)**: Klasický závod · Dino pohár (5 závodů ve 4 světech, body 10/7/5/3/1, průběžná tabulka, finále s odměnou, uložená historie, pokračování po restartu) · Útěk před T-Rexem (skutečná vzdálenost T-Rexe, hravé předběhnutí, hvězdičky) · Nekonečná výprava (postupná trať, zrychlování, skóre, ukončení a uložení rekordu) · Zlatá horečka (mince za správné úseky, perfektní proměny, komba a zlaté úseky; vítězí nejvíc mincí) · Týmový závod (společné skóre, týmové turbo, porazit létajícího Ptéra = časový limit).

**Multiplayer na jednom tabletu**: v závodě je vždy 5 dinosaurů: 1 hráč + 4 AI, 2 hráči + 3 AI, 3 hráči + 2 AI. Ovládací panely jsou rozložené zleva doprava, každý má jméno, barvu, medaili s pořadím, kombo, ukazatel rychlosti (zelený / oranžový / červený podle toho, jak dinosaurus sedí na terén), kartu „teď / další terén“ s odpočtem a velká tlačítka dinosaurů (jeden hráč 1×4, víc hráčů 2×2) s ukazatelem nabití schopnosti. Pointer Events zvládají víc současných dotyků. V soutěžním multiplayeru se RPG statistiky normalizují.

**Progrese**: mince a XP po každém závodě (rozpis odměn). 10 úrovní dinosaurů. Vylepšení RYCHLOST / PROMĚNA / VÝDRŽ za mince (5 stupňů, podmíněno úrovní, každé má měřitelný vliv). Sbírka s 3D náhledy, 19 dinosaurů (4 základní, 8 barevných variant a 7 nových druhů, všichni kromě základních se sólo perky) a 5 doplňků (čepička, brýle, korunka, šála, kytička), které jsou vidět i ve 3D. Sestavení aktivní čtveřice (vždy pokrývá všechny 4 schopnosti). Vajíčko po každých 3 závodech podle předvídatelné sekvence, s animací třesení, prasklin, rozlomení a odhalení. Dino Park 5×4 ve 3D s nákupem 10 dekorací, umístěním, přesunem, uklizením a dinosaury, kteří se procházejí. 16 automaticky vyhodnocovaných úkolů a rekordy.

**Dlouhodobá motivace**
- **Profily hráčů („Kdo hraje?“)**: až 4 děti na jednom tabletu. Každé má vlastní jméno, avatara (dinosaurus + barva), mince, dinosaury, park, úkoly, hvězdy a duchy. Při spuštění s více profily se hra nejdřív zeptá, kdo hraje. Ve společném závodě si na 2. a 3. místo lze vybrat jiný profil (závodí se svými dinosaury a odměny dostane do svého profilu) nebo hosta.
- **Dobrodružství = kariéra na mapě**: velký ilustrovaný ostrov se šesti oblastmi: Pravěký prales, Mlžné bažiny, Písečný kaňon, Sopečné údolí, Ledová doba a Dinosauří ostrovy. Má 30 míst spojených cestami, které se za pralesem větví, a hráčův avatar po mapě putuje. **Trať se odvíjí od místa**: každé místo má vlastní směs terénů (bažiny = bahno a voda, kaňon = písek, suť a skály, Ledová doba = sníh a led, Lávové mosty = mosty nad lávou), vlastní oblohu, mlhu a počasí (v bažinách prší, v Ledové době sněží). Karta místa ukazuje, jaké terény na trati čekají. Každé místo má 3 hvězdy za konkrétní cíle a na konci oblasti je boss: obří T-Rex se jménem, nebo pojmenovaný šampion oblasti, kterého je třeba předběhnout.
- **RPG prvky v dětském stylu**: *úroveň průzkumníka* (Vajíčko → Mládě → Průzkumník → Stopař → Závodník → Šampion → Dino legenda) za zkušenosti z kariéry, s odměnou za každou novou úroveň (mince, vajíčka). Na sedmi místech hráč *potká nového dinosaura*, který se k němu po doběhnutí přidá do sbírky. Za 3 hvězdy na místě *najde fosilii* (24 fosilií: zub T-Rexe, jantar s komárem, amonit…). Za poraženého bosse dostane *odznak oblasti*. Odznaky, kamarády i fosilie má v *batohu*. Dřívější postup v Dobrodružství se zachoval.
- **Denní výzva**: každý den jedna nová trať (střídají se světy i režimy), stejná pro všechny. Za první dokončení dne +50 mincí, za 3 hvězdy +30. **Rodinná tabulka** ukazuje dnešní nejlepší výsledky všech profilů. Žádné série: vynechaný den nic nebere.
- **Duch vlastního rekordu**: hra zaznamená tvoji nejlepší jízdu na úrovni dobrodružství a v denní výzvě (a i u „HRÁT ZNOVU“ na stejné trati). Při dalším pokusu běží vedle tebe průsvitný dinosaurus „Duch“, na ukazateli postupu je jeho značka a v panelu odstup v metrech. Ve výsledcích se ukáže, o kolik sekund jsi ducha porazil(a).
- 4 nové úkoly: Hvězdný dobrodruh, Krotitel T-Rexe, Denní závodník, Rychlejší než duch.

**Vzhled menu**: všechny obrazovky mimo závod sdílejí jeden designový systém: stejné pozadí (nebe, mraky a kopce), bílé zaoblené panely, stejné záhlaví (tlačítko zpět, ikona, nadpis, mince), karty s barevným obrázkem nahoře a textem dole, krokový ukazatel při nastavení závodu a spodní lištu s ikonami v hlavním menu.

**Ostatní**: interaktivní tutoriál na skutečné trati (zpomalení, zvýraznění tlačítka, lze přeskočit). Syntetizované zvuky (~22 efektů) a hudba, startují až po dotyku. Nastavení (hlasitost, hudba, efekty, omezení animací, kvalita grafiky, výchozí obtížnost, znovu tutoriál, smazání postupu s dvojitým potvrzením). Verzované ukládání s migrací, validací a zálohou poškozených dat. Pauza při přechodu na pozadí. Výzva k otočení na šířku. PWA instalace a offline režim. Podpora klávesnice na PC (hráč 1: `1–4` / `A S D F`, hráč 2: `Q W E R`, hráč 3: `U I O P`, pauza `Esc` / mezerník).

## 7. Testy

- `npm test`: 87 unit testů. Pokrývají determinismus a validitu tratí pro všechny světy a obtížnosti, násobiče rychlosti, cooldown, perfektní proměnu (i to, že dřívější reakce nezpomalí), kombo, schopnosti, překážky, pořadí v cíli, přesnost a sílu AI, délku závodů 90–150 s, všech 6 režimů, normalizaci v multiplayeru, odměny, vylepšení, vajíčka, park, úkoly, pohár, ukládání (včetně poškozených dat a migrace).
- `npm run e2e`: 25 scénářů v Chromiu. Odpovídají testům 1–20 ze zadání a navíc testují tutoriál, dobrodružství (hvězdy, odemčení, uložení), ducha, denní výzvu s rodinnou tabulkou a profily (nový hráč, společný závod s odměnami pro oba, výběr hráče po spuštění). Používají skutečné dotyky přes CDP, včetně tří prstů najednou, emulaci iPadu, simulaci přechodu na pozadí a offline režim. Výsledek: `e2e/out/report.md` a screenshoty v `e2e/out/`.

Poslední běh: **87/87 unit testů a 25/25 E2E scénářů prošlo.**

## 8. Omezení první verze

- **Výkon na skutečném tabletu nebyl změřen.** Vývoj probíhal v kontejneru bez GPU (softwarové vykreslování ~6–12 FPS). Scéna má ~180–250 draw callů a ~90 tisíc trojúhelníků na snímek (nová krajina a detailnější dinosauři), s omezeným pixel ratio a bez stínů a postprocessingu. Na běžném tabletu by to mělo stačit na plynulý chod, ale ověřit to je potřeba na zařízení. V Nastavení lze vypnout „Vysokou kvalitu grafiky“.
- **Zvuky a hudba nebyly v testech poslechově ověřeny** (headless prohlížeč). Jsou syntetizované a záměrně tiché.
- Testy proběhly v Chromiu (desktop + emulace iPadu). Safari na iPadu a Chrome na Androidu je potřeba vyzkoušet ručně. Ověřit hlavně multi-touch, zvuk po prvním dotyku a instalaci na plochu.
- Modely se generují kódem (záměrně, bez externích souborů). Animace jsou procedurální, chodidla při běhu trochu kloužou.
- Kamera sleduje posledního lidského hráče. Počítačový soupeř, který běží těsně za ním, se skryje, aby nezakrýval výhled (v pořadí je dál vidět). Když se hráči hodně rozdělí, ten vepředu je v obraze menší.
- Dynamické události mění vždy jen jeden úsek. Kombinované víceúsekové události zatím nejsou.
- Hudba je jedna krátká smyčka pro menu a jedna pro závod.
- V lokální síti přes `http://` nefunguje offline režim (omezení prohlížečů), viz kapitola 4.

## 9. Návrhy dalšího rozvoje

1. Více dinosaurů v rámci archetypu s odlišnými vlastnostmi (registr je připravený: `config/dinosaurs.ts` a `VariantPerk`).
2. Kombinované překážky a události přes více úseků (např. záplava, pak sesuv, pak led) pro vyšší obtížnosti.
3. glTF modely a skeletální animace místo primitiv (stačí nová továrna místo `createDino`).
4. Další světy (Pouštní kaňon, Noční džungle) a nové typy překážek, které stačí přidat do registrů.
5. Profily pro více dětí na jednom tabletu a samostatné peněženky.
6. Režim „duch“ (závod proti vlastnímu nejlepšímu času na stejném seedu).
7. Rozšíření Dino Parku: větší mapa, interakce s dinosaury (krmení, hraní), sezónní dekorace bez časového nátlaku.
8. Hlasové pokyny pro nečtenáře („Voda! Spinosaurus!“) a volitelná vyšší kontrastní paleta.
9. Ladění ekonomiky podle skutečného hraní dětí (hodnoty jsou v `config/economy.ts` a `config/gameConfig.ts`).
10. Automatické nasazení `dist/` na GitHub Pages (workflow), aby šla PWA snadno instalovat na tablet.
