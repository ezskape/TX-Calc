let resultsContent;
let resultNote;
let resultsPlaceholder;

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("plan-form");
  const errorSection = document.getElementById("error");
  const trueRate = document.getElementById("true-rate");
  const billAmount = document.getElementById("bill-amount");
  const errorMessage = document.getElementById("error-message");
  resultsContent = document.getElementById("results-content");
  resultNote = document.getElementById("result-note");
  resultsPlaceholder = document.getElementById("results-placeholder");

  hideResults();
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
      showResults();
    } catch (error) {
      errorMessage.textContent = error.message;
      showSection(errorSection);
      hideResults();
    }
  });

  form.addEventListener("input", () => {
    if (!form.checkValidity()) {
      hideResults();
    }
  });
});

function showSection(section) {
  section.hidden = false;
}

function hideSection(section) {
  section.hidden = true;
}

function showResults() {
  resultsContent.classList.remove("is-hidden");
  resultNote.classList.remove("is-hidden");
  resultsPlaceholder.classList.add("is-hidden");
}

function hideResults() {
  resultsContent.classList.add("is-hidden");
  resultNote.classList.add("is-hidden");
  resultsPlaceholder.classList.remove("is-hidden");
}
