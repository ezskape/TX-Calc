from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Dict, Optional

from flask import Flask, request, jsonify, render_template, redirect, url_for, flash
from dotenv import load_dotenv

import resend

load_dotenv()

app = Flask(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")

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


def supabase_context() -> Dict[str, str]:
    return {
        "supabase_url": os.environ.get("SUPABASE_URL", ""),
        "supabase_key": os.environ.get("SUPABASE_KEY", ""),
    }


def send_welcome_email(email: str, zip_code: Optional[str] = None) -> None:
    if not resend.api_key:
        app.logger.warning("RESEND_API_KEY is not set; skipping welcome email send.")
        return

    guide_link = "https://example.com/texas-electricity-hidden-fee-guide"
    zip_line = f"<p><strong>Your zip code:</strong> {zip_code}</p>" if zip_code else ""

    email_payload = {
        "from": "WattWise onboarding@resend.dev",
        "to": email,
        "subject": "Your Texas Electricity Hidden Fee Guide",
        "html": f"""
            <div style='font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;'>
              <h1 style='color: #0b61d6;'>Welcome to WattWise</h1>
              <p>Thanks for signing up to get the Texas Electricity Hidden Fee Guide.</p>
              {zip_line}
              <p>Click the link below to access your guide any time:</p>
              <p>
                <a href='{guide_link}' style='background: #0b61d6; color: #ffffff; padding: 12px 20px; text-decoration: none; border-radius: 6px;'>
                  View the Hidden Fee Guide
                </a>
              </p>
              <p>If you have any questions, just hit reply — we're here to help you avoid surprise charges.</p>
              <p style='margin-top: 24px;'>
                Cheers,<br />
                The WattWise Team
              </p>
            </div>
        """,
    }

    try:
        resend.Emails.send(email_payload)
        app.logger.info("Welcome email sent to %s", email)
    except Exception as error:  # noqa: BLE001
        app.logger.error("Failed to send welcome email to %s: %s", email, error, exc_info=True)


@app.route("/")
def index() -> str:
    return render_template("index.html", **supabase_context())


@app.route("/landing")
def landing() -> str:
    return render_template("landing.html")


@app.route("/calculator")
def calculator() -> str:
    return render_template("index.html", **supabase_context())


@app.route("/subscribe", methods=["POST"])
def subscribe() -> Any:
    app.logger.info("HIT /subscribe")
    email = request.form.get("email")
    zip_code = request.form.get("zip") or request.form.get("zipcode") or request.form.get("pc")
    app.logger.info("HIT /subscribe email=%s zip=%s", email, zip_code)

    if email:
        print(f"New WattWise subscriber: {email}")
        try:
            send_welcome_email(email, zip_code)
        except Exception:
            app.logger.error("Unable to send welcome email for %s", email, exc_info=True)

    try:
        flash("Thanks! We’ll email you helpful updates soon.")
    except Exception:
        pass

    return redirect(url_for("index", subscribed="1"))


@app.route("/api/calculate", methods=["POST"])
def calculate() -> Any:
    data = request.json or {}
    plan_type = data.get("plan_type", "fixed_rate")

    try:
        if plan_type == "fixed_rate_credit":
            plan_input = PlanInputWithCredit.from_json(data)
            true_rate_cents = round(plan_input.calculate_true_rate_cents(), 2)
            bill_amount = round(plan_input.calculate_bill_amount(), 2)
        elif plan_type == "fixed_rate":
            plan_input = PlanInput.from_json(data)
            true_rate_cents = round(plan_input.calculate_true_rate_cents(), 2)
            bill_amount = round(plan_input.calculate_bill_amount(), 2)
        elif plan_type == "tiered_plan":
            plan_input = TieredPlanInput.from_json(data)
            calculation = calculateTieredPlan(plan_input)
            true_rate_cents = round(calculation.effectiveRateCents, 2)
            bill_amount = round(calculation.totalCost, 2)
        else:
            raise ValueError("Unsupported plan type")
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

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
