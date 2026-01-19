from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from flask import Flask, request, jsonify, render_template, redirect, url_for, flash
from dotenv import load_dotenv

import resend

load_dotenv()

app = Flask(__name__)

resend.api_key = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM = os.environ.get("RESEND_FROM", "WattWise <guides@wattwisetx.com>")

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

def supabase_key_for_request(method: str) -> str:
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if method.upper() in {"POST", "PATCH", "PUT", "DELETE"} and service_key:
        # Set SUPABASE_SERVICE_KEY in Render for server-side writes that hit RLS.
        return service_key
    return os.environ.get("SUPABASE_KEY", "")


def supabase_headers(method: str) -> Dict[str, str]:
    key = supabase_key_for_request(method)
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def supabase_request(
    method: str,
    table: str,
    params: Optional[Dict[str, str]] = None,
    payload: Optional[Any] = None,
    prefer_return: bool = False,
) -> Optional[Any]:
    supabase_url = os.environ.get("SUPABASE_URL", "")
    supabase_key = supabase_key_for_request(method)
    if not supabase_url or not supabase_key:
        app.logger.error("Supabase configuration is missing.")
        return None

    query_string = f"?{urlencode(params)}" if params else ""
    url = f"{supabase_url.rstrip('/')}/rest/v1/{table}{query_string}"
    headers = supabase_headers(method)
    headers["Prefer"] = "return=representation" if prefer_return else "return=minimal"

    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request_obj = Request(url, data=data, headers=headers, method=method)

    try:
        with urlopen(request_obj, timeout=10) as response:
            body = response.read().decode("utf-8")
            if not body:
                return []
            return json.loads(body)
    except HTTPError as error:
        error_body = error.read().decode("utf-8")
        if "42501" in error_body or "row-level security" in error_body.lower():
            method_upper = method.upper()
            action = "INSERT" if method_upper == "POST" else "UPDATE"
            if method_upper == "DELETE":
                action = "DELETE"
            app.logger.error(
                "Supabase RLS blocked %s. Configure SUPABASE_SERVICE_KEY or add an %s policy.",
                action,
                action,
            )
        app.logger.error("Supabase request failed: %s", error_body)
        return None
    except URLError as error:
        app.logger.error("Supabase request error: %s", error)
        return None


def get_subscriber_by_email(email: str) -> Optional[Dict[str, Any]]:
    # Supabase "leads" table must include:
    # - unsubscribe_token (text, unique)
    # - unsubscribed_at (timestamp, nullable)
    result = supabase_request(
        "GET",
        "leads",
        params={
            "select": "id,email,unsubscribe_token,unsubscribed_at",
            "email": f"eq.{email}",
        },
        prefer_return=True,
    )
    if not result:
        return None
    return result[0]


def get_subscriber_by_token(token: str) -> Optional[Dict[str, Any]]:
    result = supabase_request(
        "GET",
        "leads",
        params={
            "select": "id,email,unsubscribe_token,unsubscribed_at",
            "unsubscribe_token": f"eq.{token}",
        },
        prefer_return=True,
    )
    if not result:
        return None
    return result[0]


def create_subscriber(email: str, zip_code: str, token: str) -> Optional[Dict[str, Any]]:
    payload = {
        "email": email,
        "zip_code": zip_code,
        "unsubscribe_token": token,
    }
    result = supabase_request("POST", "leads", payload=[payload], prefer_return=True)
    if not result:
        return None
    return result[0]


