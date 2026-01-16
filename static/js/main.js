// Delivery rates keyed by TDU identifier. Update this object when fees change
// to keep the dropdown and auto-fill values in sync across the calculator.
const tduFees = {
  CenterPoint: {
    name: "CenterPoint",
    delivery_per_kwh: 5.9027,
    base_delivery: 4.9,
  },
  Oncor: {
    name: "Oncor",
    delivery_per_kwh: 5.6032,
    base_delivery: 4.23,
  },
  "AEP Texas North": {
    name: "AEP Texas North",
    delivery_per_kwh: 5.9318,
    base_delivery: 3.24,
  },
  "AEP Texas Central": {
    name: "AEP Texas Central",
    delivery_per_kwh: 6.0648,
    base_delivery: 3.24,
  },
  TNMP: {
    name: "TNMP",
    delivery_per_kwh: 7.2055,
    base_delivery: 7.85,
  },
};

const energyRateInputIds = [
  "fixed-energy-rate",
  "credit-energy-rate",
  "touOnPeakRate",
  "touOffPeakRate",
];

const normalizationFlashDurationMs = 900;
let supabaseClient = null;

document.addEventListener("DOMContentLoaded", () => {
  let tduController;
  const activePanelId = setupTabs((panelId) => {
    if (tduController) {
      tduController.handleTabChange(panelId);
    }
  });

  tduController = setupTduSelector();
  setupEnergyRateNormalization();
  applyUrlParameters();

  supabaseClient = initializeSupabaseClient();
  setupLeadCapture();

  const initialPanelId =
    document.querySelector(".tab-panel.is-active")?.id || activePanelId;
  if (tduController && initialPanelId) {
    tduController.handleTabChange(initialPanelId);
  }

  setupTouCalculator();
  setupInlineHelpers();

  const panels = document.querySelectorAll(".tab-panel");
  panels.forEach((panel) => {
    const form = panel.querySelector(".plan-form");
    if (!form) {
      return;
    }

    new PlanCalculator(panel, form);
  });
});

class PlanCalculator {
  constructor(panel, form) {
    this.panel = panel;
    this.form = form;
    this.planType = form.dataset.planType;

    this.trueRate = panel.querySelector(".result-true-rate");
    this.billAmount = panel.querySelector(".result-bill-amount");
    this.resultsContent = panel.querySelector(".results-grid");
    this.resultNote = panel.querySelector(".result-note");
    this.resultInsight = panel.querySelector(".result-insight");
    this.resultGuidance = panel.querySelector(".result-guidance");
    this.resultEmailOptin = panel.querySelector(".result-email-card");
    this.resultsPlaceholder = panel.querySelector(".results-placeholder");
    this.errorSection = panel.querySelector(".error-card");
    this.errorMessage = panel.querySelector(".error-message");
    this.clearButton = form.querySelector(".clear-button");

    this.hideResults();
    this.clearError();

    this.form.addEventListener("submit", (event) => this.handleSubmit(event));
    this.form.addEventListener("input", () => this.handleInput());
    if (this.clearButton) {
      this.clearButton.addEventListener("click", () => this.handleClear());
    }
  }

  async handleSubmit(event) {
    event.preventDefault();
    this.clearError();
    normalizeAllEnergyRateInputs();

    const formData = new FormData(this.form);
    const payload = Object.fromEntries(formData.entries());
    payload.plan_type = this.planType;

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

      this.trueRate.textContent = data.true_rate_display;
      this.billAmount.textContent = data.bill_amount_display;
      this.showResults();
    } catch (error) {
      this.showError(error.message);
    }
  }

  handleInput() {
    if (!this.form.checkValidity()) {
      this.hideResults();
    }
  }

  showResults() {
    this.resultsContent.classList.remove("is-hidden");
    this.resultNote.classList.remove("is-hidden");
    this.resultInsight?.classList.remove("is-hidden");
    this.resultGuidance?.classList.remove("is-hidden");
    this.resultEmailOptin?.classList.remove("is-hidden");
    this.resultsPlaceholder.classList.add("is-hidden");
  }

  hideResults() {
    this.resultsContent.classList.add("is-hidden");
    this.resultNote.classList.add("is-hidden");
    this.resultInsight?.classList.add("is-hidden");
    this.resultGuidance?.classList.add("is-hidden");
    this.resultEmailOptin?.classList.add("is-hidden");
    this.resultsPlaceholder.classList.remove("is-hidden");
  }

  showError(message) {
    this.errorMessage.textContent = message;
    this.errorSection.hidden = false;
    this.hideResults();
  }

  clearError() {
    this.errorMessage.textContent = "";
    this.errorSection.hidden = true;
  }

  handleClear() {
    let preservedThresholdValue;
    if (this.planType === "fixed_rate_credit") {
      const thresholdInput = this.form.querySelector("#credit-threshold");
      if (thresholdInput) {
        preservedThresholdValue = thresholdInput.value;
      }
    }

    this.form.reset();

    if (this.planType === "fixed_rate_credit") {
      const thresholdInput = this.form.querySelector("#credit-threshold");
      if (thresholdInput && preservedThresholdValue !== undefined) {
        thresholdInput.value = preservedThresholdValue;
      }
    }

    this.hideResults();
    this.clearError();
  }
}

