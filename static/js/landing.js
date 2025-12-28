document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("zip-rate-form");
  const zipInput = document.getElementById("zip-code-input");
  const stickyCta = document.getElementById("sticky-nav-cta");

  if (!form || !zipInput) {
    return;
  }

  const tnmpZips = [
    "76043",
    "76048",
    "76050",
    "76055",
    "76077",
    "76093",
    "76401",
    "76433",
    "76436",
    "76442",
    "76453",
    "76455",
    "76457",
    "76463",
    "76472",
    "76475",
    "76476",
    "76484",
    "76528",
    "76531",
    "76538",
    "76627",
    "76629",
    "76634",
    "76636",
    "76638",
    "76649",
    "76652",
    "76665",
    "76671",
    "76689",
    "76690",
    "76692",
    "77511",
    "77512",
    "77539",
    "77546",
    "77565",
    "77573",
    "77581",
    "77584",
    "77588",
    "77422",
    "77463",
    "77480",
    "77486",
    "77515",
    "77511",
    "77539",
    "77550",
    "77568",
    "77573",
    "77590",
    "77591",
    "77592",
    "75028",
    "75029",
    "75056",
    "75057",
    "75067",
    "75077",
    "75003",
    "75096",
    "75117",
    "75407",
    "75409",
    "75412",
    "75413",
    "75414",
    "75416",
    "75417",
    "75423",
    "75424",
    "75434",
    "75435",
    "75436",
    "75440",
    "75442",
    "75452",
    "75453",
    "75462",
    "75468",
    "75472",
    "75475",
    "75485",
    "75487",
    "75489",
    "75490",
    "75491",
    "76027",
    "76205",
    "76209",
    "76227",
    "76251",
    "76255",
    "76258",
    "76261",
    "76265",
    "76271",
    "76301",
    "76305",
    "76310",
    "76357",
    "76365",
    "76370",
    "76372",
    "76374",
    "76377",
    "76427",
    "76450",
    "76459",
    "76460",
    "76481",
    "79719",
    "79730",
    "79735",
    "79740",
    "79745",
    "79772",
    "79777",
    "79785",
    "79788",
    "79789",
    "79848",
  ];

  const sanitizeZip = () => {
    const digitsOnly = zipInput.value.replace(/\D/g, "").slice(0, 5);
    if (zipInput.value !== digitsOnly) {
      zipInput.value = digitsOnly;
    }
    zipInput.setCustomValidity("");
  };

  // CRITICAL: Always check the specific TNMP zip list before general prefix rules to handle service area overlaps.
  const getTDUFromZip = (zip) => {
    if (tnmpZips.includes(zip)) {
      return "TNMP";
    }

    const firstTwoDigits = zip.slice(0, 2);
    const firstThreeDigits = parseInt(zip.slice(0, 3), 10);

    if (firstTwoDigits === "77") {
      return "CenterPoint";
    }

    if (firstTwoDigits === "75" || firstTwoDigits === "76") {
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

  if (stickyCta) {
    stickyCta.addEventListener("click", (event) => {
      sanitizeZip();

      const zip = zipInput.value.trim();
      const isValidZip = /^\d{5}$/.test(zip);

      if (!isValidZip) {
        return;
      }

      const tdu = getTDUFromZip(zip);
      const destinationUrl = new URL(stickyCta.href, window.location.origin);
      destinationUrl.searchParams.set("pc", zip);
      destinationUrl.searchParams.set("tdu", tdu);

      event.preventDefault();
      window.location.href = destinationUrl.toString();
    });
  }

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

    const tdu = getTDUFromZip(zip);
    const searchParams = new URLSearchParams({ pc: zip, tdu });
    window.location.href = `/calculator?${searchParams.toString()}`;
  });
});
