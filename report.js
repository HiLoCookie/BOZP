/* ============================================================
   DENNÍ REPORT ABSOLVENTŮ (Excel)
   - ukládá úspěšné testy do Postgresu (env DATABASE_URL)
   - každé ráno vytvoří pro každou firmu Excel s lidmi, kteří prošli
     a ještě nebyli nahlášeni, a pošle ho na e-mail firmy
   - když nejsou žádné nové záznamy, e-mail se neposílá
   ============================================================ */

const ExcelJS = require("exceljs");
const { Pool } = require("pg");

const TZ = "Europe/Prague";

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

/* ---------------- DATABÁZE ---------------- */

function createPool() {
  if (!process.env.DATABASE_URL) return null;

  return new Pool({
    connectionString: process.env.DATABASE_URL,
    // Render/Neon/Supabase vyžadují SSL; pro lokální DB nastav DATABASE_SSL=false
    ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: 3
  });
}

async function initDb(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_results (
      id          SERIAL PRIMARY KEY,
      company     TEXT        NOT NULL,
      name        TEXT        NOT NULL,
      score       INTEGER     NOT NULL,
      passed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      passed_on   DATE        NOT NULL,
      expires_on  DATE        NOT NULL,
      reported_at TIMESTAMPTZ
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS test_results_unreported_idx
    ON test_results (company, passed_on) WHERE reported_at IS NULL
  `);
}

async function saveResult(pool, { company, name, score, passedAt, expiresAt }) {
  await pool.query(
    `INSERT INTO test_results (company, name, score, passed_at, passed_on, expires_on)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [company, name, score, passedAt, pragueDate(passedAt), pragueDate(expiresAt)]
  );
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
    { header: "Č.",                 key: "no",      width: 6 },
    { header: "Jméno a příjmení",   key: "name",    width: 34 },
    { header: "Skóre (max. 8)",     key: "score",   width: 16 },
    { header: "Datum absolvování",  key: "passedOn", width: 20, style: { numFmt: "dd.mm.yyyy" } },
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
     - ještě nebyly nahlášeny (reported_at IS NULL),
     - vznikly před dneškem (tedy včera, případně dříve, pokud
       by některý běh vypadl),
     - mají stále platný certifikát.
   Po úspěšném odeslání se označí reported_at, takže každý člověk
   přijde do reportu právě jednou. Když firma nemá nové záznamy,
   nic se neposílá.
--------------------------------------------- */

let running = false;

async function runDailyReport({ pool, users, sendMail, now = new Date() }) {
  if (running) return { skipped: "already running" };
  running = true;

  try {
    const today = pragueDate(now);

    const { rows } = await pool.query(
      `SELECT id, company, name, score,
              passed_at,
              passed_on::text  AS passed_on,
              expires_on::text AS expires_on
       FROM test_results
       WHERE reported_at IS NULL
         AND passed_on < $1::date
         AND expires_on >= $1::date
       ORDER BY company, passed_at`,
      [today]
    );

    if (rows.length === 0) {
      console.log("DAILY REPORT: žádné nové záznamy, e-mail se neposílá");
      return { sent: [], skipped: "no new entries" };
    }

    const byCompany = {};
    for (const r of rows) (byCompany[r.company] ||= []).push(r);

    const sent = [];
    const failed = [];

    for (const [key, list] of Object.entries(byCompany)) {
      const user = users[key];
      const to = user?.companyEmail;

      if (!user || key === "admin" || !to) {
        console.warn(`DAILY REPORT: firma "${key}" nemá nastavený e-mail, ${list.length} záznamů zůstává k odeslání`);
        failed.push({ company: key, reason: "no recipient" });
        continue;
      }

      try {
        const first = list[0].passed_on;
        const last = list[list.length - 1].passed_on;
        const period = first === last ? formatCz(first) : `${formatCz(first)} – ${formatCz(last)}`;

        const xlsx = await buildWorkbook(list);

        await sendMail({
          to: [to],
          subject: `BOZP a PO – přehled absolventů za ${period} (${list.length})`,
          html:
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
        await pool.query(
          `UPDATE test_results SET reported_at = now() WHERE id = ANY($1::int[])`,
          [list.map(r => r.id)]
        );

        sent.push({ company: key, to, count: list.length });
        console.log(`DAILY REPORT OK: ${key} -> ${to} (${list.length})`);
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
  createPool,
  initDb,
  saveResult,
  buildWorkbook,
  runDailyReport,
  pragueDate
};
