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

    def calculate_true_rate_cents(self) -> float:
        energy_component_dollars = (self.energy_rate_cents + self.tdu_rate_cents) / 100
        fixed_component_dollars = (self.base_charge + self.base_delivery_charge) / self.usage_kwh
        total_rate_dollars = energy_component_dollars + fixed_component_dollars
        return total_rate_dollars * 100

    def calculate_bill_amount(self) -> float:
        true_rate_dollars = self.calculate_true_rate_cents() / 100
        return true_rate_dollars * self.usage_kwh


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/calculate", methods=["POST"])
def calculate() -> Any:
    try:
        plan_input = PlanInput.from_json(request.json or {})
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