function setupTduSelector() {
  const select = document.getElementById("tduSelect");
  if (!select) {
    return {
      handleTabChange: () => {},
    };
  }

  const CUSTOM_OPTION_VALUE = "custom";
  let selectedTduKey = "";

  const globalRateInput = document.getElementById("tdu-delivery-rate");
  const globalBaseInput = document.getElementById("tdu-base-delivery-charge");

  const panelInputs = {
    "panel-fixed-rate": {
      rateInput: document.getElementById("fixed-delivery-rate"),
      baseInput: document.getElementById("fixed-base-delivery-charge"),
    },
    "panel-fixed-rate-credit": {
      rateInput: document.getElementById("credit-delivery-rate"),
      baseInput: document.getElementById("credit-base-delivery-charge"),
    },
    "tou-plan": {
      rateInput: document.getElementById("touDeliveryRate"),
      baseInput: document.getElementById("touBaseDeliveryCharge"),
    },
  };

  const tduHelperText = document.querySelector(".tdu-helper-text");

  populateOptions();

  select.addEventListener("change", () => {
    selectedTduKey = select.value;

    if (!selectedTduKey) {
      return;
    }

    if (selectedTduKey === CUSTOM_OPTION_VALUE) {
      clearTduValuesFromAllPanels();
      return;
    }

    applyTduValuesToAllPanels();
  });

  globalRateInput?.addEventListener("input", syncGlobalToPanels);
  globalBaseInput?.addEventListener("input", syncGlobalToPanels);

  function populateOptions() {
    select.innerHTML = "";

    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Select Your TDU…";
    defaultOption.disabled = true;
    defaultOption.selected = true;
    select.append(defaultOption);

    Object.entries(tduFees).forEach(([tduId, fee]) => {
      const option = document.createElement("option");
      option.value = tduId;
      option.textContent = fee.name;
      select.append(option);
    });

    const customOption = document.createElement("option");
    customOption.value = CUSTOM_OPTION_VALUE;
    customOption.textContent = "Custom / Other";
    select.append(customOption);
  }

  function applyTduValuesToAllPanels() {
    const fees = tduFees[selectedTduKey];
    if (!fees) {
      return;
    }

    if (globalRateInput) {
      globalRateInput.value = fees.delivery_per_kwh.toString();
    }

    if (globalBaseInput) {
      globalBaseInput.value = fees.base_delivery.toString();
    }

    syncGlobalToPanels();
  }

  function clearTduValuesFromAllPanels() {
    if (globalRateInput) {
      globalRateInput.value = "";
    }

    if (globalBaseInput) {
      globalBaseInput.value = "";
    }

    syncGlobalToPanels();
  }

  function syncGlobalToPanels() {
    const rateValue = globalRateInput?.value ?? "";
    const baseValue = globalBaseInput?.value ?? "";

    Object.values(panelInputs).forEach(({ rateInput, baseInput }) => {
      if (rateInput) {
        rateInput.value = rateValue;
        rateInput.defaultValue = rateValue;
        rateInput.dispatchEvent(new Event("input", { bubbles: true }));
      }

      if (baseInput) {
        baseInput.value = baseValue;
        baseInput.defaultValue = baseValue;
        baseInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  function handleTabChange(newPanelId) {
    const showHelper = newPanelId === "tou-plan";
    if (tduHelperText) {
      tduHelperText.classList.toggle("is-hidden", !showHelper);
    }
  }

  return {
    handleTabChange,
  };
}

function setupTabs(onTabChange) {
  const buttons = document.querySelectorAll(".tab-button");
  const panels = document.querySelectorAll(".tab-panel");
  let activePanelId =
    document.querySelector(".tab-panel.is-active")?.id || panels[0]?.id || null;

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.classList.contains("is-active")) {
        return;
      }

      const targetId = button.dataset.target;

      buttons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", isActive ? "true" : "false");
      });

      panels.forEach((panel) => {
        const isTarget = panel.id === targetId;
        panel.classList.toggle("is-active", isTarget);
        panel.toggleAttribute("hidden", !isTarget);
      });

      activePanelId = targetId;
      if (typeof onTabChange === "function") {
        onTabChange(activePanelId);
      }
    });
  });

  return activePanelId;
}

