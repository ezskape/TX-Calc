from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request


app = Flask(__name__)


@dataclass
class PlanInput:
    base_charge: float
    energy_rate_cents: float
    tdu_rate_cents: float
    base_delivery_charge: float
    usage_kwh: float

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "PlanInput":
        try:
            base_charge = float(data["base_charge"])
            energy_rate_cents = float(data["energy_rate_cents"])
            tdu_rate_cents = float(data["tdu_rate_cents"])
            base_delivery_charge = float(data["base_delivery_charge"])
            usage_kwh = float(data["usage_kwh"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Invalid or missing input data") from exc

        if usage_kwh <= 0:
            raise ValueError("Usage must be greater than zero")

        return cls(
            base_charge=base_charge,
            energy_rate_cents=energy_rate_cents,
            tdu_rate_cents=tdu_rate_cents,
            base_delivery_charge=base_delivery_charge,
            usage_kwh=usage_kwh,
        )

    def energy_charge_dollars(self) -> float:
        return ((self.energy_rate_cents + self.tdu_rate_cents) / 100) * self.usage_kwh

    def fixed_charge_dollars(self) -> float:
        return self.base_charge + self.base_delivery_charge

    def calculate_bill_amount(self) -> float:
        return self.energy_charge_dollars() + self.fixed_charge_dollars()

    def calculate_true_rate_cents(self) -> float:
        return (self.calculate_bill_amount() / self.usage_kwh) * 100


@dataclass
class PlanInputWithCredit(PlanInput):
    usage_credit: float
    credit_threshold_kwh: float

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "PlanInputWithCredit":
        base_plan = PlanInput.from_json(data)

        try:
            usage_credit = float(data["usage_credit"])
            credit_threshold_kwh = float(data["credit_threshold_kwh"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("Invalid or missing credit data") from exc

        if usage_credit < 0:
            raise ValueError("Usage credit cannot be negative")

        if credit_threshold_kwh < 0:
            raise ValueError("Usage threshold cannot be negative")

        return cls(
            base_charge=base_plan.base_charge,
            energy_rate_cents=base_plan.energy_rate_cents,
            tdu_rate_cents=base_plan.tdu_rate_cents,
            base_delivery_charge=base_plan.base_delivery_charge,
            usage_kwh=base_plan.usage_kwh,
            usage_credit=usage_credit,
            credit_threshold_kwh=credit_threshold_kwh,
        )

    def calculate_bill_amount(self) -> float:
        base_amount = super().calculate_bill_amount()
        if self.usage_kwh >= self.credit_threshold_kwh:
            adjusted_amount = base_amount - self.usage_credit
        else:
            adjusted_amount = base_amount
        return max(adjusted_amount, 0.0)


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def calculate() -> Any:
    data = request.json or {}
    plan_type = data.get("plan_type", "fixed_rate")

    try:
        if plan_type == "fixed_rate_credit":
            plan_input = PlanInputWithCredit.from_json(data)
        elif plan_type == "fixed_rate":
            plan_input = PlanInput.from_json(data)
        else:
            raise ValueError("Unsupported plan type")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    true_rate_cents = round(plan_input.calculate_true_rate_cents(), 2)
    bill_amount = round(plan_input.calculate_bill_amount(), 2)

    return jsonify(
        {
            "true_rate_cents": true_rate_cents,
            "true_rate_display": f"{true_rate_cents:.2f}",
            "bill_amount": bill_amount,
            "bill_amount_display": f"{bill_amount:.2f}",
        }
    )


if __name__ == "__main__":
    app.run(debug=True)
