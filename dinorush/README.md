# DinoRUSH – Závod evoluce

Dětská 3D arkádová závodní hra pro tablet (landscape), určená zhruba pro děti od 4 do 9 let.
Tři dinosauří závodníci běží sami. Hráč jen včas vybírá správného dinosaura pro terén, který se blíží:

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
npm test             # 68 unit testů herní logiky (Vitest)
npm run build        # typová kontrola + produkční build do dist/
npm run preview      # spuštění produkčního buildu (http://localhost:4173)
npm run e2e          # build + 21 end-to-end testů v Chromiu (Playwright)
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
│  │  └─ setup.ts                  # sestavení závodníků a drah z nastavení
│  ├─ progression/                 # profil, verzované ukládání, odměny, RPG, vajíčka, úkoly, park, pohár
│  ├─ render/                      # 3D VYKRESLOVÁNÍ (jen čte stav enginu)
│  │  ├─ dinoModels.ts             # procedurální low-poly dinosauři + animace + doplňky + „bake“
│  │  ├─ trackRenderer.ts          # dráhy, značky, brány, překážky s rozpadem, mince (instancing)
│  │  ├─ worldBuilder.ts           # prostředí 4 světů, streamované po kusech, počasí
│  │  ├─ raceRenderer.ts           # scéna, kamera, komprese rozestupů, efekty z událostí
│  │  ├─ racerVisual.ts            # závodník: 4 modely, proměna, aura schopnosti, prach/cákance
│  │  ├─ particles.ts              # částice v jednom draw callu
│  │  ├─ stage.ts / parkRenderer.ts# 3D náhledy v menu/sbírce/vejcích a 3D Dino Park
│  │  └─ textures.ts               # procedurální textury terénu a značek (canvas)
│  ├─ audio/sound.ts               # syntetizované efekty + jednoduchá hudba (Web Audio)
│  ├─ state/store.ts               # stavový automat aplikace (MENU, RACE_SETUP, RACE, REWARDS…)
│  ├─ ui/                          # React obrazovky a herní HUD
│  │  ├─ race/RaceController.ts    # smyčka rAF, pauza, přechod na pozadí, úklid zdrojů
│  │  ├─ race/RaceScreen.tsx       # 3D + HUD + ovládací panely 1–3 hráčů (Pointer Events)
│  │  └─ screens/                  # menu, nastavení závodu, výsledky, pohár, sbírka, vajíčka, park, úkoly, nastavení
│  └─ styles/app.css
├─ tests/                          # Vitest – generátor, engine, AI, režimy, ekonomika, ukládání
└─ e2e/run-e2e.mjs                 # Playwright – 21 scénářů včetně multi-touch a offline PWA
```

**Architektonické zásady**

- Herní pravidla (`game/`, `progression/`) nezávisí na vykreslování. Engine se dá spustit v Node a vítěze vždy určí simulace.
- Simulace běží s pevným krokem 1/60 s. Výsledek tak nezávisí na FPS, a co se odehraje mezi snímky, se dopočítá. Po pauze nebo návratu z pozadí se delta času omezí.
- Nový dinosaurus, terén, překážka, svět nebo režim = nový záznam v `config/` (a případně vizuál v `render/`). Herní logiku není třeba přepisovat.
- Modely dinosaurů vytváří továrna `createDino()`. Později je lze nahradit glTF modely, aniž by se měnila logika.

## 6. Co je hotové (skutečně funkční)

**Závod a mechaniky**
- 3D závod tří dinosaurů na třech oddělených dráhách se stejnou tratí a vlastními překážkami pro každou dráhu.
- Odpočet 3–2–1–START, automatický pohyb, startovní a cílová brána, cílová rovinka, výsledky podle skutečných časů.
- 4 archetypy s odlišnými modely a animacemi (běh, plavání, brodění, klouzání, šplhání, náraz, oslava) a proměna jedním dotykem s efektem (0,4 s) a cooldownem 0,3 s.
- Výpočet rychlosti: základ (podle obtížnosti) × vhodnost terénu (1,12 / 0,80 / 0,60 / 0,45) × bonusy (perfektní proměna, turbo komba, týmové turbo, schopnost) × RPG (max. +12 %). Plynulé zrychlení i zpomalení, minimální rychlost, takže nikdo nikdy neuvízne.
- Překážky: Ankylosaurus je rozbije (rozpad na kusy, úlomky, otřes kamery), ostatní je pomalu přelezou.
- Upozornění na blížící se terén: plovoucí značka s ikonou (u snadnější obtížnosti i s dinosaurem), barevná brána, čip „další terén“ s odpočtem, pulzující tlačítko s ručičkou (Malý dinosaurus) a zvukový signál.
- **Perfektní proměna**: okno 1,0 s před změnou až 0,3 s po ní. Dává boost 1,2× a mince. Kdo se přepne dřív, nezpomalí (při „připravenosti“ platí násobič aspoň 1,0) a úsek se mu počítá jako správný.
- **Dino kombo** podle úspěšně projetých úseků (aspoň 60 % úseku se správným dinosaurem): každé 3× turbo, každé 5× bonusové mince, chyba kombo přeruší.
- **Speciální schopnosti** se nabíjejí správným používáním a aktivují samy (SUPER SPRINT, VODNÍ VLNA, NEZASTAVITELNÝ NÁRAZ, NEZASTAVITELNÝ POSTUP). Ukazatel nabití je kroužek na tlačítku.
- **Dynamické události** (6 typů: padající strom, sesuv balvanů, záplava s deštěm, sněžení, sopečný otřes, kamenná zeď) jsou ohlášené předem, dávají vždy dost času na reakci a mají animaci i oznámení.
- **AI soupeři** používají stejná pravidla i stejné tlačítkové API. Mají tři profily: Začátečník (~70 % správně), Pokročilý (~85 %), Šampion (~94 %). Mají reakční dobu, chybují, opravují chyby, dělají komba a používají schopnosti. Žádné falešné dohánění.
- **3 obtížnosti** (upozornění 4 / 2,5 / 1,5 s, tempo, délka a střídání úseků, penalizace, nápovědy, síla AI) a **4 světy** (Pravěká džungle, Sopkové údolí, Ledová říše, Dinosauří ostrovy) s vlastním terénem, scenérií, osvětlením, mlhou a počasím.
- Generátor tratí se seedem: stejný seed znamená stejnou trať („HRÁT ZNOVU“ ji zopakuje). Začíná snadnými úseky a hlídá minimální délku úseku, takže reakce je vždy fyzicky možná (ověřeno testy pro všechny světy a obtížnosti).
- Kamera sleduje lidské hráče. Při velkém rozestupu vizuálně zhustí vzdálenosti (pořadí se zachová) a skutečný odstup ukazuje HUD.

**Režimy (6)**: Klasický závod · Dino pohár (5 závodů ve 4 světech, body 10/6/4, průběžná tabulka, finále s odměnou, uložená historie, pokračování po restartu) · Útěk před T-Rexem (skutečná vzdálenost T-Rexe, hravé předběhnutí, hvězdičky) · Nekonečná výprava (postupná trať, zrychlování, skóre, ukončení a uložení rekordu) · Zlatá horečka (mince za správné úseky, perfektní proměny, komba a zlaté úseky; vítězí nejvíc mincí) · Týmový závod (společné skóre, týmové turbo, porazit létajícího Ptéra = časový limit).

**Multiplayer na jednom tabletu**: 1 hráč + 2 AI, 2 hráči + 1 AI, 3 hráči. Panely jsou rozložené zleva doprava stejně jako dráhy, každý má 2×2 tlačítka, jméno, barvu, pořadí, kombo a další terén. Pointer Events zvládají víc současných dotyků. V soutěžním multiplayeru se RPG statistiky normalizují.

**Progrese**: mince a XP po každém závodě (rozpis odměn). 10 úrovní dinosaurů. Vylepšení RYCHLOST / PROMĚNA / VÝDRŽ za mince (5 stupňů, podmíněno úrovní, každé má měřitelný vliv). Sbírka s 3D náhledy, 12 dinosaurů (4 základní a 8 variant se sólo perky) a 5 doplňků (čepička, brýle, korunka, šála, kytička), které jsou vidět i ve 3D. Sestavení aktivní čtveřice (vždy pokrývá všechny 4 schopnosti). Vajíčko po každých 3 závodech podle předvídatelné sekvence, s animací třesení, prasklin, rozlomení a odhalení. Dino Park 5×4 ve 3D s nákupem 10 dekorací, umístěním, přesunem, uklizením a dinosaury, kteří se procházejí. 16 automaticky vyhodnocovaných úkolů a rekordy.

**Ostatní**: interaktivní tutoriál na skutečné trati (zpomalení, zvýraznění tlačítka, lze přeskočit). Syntetizované zvuky (~22 efektů) a hudba, startují až po dotyku. Nastavení (hlasitost, hudba, efekty, omezení animací, kvalita grafiky, výchozí obtížnost, znovu tutoriál, smazání postupu s dvojitým potvrzením). Verzované ukládání s migrací, validací a zálohou poškozených dat. Pauza při přechodu na pozadí. Výzva k otočení na šířku. PWA instalace a offline režim. Podpora klávesnice na PC (hráč 1: `1–4` / `A S D F`, hráč 2: `Q W E R`, hráč 3: `U I O P`, pauza `Esc` / mezerník).

## 7. Testy

- `npm test`: 68 unit testů. Pokrývají determinismus a validitu tratí pro všechny světy a obtížnosti, násobiče rychlosti, cooldown, perfektní proměnu (i to, že dřívější reakce nezpomalí), kombo, schopnosti, překážky, pořadí v cíli, přesnost a sílu AI, délku závodů 90–150 s, všech 6 režimů, normalizaci v multiplayeru, odměny, vylepšení, vajíčka, park, úkoly, pohár, ukládání (včetně poškozených dat a migrace).
- `npm run e2e`: 21 scénářů v Chromiu. Odpovídají testům 1–20 ze zadání a navíc testují tutoriál. Používají skutečné dotyky přes CDP, včetně tří prstů najednou, emulaci iPadu, simulaci přechodu na pozadí a offline režim. Výsledek: `e2e/out/report.md` a screenshoty v `e2e/out/`.

Poslední běh: **68/68 unit testů a 21/21 E2E scénářů prošlo.**

## 8. Omezení první verze

- **Výkon na skutečném tabletu nebyl změřen.** Vývoj probíhal v kontejneru bez GPU (softwarové vykreslování ~12 FPS). Scéna je optimalizovaná na ~170–230 draw callů a ~40 tisíc trojúhelníků na snímek, s omezeným pixel ratio a bez stínů a postprocessingu. Na běžném tabletu by to mělo stačit na plynulý chod, ale ověřit to je potřeba na zařízení. V Nastavení lze vypnout „Vysokou kvalitu grafiky“.
- **Zvuky a hudba nebyly v testech poslechově ověřeny** (headless prohlížeč). Jsou syntetizované a záměrně tiché.
- Testy proběhly v Chromiu (desktop + emulace iPadu). Safari na iPadu a Chrome na Androidu je potřeba vyzkoušet ručně. Ověřit hlavně multi-touch, zvuk po prvním dotyku a instalaci na plochu.
- Modely jsou procedurální z primitiv (záměrně, bez externích souborů). Animace jsou jednoduché procedurální.
- Na úzkých dráhách se při velkém rozestupu dráhy vůči sobě vizuálně posunou (komprese vzdáleností). Skutečné pořadí a odstup ukazuje HUD.
- Dynamické události mění vždy jen jeden úsek. Kombinované víceúsekové události zatím nejsou.
- Hudba je jedna krátká smyčka pro menu a jedna pro závod.
- Jeden společný profil pro celý tablet. Mince z multiplayeru se sčítají do jedné peněženky.
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