function setupTouCalculator() {
  const panel = document.getElementById("tou-plan");
  if (!panel) {
    return;
  }

  const inputs = {
    onPeakRate: panel.querySelector("#touOnPeakRate"),
    offPeakRate: panel.querySelector("#touOffPeakRate"),
    baseCharge: panel.querySelector("#touBaseCharge"),
    deliveryRate: panel.querySelector("#touDeliveryRate"),
    baseDeliveryCharge: panel.querySelector("#touBaseDeliveryCharge"),
    totalUsage: panel.querySelector("#touTotalUsage"),
    freeUsage: panel.querySelector("#touFreeUsage"),
  };

  const calculateButton = panel.querySelector("#touCalculateBtn");
  const clearButton = panel.querySelector("#touClearBtn");
  const effectiveRateDisplay = panel.querySelector("#touEffectiveRate");
  const approxBillDisplay = panel.querySelector("#touApproxBill");
  const resultsGrid = panel.querySelector(".results-grid");
  const placeholder = panel.querySelector(".results-placeholder");
  const resultNote = panel.querySelector(".result-note");
  const resultInsight = panel.querySelector(".result-insight");
  const resultGuidance = panel.querySelector(".result-guidance");
  const resultEmailOptin = panel.querySelector(".result-email-card");
  const errorSection = panel.querySelector(".error-card");
  const errorMessage = panel.querySelector(".error-message");

  if (
    !calculateButton ||
    !effectiveRateDisplay ||
    !approxBillDisplay ||
    !resultsGrid ||
    !placeholder
  ) {
    return;
  }

  const hideResults = () => {
    resultsGrid.classList.add("is-hidden");
    resultNote?.classList.add("is-hidden");
    resultInsight?.classList.add("is-hidden");
    resultGuidance?.classList.add("is-hidden");
    resultEmailOptin?.classList.add("is-hidden");
    placeholder.classList.remove("is-hidden");
  };

  const showResults = () => {
    resultsGrid.classList.remove("is-hidden");
    resultNote?.classList.remove("is-hidden");
    resultInsight?.classList.remove("is-hidden");
    resultGuidance?.classList.remove("is-hidden");
    resultEmailOptin?.classList.remove("is-hidden");
    placeholder.classList.add("is-hidden");
  };

  const inputsHaveValues = () =>
    Object.values(inputs).every((input) => input && input.value.trim() !== "");

  const showError = (message) => {
    if (!errorSection || !errorMessage) {
      return;
    }
    errorMessage.textContent = message;
    errorSection.hidden = false;
  };

  const clearError = () => {
    if (!errorSection || !errorMessage) {
      return;
    }
    errorMessage.textContent = "";
    errorSection.hidden = true;
  };

  calculateButton.addEventListener("click", () => {
    clearError();
    normalizeAllEnergyRateInputs();
    if (!inputsHaveValues()) {
      hideResults();
      showError("Invalid or missing input data");
      return;
    }

    const totalUsage = Number(inputs.totalUsage.value);
    if (!Number.isFinite(totalUsage) || totalUsage <= 0) {
      hideResults();
      showError("Usage must be greater than zero");
      return;
    }

    const onPeakRate = Number(inputs.onPeakRate.value);
    const offPeakRate = Number(inputs.offPeakRate.value);
    const baseCharge = Number(inputs.baseCharge.value);
    const deliveryRate = Number(inputs.deliveryRate.value);
    const baseDeliveryCharge = Number(inputs.baseDeliveryCharge.value);
    const freeUsage = Math.max(Number(inputs.freeUsage.value), 0);

    const adjustedFreeUsage = Math.min(freeUsage, totalUsage);
    const paidUsage = Math.max(totalUsage - adjustedFreeUsage, 0);

    const energyCost =
      (onPeakRate / 100) * paidUsage + (offPeakRate / 100) * adjustedFreeUsage;

    const tduCost = (deliveryRate / 100) * paidUsage + baseDeliveryCharge;
    const billAmount = baseCharge + energyCost + tduCost;
    const effectiveRateCents = (billAmount / totalUsage) * 100;

    effectiveRateDisplay.textContent = effectiveRateCents.toFixed(2);
    approxBillDisplay.textContent = billAmount.toFixed(2);

    clearError();
    showResults();
  });

  Object.values(inputs).forEach((input) => {
    input?.addEventListener("input", () => {
      hideResults();
      clearError();
    });
  });

  clearButton?.addEventListener("click", () => {
    Object.values(inputs).forEach((input) => {
      if (input) {
        input.value = "";
      }
    });
    hideResults();
    clearError();
  });

  hideResults();
  clearError();
}

