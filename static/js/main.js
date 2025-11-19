// Delivery rates keyed by TDU identifier. Update this object when fees change
// to keep the dropdown and auto-fill values in sync across the calculator.
const tduFees = {
  CenterPoint: {
    name: "CenterPoint",
    delivery_per_kwh: 4.639,
    base_delivery: 4.39,
  },
  Oncor: {
    name: "Oncor",
    delivery_per_kwh: 3.974,
    base_delivery: 3.42,
  },
  "AEP Texas North": {
    name: "AEP Texas North",
    delivery_per_kwh: 4.123,
    base_delivery: 4.79,
  },
  "AEP Texas Central": {
    name: "AEP Texas Central",
    delivery_per_kwh: 3.998,
    base_delivery: 4.79,
  },
  TNMP: {
    name: "TNMP",
    delivery_per_kwh: 4.011,
    base_delivery: 7.85,
  },
};

document.addEventListener("DOMContentLoaded", () => {
  let tduController;
  setupTabs((panelId) => {
    if (tduController) {
      tduController.handleTabChange(panelId);
    }
  });

  tduController = setupTduSelector();

  setupTouCalculator();

  const panels = document.querySelectorAll(".tab-panel");
  panels.forEach((panel) => {
    const form = panel.querySelector(".plan-form");
    if (form) {
      new PlanCalculator(panel, form);
    }
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
    this.resultsPlaceholder.classList.add("is-hidden");
  }

  hideResults() {
    this.resultsContent.classList.add("is-hidden");
    this.resultNote.classList.add("is-hidden");
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

    Object.values(panelInputs).forEach(({ rateInput, baseInput }) => {
      if (rateInput) {
        rateInput.value = fees.delivery_per_kwh.toString();
      }

      if (baseInput) {
        baseInput.value = fees.base_delivery.toString();
      }
    });
  }

  function clearTduValuesFromAllPanels() {
    Object.values(panelInputs).forEach(({ rateInput, baseInput }) => {
      if (rateInput) {
        rateInput.value = "";
      }

      if (baseInput) {
        baseInput.value = "";
      }
    });
  }

  function handleTabChange(newPanelId) {
    if (!selectedTduKey || selectedTduKey === CUSTOM_OPTION_VALUE) {
      return;
    }

    const inputs = panelInputs[newPanelId];
    const fees = tduFees[selectedTduKey];
    if (!inputs || !fees) {
      return;
    }

    if (inputs.rateInput) {
      inputs.rateInput.value = fees.delivery_per_kwh.toString();
    }

    if (inputs.baseInput) {
      inputs.baseInput.value = fees.base_delivery.toString();
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
  const effectiveRateDisplay = panel.querySelector("#touEffectiveRate");
  const approxBillDisplay = panel.querySelector("#touApproxBill");
  const resultsGrid = panel.querySelector(".results-grid");
  const placeholder = panel.querySelector(".results-placeholder");

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
    placeholder.classList.remove("is-hidden");
  };

  const showResults = () => {
    resultsGrid.classList.remove("is-hidden");
    placeholder.classList.add("is-hidden");
  };

  const inputsHaveValues = () =>
    Object.values(inputs).every((input) => input && input.value.trim() !== "");

  calculateButton.addEventListener("click", () => {
    if (!inputsHaveValues()) {
      hideResults();
      return;
    }

    const totalUsage = Number(inputs.totalUsage.value);
    if (!Number.isFinite(totalUsage) || totalUsage <= 0) {
      hideResults();
      return;
    }

    const onPeakRate = Number(inputs.onPeakRate.value);
    const offPeakRate = Number(inputs.offPeakRate.value);
    const baseCharge = Number(inputs.baseCharge.value);
    const deliveryRate = Number(inputs.deliveryRate.value);
    const baseDeliveryCharge = Number(inputs.baseDeliveryCharge.value);
    const freeUsage = Number(inputs.freeUsage.value);

    const onUsage = Math.max(totalUsage - freeUsage, 0);
    const offUsage = Math.min(freeUsage, totalUsage);
    const energyCost = (onUsage * onPeakRate + offUsage * offPeakRate) / 100;
    const deliveryCost = (totalUsage * deliveryRate) / 100;
    const totalBill = baseCharge + baseDeliveryCharge + energyCost + deliveryCost;
    const effectiveRateCents = (totalBill / totalUsage) * 100;

    effectiveRateDisplay.textContent = effectiveRateCents.toFixed(2);
    approxBillDisplay.textContent = totalBill.toFixed(2);

    showResults();
  });

  Object.values(inputs).forEach((input) => {
    input?.addEventListener("input", hideResults);
  });

  hideResults();
}
