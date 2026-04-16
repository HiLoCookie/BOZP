const questions = [
  {
    q: "Který úraz NENÍ považován za pracovní úraz?",
    options: ["Úraz při výkonu práce", "Úraz při pracovní cestě", "Úraz při školení organizovaném zaměstnavatelem", "Úraz na cestě do práce"],
    answer: 3
  },
  {
    q: "Které z následujících patří mezi „5 bezpečnostních tabu“?",
    options: ["Používání ochranných pomůcek", "Oznámení pracovního úrazu", "Nepoužívání OOPP", "Dodržování pracovních postupů"],
    answer: 2
  },
  {
    q: "Jak má zaměstnanec postupovat při úrazu elektrickým proudem?",
    options: ["Okamžitě se dotknout postiženého a odtáhnout ho", "Nejprve přerušit přívod elektrického proudu", "Začít resuscitaci bez ohledu na situaci", "Čekat na odbornou pomoc bez zásahu"],
    answer: 1
  },
  {
    q: "Které tvrzení o práci ve výškách je správné?",
    options: ["Za práci ve výškách se považuje práce nad 0,5 m", "Zaměstnanec nemusí být speciálně školen", "Zaměstnanec musí být zajištěn proti pádu v každém okamžiku", "Práce bez jištění je povolena při krátkodobé činnosti"],
    answer: 2
  },
  {
    q: "Co znamená zkratka BOZP?",
    options: ["Bezpečnost organizace základních procesů", "Bezpečnost a ochrana zdraví při práci", "Bezpečnost osob a zaměstnanců", "Bezpečnostní opatření zaměstnavatele"],
    answer: 1
  },
  {
    q: "Co je zaměstnanec povinen udělat v případě zjištění nebezpečné situace na pracovišti?",
    options: ["Ignorovat ji, pokud se ho netýká", "Okamžitě ji odstranit bez ohledu na své kompetence", "Oznámit ji svému nadřízenému", "Počkat, až ji nahlásí někdo jiný"],
    answer: 2
  }
];

const container = document.getElementById("questions");

questions.forEach((q, i) => {
  const div = document.createElement("div");
  div.innerHTML = `<p>${q.q}</p>` +
    q.options.map((opt, j) =>
      `<label><input type="radio" name="q${i}" value="${j}" required> ${opt}</label><br>`
    ).join("");
  container.appendChild(div);
});

document.getElementById("testForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  let score = 0;

  questions.forEach((q, i) => {
    const answer = document.querySelector(`input[name="q${i}"]:checked`).value;
    if (parseInt(answer) === q.answer) score++;
  });

  const resultDiv = document.getElementById("result");
  resultDiv.innerHTML = `Score: ${score}/6`;

  const passed = score >= 4;

  // Send to backend
  await fetch("/submit", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
        name: document.getElementById("name").value,
        email: document.getElementById("email").value,
        workId: document.getElementById("workId").value,
        company: document.getElementById("company").value,
        score,
        passed
    })
  });

  if (passed) {
    resultDiv.innerHTML += "<br>✅ Passed";
  } else {
    resultDiv.innerHTML += "<br>❌ Failed";
  }
});