function setupEnergyRateNormalization() {
  const rateInputs = getEnergyRateInputs();

  rateInputs.forEach((input) => {
    ["change", "blur"].forEach((eventName) => {
      input.addEventListener(eventName, () => normalizeEnergyRateInput(input));
    });
  });
}

function setupInlineHelpers() {
  const wrappers = document.querySelectorAll(".inline-helper-wrapper");
  wrappers.forEach((wrapper) => {
    const trigger = wrapper.querySelector("[data-inline-helper-trigger]");
    const helper = wrapper.querySelector("[data-inline-helper]");
    const hideButton = wrapper.querySelector("[data-inline-helper-hide]");

    if (!trigger || !helper) {
      return;
    }

    const setOpen = (open) => {
      helper.classList.toggle("is-open", open);
      helper.setAttribute("aria-hidden", open ? "false" : "true");
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    };

    trigger.addEventListener("click", () => {
      setOpen(!helper.classList.contains("is-open"));
    });

    if (hideButton) {
      hideButton.addEventListener("click", () => setOpen(false));
    }
  });
}

function getEnergyRateInputs() {
  const inputs = [];

  energyRateInputIds.forEach((inputId) => {
    const input = document.getElementById(inputId);
    if (input) {
      inputs.push(input);
    }
  });

  return inputs;
}

function flashNormalization(input) {
  input.classList.add("input-normalized");
  window.setTimeout(() => {
    input.classList.remove("input-normalized");
  }, normalizationFlashDurationMs);
}

function normalizeEnergyRateInput(input) {
  if (!input) {
    return false;
  }

  const numericValue = Number(input.value);

  if (!Number.isFinite(numericValue) || numericValue <= 0 || numericValue >= 1) {
    return false;
  }

  const normalizedValue = Number((numericValue * 100).toFixed(3));
  const asString = Number.isInteger(normalizedValue)
    ? normalizedValue.toString()
    : normalizedValue.toString().replace(/(\.\d*?[1-9])0+$/, "$1");

  input.value = asString;
  flashNormalization(input);
  return true;
}

function normalizeAllEnergyRateInputs() {
  const inputs = getEnergyRateInputs();
  inputs.forEach((input) => normalizeEnergyRateInput(input));
}

function runRateNormalizationConsoleTest() {
  const testInputs = [
    { inputId: "fixed-energy-rate", value: 7.5, expected: 7.5 },
    { inputId: "credit-energy-rate", value: 0.11, expected: 11 },
    { inputId: "touOnPeakRate", value: 0.12, expected: 12 },
    { inputId: "touOffPeakRate", value: 0.09, expected: 9 },
  ];

  const results = [];

  testInputs.forEach(({ inputId, value, expected }) => {
    const input = document.getElementById(inputId);

    if (!input) {
      results.push({ inputId, error: "Input not found" });
      return;
    }

    input.value = value.toString();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    normalizeEnergyRateInput(input);

    const after = Number(input.value);
    const pass = Number.isFinite(after) && Math.abs(after - expected) < 0.0001;

    results.push({ inputId, before: value, after, expected, pass });
  });

  let allPassed = true;
  results.forEach((result) => {
    if (!result.pass && !result.error) {
      allPassed = false;
    }
  });

  console.table(results);
  if (!allPassed) {
    console.warn("Energy rate normalization test encountered mismatches.", results);
  } else {
    console.info("Energy rate normalization test passed for all provided inputs.");
  }

  return results;
}

if (typeof window !== "undefined") {
  window.runRateNormalizationConsoleTest = runRateNormalizationConsoleTest;
}

