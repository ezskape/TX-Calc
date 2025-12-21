document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("zip-rate-form");
  const zipInput = document.getElementById("zip-code-input");
  const stickyCta = document.getElementById("sticky-nav-cta");

  if (!form || !zipInput) {
    return;
  }

  const sanitizeZip = () => {
    const digitsOnly = zipInput.value.replace(/\D/g, "").slice(0, 5);
    if (zipInput.value !== digitsOnly) {
      zipInput.value = digitsOnly;
    }
    zipInput.setCustomValidity("");
  };

  const determineTdu = (zip) => {
    const firstTwoDigits = zip.slice(0, 2);
    const firstThreeDigits = parseInt(zip.slice(0, 3), 10);

    if (firstTwoDigits === "77") {
      return "CenterPoint";
    }

    if (firstTwoDigits === "75" || (firstThreeDigits >= 760 && firstThreeDigits <= 763)) {
      return "Oncor";
    }

    if (firstThreeDigits >= 783 && firstThreeDigits <= 785) {
      return "AEP_Central";
    }

    if (firstThreeDigits >= 795 && firstThreeDigits <= 796) {
      return "AEP_North";
    }

    if (firstThreeDigits >= 764 && firstThreeDigits <= 766) {
      return "TNMP";
    }

    return "Custom";
  };

  zipInput.addEventListener("input", sanitizeZip);

  const toggleStickyCta = () => {
    if (!stickyCta) return;
    if (window.scrollY > 500) {
      stickyCta.classList.add("is-visible");
    } else {
      stickyCta.classList.remove("is-visible");
    }
  };

  toggleStickyCta();
  window.addEventListener("scroll", toggleStickyCta, { passive: true });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    sanitizeZip();

    const zip = zipInput.value.trim();
    const isValidZip = /^\d{5}$/.test(zip);

    if (!isValidZip) {
      zipInput.setCustomValidity("Enter a valid 5-digit zip code to continue.");
      zipInput.reportValidity();
      return;
    }

    const tdu = determineTdu(zip);
    const searchParams = new URLSearchParams({ zip, tdu });
    window.location.href = `/calculator?${searchParams.toString()}`;
  });
});
