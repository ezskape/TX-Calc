document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("plan-form");
  const resultsSection = document.getElementById("results");
  const errorSection = document.getElementById("error");
  const trueRate = document.getElementById("true-rate");
  const billAmount = document.getElementById("bill-amount");
  const errorMessage = document.getElementById("error-message");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideSection(errorSection);

    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const response = await fetch("/api/calculate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Unable to calculate. Check your inputs and try again.");
      }

      trueRate.textContent = data.true_rate_display;
      billAmount.textContent = data.bill_amount_display;
      showSection(resultsSection);
    } catch (error) {
      errorMessage.textContent = error.message;
      showSection(errorSection);
      hideSection(resultsSection);
    }
  });
});

function showSection(section) {
  section.hidden = false;
}

function hideSection(section) {
  section.hidden = true;
}