function applyUrlParameters() {
  const searchParams = new URLSearchParams(window.location.search);
  if ([...searchParams.keys()].length === 0) {
    return;
  }

  const postalCodeParam = searchParams.get("pc");
  if (postalCodeParam) {
    const postalCodeField = document.getElementById("postal-code-param");
    if (postalCodeField) {
      postalCodeField.value = postalCodeParam.trim();
    }
  }

  const tduParam = searchParams.get("tdu");
  if (tduParam) {
    const tduSelect = document.getElementById("tduSelect");
    if (!tduSelect) {
      return;
    }

    const tduMap = {
      centerpoint: "CenterPoint",
      oncor: "Oncor",
      aep_central: "AEP Texas Central",
      aep_north: "AEP Texas North",
      tnmp: "TNMP",
      custom: "custom",
    };

    const normalizedKey = tduParam.trim().toLowerCase();
    const mappedValue = tduMap[normalizedKey];

    if (mappedValue && tduSelect.querySelector(`option[value="${mappedValue}"]`)) {
      tduSelect.value = mappedValue;
      tduSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  const usageParam = searchParams.get("usage");
  if (usageParam) {
    const usageInputs = [
      document.getElementById("fixed-usage"),
      document.getElementById("credit-usage"),
      document.getElementById("touTotalUsage"),
    ];

    usageInputs.forEach((input) => {
      if (input) {
        input.value = usageParam;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }
}

function initializeSupabaseClient() {
  if (typeof window === "undefined" || !window.supabase) {
    return null;
  }

  const config = window.SUPABASE_CONFIG || {};
  if (!config.url || !config.key) {
    return null;
  }

  return window.supabase.createClient(config.url, config.key);
}

function setupLeadCapture() {
  const forms = document.querySelectorAll(".result-email-form");
  if (!forms.length) {
    return;
  }

  const postalCodeField = document.getElementById("postal-code-param");
  const successMessages = document.querySelectorAll("[data-email-success]");

  forms.forEach((form) => {
    const emailInput = form.querySelector('input[type="email"]');
    const submitButton = form.querySelector(".result-email-button");
    const errorMessage = ensureLeadErrorMessage(form);

    if (!emailInput || !submitButton) {
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (!supabaseClient) {
        setLeadErrorMessage(errorMessage, "Lead capture is unavailable right now. Please try again soon.");
        return;
      }

      const email = emailInput.value.trim();
      const zipCode = postalCodeField?.value.trim() || "";

      const originalText = submitButton.textContent;
      submitButton.disabled = true;
      submitButton.textContent = "Saving...";
      setLeadErrorMessage(errorMessage, "");

      const { error } = await supabaseClient
        .from("leads")
        .insert([{ email, zip_code: zipCode || "" }]);

      const isDuplicateError =
        error?.code === "23505" ||
        (typeof error?.message === "string" &&
          error.message.toLowerCase().includes("duplicate"));

      if (error && !isDuplicateError) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        setLeadErrorMessage(errorMessage, "We couldn’t save your email. Please try again.");
        return;
      }

      submitButton.textContent = "Sending...";

      const emailResponse = await fetch("/subscribe", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({
          email,
          zip: zipCode || "",
        }),
      });

      if (!emailResponse.ok) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
        setLeadErrorMessage(
          errorMessage,
          "We saved your email, but couldn’t send the guide right now. Please try again."
        );
        return;
      }

      emailInput.value = "";
      submitButton.disabled = false;
      submitButton.textContent = originalText;

      successMessages.forEach((message) => {
        message.hidden = false;
      });

      if (isDuplicateError) {
        setLeadErrorMessage(
          errorMessage,
          "You're already on the list! We'll be in touch soon.",
          { variant: "info" }
        );
      }
    });
  });
}

function ensureLeadErrorMessage(form) {
  let errorMessage = form.querySelector(".result-email-error");

  if (!errorMessage) {
    errorMessage = document.createElement("p");
    errorMessage.className = "result-email-error";
    errorMessage.hidden = true;
    form.append(errorMessage);
  }

  return errorMessage;
}

function setLeadErrorMessage(target, message, { variant = "error" } = {}) {
  if (!target) {
    return;
  }

  target.classList.toggle("is-info", variant === "info");
  target.classList.toggle("is-error", variant === "error");
  target.textContent = message;
  target.hidden = !message;
}