def update_subscriber(subscriber_id: Any, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    result = supabase_request(
        "PATCH",
        "leads",
        params={"id": f"eq.{subscriber_id}"},
        payload=updates,
        prefer_return=True,
    )
    if not result:
        return None
    return result[0]


def is_unsubscribed(subscriber: Dict[str, Any]) -> bool:
    return bool(subscriber.get("unsubscribed_at"))


def send_welcome_email(email: str, unsubscribe_token: str, zip_code: Optional[str] = None) -> bool:
    if not resend.api_key:
        app.logger.warning("RESEND_API_KEY is not set; skipping welcome email send.")
        return False

    guide_link = url_for("hidden_fee_guide", _external=True)
    unsubscribe_url = url_for("unsubscribe", token=unsubscribe_token, _external=True)
    zip_line = f"<p><strong>Your zip code:</strong> {zip_code}</p>" if zip_code else ""

    email_payload = {
        "from": RESEND_FROM,
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
              <p style='margin-top: 24px; font-size: 12px; color: #475569;'>
                Unsubscribe: <a href='{unsubscribe_url}' style='color: #475569;'>{unsubscribe_url}</a>
              </p>
            </div>
        """,
        "text": (
            "Welcome to WattWise!\n\n"
            "Thanks for signing up to get the Texas Electricity Hidden Fee Guide.\n\n"
            f"View the guide: {guide_link}\n\n"
            f"Unsubscribe: {unsubscribe_url}\n"
        ),
    }

    try:
        resend.Emails.send(email_payload)
        app.logger.info("Welcome email sent to %s", email)
        return True
    except Exception as error:  # noqa: BLE001
        app.logger.error("Failed to send welcome email to %s: %s", email, error, exc_info=True)
        return False


@app.route("/")
def index() -> str:
    return render_template("landing.html")


@app.route("/guide/texas-electricity-hidden-fees")
def hidden_fee_guide() -> str:
    return render_template("hidden_fee_guide.html")


@app.route("/landing")
def landing() -> str:
    return render_template("landing.html")


@app.route("/privacy")
def privacy() -> str:
    return render_template("privacy.html")


@app.route("/calculator")
def calculator() -> str:
    return render_template("index.html", **supabase_context())


@app.route("/subscribe", methods=["POST"])
def subscribe() -> Any:
    app.logger.info("HIT /subscribe")
    email = request.form.get("email")
    zip_code = request.form.get("zip") or request.form.get("zipcode") or request.form.get("pc")
    wants_json = "application/json" in request.headers.get("Accept", "")

    if not email:
        if wants_json:
            return jsonify({"error": "Email is required"}), 400
        return redirect(url_for("index"))

    print(f"New WattWise subscriber: {email}")
    subscriber = get_subscriber_by_email(email)
    already_subscribed = False
    unsubscribed = False

    if subscriber:
        already_subscribed = True
        unsubscribed = is_unsubscribed(subscriber)
        if not subscriber.get("unsubscribe_token"):
            new_token = secrets.token_urlsafe(32)
            updated = update_subscriber(subscriber["id"], {"unsubscribe_token": new_token})
            if not updated:
                if wants_json:
                    return jsonify({"error": "Unable to create an unsubscribe link right now."}), 500
                return redirect(url_for("index"))
            subscriber = updated
    else:
        new_token = secrets.token_urlsafe(32)
        subscriber = create_subscriber(email, zip_code or "", new_token)
        if not subscriber:
            subscriber = get_subscriber_by_email(email)
            if subscriber:
                already_subscribed = True
                unsubscribed = is_unsubscribed(subscriber)
        if subscriber and not subscriber.get("unsubscribe_token"):
            new_token = new_token or secrets.token_urlsafe(32)
            updated = update_subscriber(subscriber["id"], {"unsubscribe_token": new_token})
            if not updated:
                if wants_json:
                    return jsonify({"error": "Unable to create an unsubscribe link right now."}), 500
                return redirect(url_for("index"))
            subscriber = updated

    if not subscriber:
        if wants_json:
            return jsonify({"error": "Unable to save your email right now."}), 500
        return redirect(url_for("index"))

    if unsubscribed:
        message = "You're currently unsubscribed. Reply to our last email to resubscribe."
        if wants_json:
            return jsonify({"unsubscribed": True, "message": message}), 200
        return redirect(url_for("index"))

    unsubscribe_token = subscriber.get("unsubscribe_token")
    if not unsubscribe_token:
        if wants_json:
            return jsonify({"error": "Unable to create an unsubscribe link right now."}), 500
        return redirect(url_for("index"))

    try:
        email_sent = send_welcome_email(email, unsubscribe_token, zip_code)
    except Exception:
        app.logger.error("Unable to send welcome email for %s", email, exc_info=True)
        email_sent = False

    if wants_json:
        if not email_sent:
            return jsonify({"error": "Unable to send email right now."}), 500
        return jsonify({"success": True, "already_subscribed": already_subscribed})

    try:
        flash("Thanks! We’ll email you helpful updates soon.")
    except Exception:
        pass

    return redirect(url_for("index", subscribed="1"))


@app.route("/unsubscribe")
def unsubscribe() -> Any:
    token = request.args.get("token")
    if not token:
        return render_template("unsubscribe.html", status="missing"), 400

    subscriber = get_subscriber_by_token(token)
    if not subscriber:
        return render_template("unsubscribe.html", status="invalid"), 404

    timestamp = datetime.now(timezone.utc).isoformat()
    updated = update_subscriber(subscriber["id"], {"unsubscribed_at": timestamp})
    if not updated:
        return render_template("unsubscribe.html", status="error"), 500

    return render_template("unsubscribe.html", status="success")


@app.route("/api/calculate", methods=["POST"])
def calculate() -> Any:
    data = request.json or {}
    plan_type = data.get("plan_type", "fixed_rate")

    if plan_type not in {"fixed_rate", "fixed_rate_credit"}:
        return jsonify({"error": "Unsupported plan type"}), 400

    try:
        if plan_type == "fixed_rate_credit":
            plan_input = PlanInputWithCredit.from_json(data)
            true_rate_cents = round(plan_input.calculate_true_rate_cents(), 2)
            bill_amount = round(plan_input.calculate_bill_amount(), 2)
        elif plan_type == "fixed_rate":
            plan_input = PlanInput.from_json(data)
            true_rate_cents = round(plan_input.calculate_true_rate_cents(), 2)
            bill_amount = round(plan_input.calculate_bill_amount(), 2)
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
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
