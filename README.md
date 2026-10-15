# BOZP
BOZP test generující certifikáty o splnění a odesílá na mail.

Celý BOZP test je schovaný pod /login.html kde je přes externí stránku řešený env klíč kvůli anonymitě a ochraně údajů.
Je to také z důvodu prevence random bot spammu, který by mohl zahltit stránku a také koncovou firmu na kterou se certifikace odesílají (Poskytovatel, Firma a Testovaný).

Je možné přidávat více USERŮ (tedy firem které outsourcujích školení).
V tomto případě je potřeba upravit env variables (přidat COMPANY_XXX_USERNAME, COMPANY_XXX_PASS, COMPANY_XXX - email), server.js /* ---------------- USERS ---------------- */ a index.html do roletky



## Denní Excel report absolventů

Každé ráno (8:00) se každé firmě (`COMPANY_XXX_EMAIL`) pošle jeden Excel s lidmi, kteří **včera** prošli testem
(jméno, skóre, datum absolvování, platnost do). Pokud nikdo nový neprošel, e-mail se neposílá.
Certifikát se posílá okamžitě po úspěšném testu **jen absolventovi a na `EMAIL_USER`** (POHAS). Firma certifikáty
nedostává – dostává pouze denní tabulku na adresu `COMPANY_XXX_EMAIL` (např. `COMPANY_SOUD_EMAIL=soud@teplice.cz`).

Výsledky testů se ukládají do Firebase Firestore (kolekce `test_results`). Záznam se po odeslání reportu označí
jako nahlášený, takže se nikdy neposílá dvakrát; když odeslání selže, pošle se při dalším běhu.

### Nastavení Firebase
1. https://console.firebase.google.com → **Add project** (např. `pohas-bozp`), Google Analytics vypnout.
2. **Build → Firestore Database → Create database** → lokalita `eur3` (Europe) → **Production mode**.
3. **⚙ Project settings → Service accounts → Generate new private key** → stáhne se soubor `.json`.
   Tento soubor NIKDY nenahrávat na GitHub.
4. Render → služba → **Environment**:
   - `FIREBASE_SERVICE_ACCOUNT` = celý obsah staženého `.json` souboru (otevřít v poznámkovém bloku, vše zkopírovat a vložit),
   - `CRON_SECRET` = dlouhé náhodné heslo (jen pro plánovač).
5. Nahrát nové soubory na GitHub (`server.js`, `report.js`, `package.json`, `package-lock.json`) – Render se nasadí sám.

### Plánovač (cron-job.org, zdarma)
- URL: `https://<tvoje-aplikace>.onrender.com/cron/daily-report`
- Hlavička `Authorization: Bearer <CRON_SECRET>` (nebo jednodušeji `?key=<CRON_SECRET>` na konci URL)
- Každý den v 8:00, časová zóna **Europe/Prague**; druhá úloha v 8:15 jako pojistka (když se Render po uspání
  nestihne probudit). Druhý běh nic neodešle, pokud první prošel.

### Vyzkoušení
1. V aplikaci projít test jako firma **Ostatní** (aby certifikát nešel soudu).
2. Ve Firebase konzoli (Firestore) se objeví záznam v `test_results`.
3. V prohlížeči otevřít `https://<aplikace>/cron/daily-report?test=1&key=<CRON_SECRET>`
   → na `EMAIL_USER` přijde `[TEST]` e-mail s Excelem. Testovací režim zahrne i dnešní záznamy, posílá jen na
   `EMAIL_USER` a nic neoznačí jako odeslané.
4. Testovací záznam potom ve Firestore smazat, jinak půjde zítra v ostrém reportu firmě „Ostatní“.

### Spolehlivost
- Server odpovídá na `/healthz` (bez přihlášení). Na cron-job.org přidej úlohu, která v **7:50** zavolá
  `https://<aplikace>/healthz` – probudí Render, aby ve 8:00 už běžel.
- Pojistka: pokud ranní volání cronu selže, server report odešle sám, jakmile je vzhůru a je po 8:00.
- Proti dvojitým certifikátům: tlačítko se při odesílání zamkne a server stejného člověka (jméno + e-mail + firma)
  v okně 10 minut nezpracuje dvakrát.
- `COMPANY_XXX_EMAIL` je nově jen adresa pro tabulku. Proměnné `EMAIL_PASS`, `BASE_URL` a `COMPANY_SOUD` /
  `COMPANY_OSTATNI` (bez `_EMAIL`) aplikace nepoužívá – lze smazat.
