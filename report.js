/* ============================================================
   DENNÍ REPORT ABSOLVENTŮ (Excel) – úložiště Firebase Firestore
   - ukládá úspěšné testy do Firestore (env FIREBASE_SERVICE_ACCOUNT)
   - každé ráno vytvoří pro každou firmu Excel s lidmi, kteří prošli
     a ještě nebyli nahlášeni, a pošle ho na e-mail firmy
   - když nejsou žádné nové záznamy, e-mail se neposílá
   ============================================================ */

const ExcelJS = require("exceljs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const TZ = "Europe/Prague";
const COLLECTION = "test_results";

/* ---------------- DATUMY (vždy podle pražského času) ---------------- */

// "2026-10-10"
function pragueDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(date);
}

// "2026-10-10" -> "10. 10. 2026"
function formatCz(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${d}. ${m}. ${y}`;
}

// "2026-10-10" -> Date (UTC půlnoc), aby Excel zobrazil správný den
function excelDate(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/* ---------------- DATABÁZE (Firestore) ---------------- */

// Vrací Firestore, nebo null, když chybí FIREBASE_SERVICE_ACCOUNT
// (nebo je nastaven FIRESTORE_EMULATOR_HOST pro lokální testování).
function createDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  if (!raw && !emulator) return null;

  if (!getApps().length) {
    if (raw) {
      initializeApp({ credential: cert(JSON.parse(raw)) });
    } else {
      initializeApp({ projectId: process.env.GCLOUD_PROJECT || "demo-pohas" });
    }
  }
  return getFirestore();
}

async function saveResult(db, { company, name, score, passedAt, expiresAt }) {
  await db.collection(COLLECTION).add({
    company,
    name,
    score,
    passedAt,                       // Date -> Firestore Timestamp
    passedOn: pragueDate(passedAt), // "YYYY-MM-DD"
    expiresOn: pragueDate(expiresAt),
    reported: false,
    reportedAt: null
  });
}

/* ---------------- EXCEL ---------------- */

async function buildWorkbook(rows) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "POHAS s.r.o.";
  wb.created = new Date();

  const ws = wb.addWorksheet("BOZP a PO", {
    views: [{ state: "frozen", ySplit: 1 }]
  });

  ws.columns = [
    { header: "Č.",                 key: "no",        width: 6 },
    { header: "Jméno a příjmení",   key: "name",      width: 34 },
    { header: "Skóre (max. 8)",     key: "score",     width: 16 },
    { header: "Datum absolvování",  key: "passedOn",  width: 20, style: { numFmt: "dd.mm.yyyy" } },
    { header: "Platnost do",        key: "expiresOn", width: 16, style: { numFmt: "dd.mm.yyyy" } }
  ];

  rows.forEach((r, i) => {
    ws.addRow({
      no: i + 1,
      name: r.name,
      score: r.score,
      passedOn: excelDate(r.passed_on),
      expiresOn: excelDate(r.expires_on)
    });
  });

  const header = ws.getRow(1);
  header.height = 22;
  header.eachCell(cell => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB00020" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });

  ws.getColumn("no").alignment = { horizontal: "center" };
  ws.getColumn("score").alignment = { horizontal: "center" };
  ws.autoFilter = { from: "A1", to: `E${rows.length + 1}` };

  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------------- DENNÍ JOB ----------------

   Do reportu patří záznamy, které
     - ještě nebyly nahlášeny (reported == false),
     - vznikly před dneškem (tedy včera, případně dříve, pokud
       by některý běh vypadl),
     - mají stále platný certifikát.
   Po úspěšném odeslání se označí reported = true, takže každý člověk
   přijde do reportu právě jednou. Když firma nemá nové záznamy,
   nic se neposílá.

   TESTOVACÍ REŽIM (test = true):
     - zahrne i dnešní záznamy,
     - pošle e-mail jen na testEmail (ne firmě), předmět má prefix [TEST],
     - nic neoznačí jako nahlášené (ostrý report pak proběhne normálně).
--------------------------------------------- */

let running = false;

async function runDailyReport({ db, users, sendMail, now = new Date(), test = false, testEmail, quiet = false }) {
  if (running) return { skipped: "already running" };
  running = true;

  try {
    const today = pragueDate(now);

    // jediný filtr v dotazu = žádný složený index není potřeba;
    // data a platnost se filtrují v kódu (nenahlášených záznamů je vždy málo)
    const snap = await db.collection(COLLECTION).where("reported", "==", false).get();

    const rows = snap.docs
      .map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          company: d.company,
          name: d.name,
          score: d.score,
          passed_on: d.passedOn,
          expires_on: d.expiresOn,
          passedAtMs: d.passedAt?.toMillis ? d.passedAt.toMillis() : new Date(d.passedAt).getTime()
        };
      })
      .filter(r => (test ? r.passed_on <= today : r.passed_on < today) && r.expires_on >= today)
      .sort((a, b) => a.company.localeCompare(b.company) || a.passedAtMs - b.passedAtMs);

    if (rows.length === 0) {
      if (!quiet) console.log("DAILY REPORT: žádné nové záznamy, e-mail se neposílá");
      return { sent: [], skipped: "no new entries" };
    }

    const byCompany = {};
    for (const r of rows) (byCompany[r.company] ||= []).push(r);

    const sent = [];
    const failed = [];

    for (const [key, list] of Object.entries(byCompany)) {
      const user = users[key];
      const to = test ? testEmail : user?.companyEmail;

      if (!user || key === "admin" || !to) {
        console.warn(`DAILY REPORT: firma "${key}" nemá nastavený e-mail, ${list.length} záznamů zůstává k odeslání`);
        failed.push({ company: key, reason: "no recipient" });
        continue;
      }

      try {
        const first = list[0].passed_on;
        const last = list.reduce((max, r) => (r.passed_on > max ? r.passed_on : max), first);
        const period = first === last ? formatCz(first) : `${formatCz(first)} – ${formatCz(last)}`;

        const xlsx = await buildWorkbook(list);

        await sendMail({
          to: [to],
          subject: `${test ? "[TEST] " : ""}BOZP a PO – přehled absolventů za ${period} (${list.length})`,
          html:
            (test ? `<p><strong>TESTOVACÍ E-MAIL</strong> – určeno pouze pro kontrolu, firma ho nedostala.</p>` : "") +
            `<p>Dobrý den,</p>` +
            `<p>v příloze zasíláme přehled osob, které úspěšně absolvovaly školení a test BOZP a PO ` +
            `(${user.companyName}, období: <strong>${period}</strong>, celkem <strong>${list.length}</strong>).</p>` +
            `<p>POHAS s.r.o.</p>`,
          attachments: [
            {
              name: `bozp-absolventi-${last}.xlsx`,
              content: xlsx.toString("base64")
            }
          ]
        });

        // označíme až po úspěšném odeslání – při chybě se zkusí příště
        if (!test) {
          for (let i = 0; i < list.length; i += 400) {
            const batch = db.batch();
            for (const r of list.slice(i, i + 400)) {
              batch.update(db.collection(COLLECTION).doc(r.id), {
                reported: true,
                reportedAt: new Date()
              });
            }
            await batch.commit();
          }
        }

        sent.push({ company: key, to, count: list.length, test });
        console.log(`DAILY REPORT OK${test ? " (TEST)" : ""}: ${key} -> ${to} (${list.length})`);
      } catch (err) {
        console.error(`DAILY REPORT ERROR (${key}):`, err);
        failed.push({ company: key, reason: err.message });
      }
    }

    return { sent, failed };
  } finally {
    running = false;
  }
}

module.exports = {
  createDb,
  saveResult,
  buildWorkbook,
  runDailyReport,
  pragueDate
};
