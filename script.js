const questions = [
  {
    q: "Mezi důležitá telefonní čísla pro případ nouze nepatří:",
    options: ["112", "150, 155 a 158", "0609 123 456"],
    answer: 2
  },
  {
    q: "V objektu je nutno z pohledu požární ochrany:",
    options: [
      "skladovat co nejvíc papíru, palet a dalšího hořlavého materiálu",
      "udržovat volné únikové cesty a přístup k prostředkům požární ochrany",
      "větrat po dobu polední pauzy na půdě"
    ],
    answer: 1
  },
  {
    q: "Kouřit na pracovišti se:",
    options: [
      "může kdekoliv a kdykoliv",
      "nesmí, výjimkou je šatna a jídelna",
      "může pouze ve vyhrazených prostorách",
      "může kdekoliv, pouze se souhlasem nadřízeného"
    ],
    answer: 2
  },
  {
    q: "Každý zaměstnanec je povinen:",
    options: [
      "dbát o své zdraví a bezpečnost práce na svém pracovišti",
      "ve svém volnu odpočívat",
      "informovat nadřízeného o vztazích na pracovišti"
    ],
    answer: 0
  },
  {
    q: "Zaměstnavatel je povinen:",
    options: [
      "přidělovat zaměstnancům osobní ochranné pracovní pomůcky",
      "zpříjemnit zaměstnanců pracovní prostředí květinami",
      "sdružovat kolektiv pomocí večírků"
    ],
    answer: 0
  },
  {
    q: "Zajišťování bezpečnosti a ochrany zdraví při práci:",
    options: [
      "záleží na finančních prostředcích zaměstnavatele",
      "je základní povinností zaměstnavatele",
      "je dáno počtem zaměstnanců na pracovišti"
    ],
    answer: 1
  },
  {
    q: "Požívání alkoholických nápojů a toxických látek je na pracovišti a v pracovní době:",
    options: [
      "přísně zakázáno",
      "povoleno",
      "povoleno pouze za přítomnosti vedoucího zaměstnance a pouze víno"
    ],
    answer: 0
  },
  {
    q: "Mezi životní funkce patří:",
    options: [
      "sluch, zrak a čich",
      "srdeční funkce, dýchání a krevní oběh",
      "správná životospráva, jídlo a pití"
    ],
    answer: 1
  }
];

const container = document.getElementById("questions");

/* ---------------- RENDER OTÁZEK ---------------- */
questions.forEach((q, i) => {
  const div = document.createElement("div");

  div.innerHTML =
    `<p>${q.q}</p>` +
    q.options
      .map(
        (opt, j) => `
        <label>
          <input type="radio" name="q${i}" value="${j}" required>
          ${opt}
        </label><br>`
      )
      .join("");

  container.appendChild(div);
});

/* ---------------- SUBMIT ---------------- */
document.getElementById("testForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  let score = 0;

  /* vyhodnocení */
  questions.forEach((q, i) => {
    const checked = document.querySelector(`input[name="q${i}"]:checked`);
    if (checked && Number(checked.value) === q.answer) {
      score++;
    }
  });

  const passed = score >= 6;

  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `Score: ${score}/8`;
  resultDiv.innerHTML += passed
    ? "<br>✅ Úspěšné splnění testu"
    : "<br>❌ Neúspěšné splnění testu";

  /* ---------------- INPUTS ---------------- */
  const name = document.getElementById("name")?.value?.trim();
  const email = document.getElementById("email")?.value?.trim();

  const companySelect = document.getElementById("company");
  const company = companySelect?.value || "";
  const companyDisplay =
    companySelect?.selectedOptions?.[0]?.text || company || "Neuvedeno";

  if (!name || !email || !company) {
    alert("Vyplň jméno, email a firmu");
    return;
  }

  /* ---------------- SEND ---------------- */
  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include", // 🔐 session cookie
      body: JSON.stringify({
        name,
        email,
        company,          // 🔥 důležité: "soud", "ostatni"
        companyDisplay,   // 🔥 zobrazovaný název
        score,
        passed
      })
    });

    const text = await res.text();
    console.log("SERVER RESPONSE:", text);

    if (!res.ok) {
      alert("❌ Chyba: " + text);
      return;
    }

    alert("✅ Hotovo: " + text);

  } catch (err) {
    console.error("❌ FETCH ERROR:", err);
    alert("Nepodařilo se odeslat formulář");
  }
});
