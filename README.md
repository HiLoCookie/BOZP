# BOZP
BOZP test generující certifikáty o splnění a odesílá na mail.

Celý BOZP test je schovaný pod /login.html kde je přes externí stránku řešený env klíč kvůli anonymitě a ochraně údajů.
Je to také z důvodu prevence random bot spammu, který by mohl zahltit stránku a také koncovou firmu na kterou se certifikace odesílají (Poskytovatel, Firma a Testovaný).

Je možné přidávat více USERŮ (tedy firem které outsourcujích školení).
V tomto případě je potřeba upravit env variables (přidat COMPANY_XXX_USERNAME, COMPANY_XXX_PASS, COMPANY_XXX - email), server.js /* ---------------- USERS ---------------- */ a index.html do roletky


