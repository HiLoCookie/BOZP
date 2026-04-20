const questions = [/* nechávám jak máš */];

const container = document.getElementById("questions");

/* render */
questions.forEach((q, i) => {
  const div = document.createElement("div");

  div.innerHTML =
    `<p>${q.q}</p>` +
    q.options.map((opt, j) => `
      <label>
        <input type="radio" name="q${i}" value="${j}" required>
        ${opt}
      </label><br>
    `).join("");

  container.appendChild(div);
});

/* submit */
document.getElementById("testForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  let score = 0;

  questions.forEach((q, i) => {
    const checked = document.querySelector(`input[name="q${i}"]:checked`);
    if (checked && Number(checked.value) === q.answer) score++;
  });

  const passed = score >= 6;

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const companySelect = document.getElementById("company");

  const company = companySelect.value;
  const companyDisplay = companySelect.selectedOptions[0]?.text;

  if (!name || !email || !company) {
    alert("Vyplň všechna pole");
    return;
  }

  try {
    const res = await fetch("/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name,
        email,
        company,
        companyDisplay,
        score,
        passed
      })
    });

    const text = await res.text();

    if (!res.ok) {
      alert("❌ " + text);
      return;
    }

    alert("✅ " + text);

  } catch (err) {
    console.error(err);
    alert("Chyba odeslání");
  }
});
