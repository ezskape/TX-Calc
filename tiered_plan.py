from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class TieredPlanInput:
    usage_kwh: float
    base_charge: float
    delivery_base_fee: float
    tdu_rate_cents: float
    tier1_limit: Optional[float]
    tier2_limit: Optional[float]
    tier1_rate_cents: Optional[float]
    tier2_rate_cents: Optional[float]
    tier3_rate_cents: Optional[float]
    tier1_flat_fee: Optional[float]
    tier2_flat_fee: Optional[float]

    @classmethod
    def from_json(cls, data: Dict[str, Any]) -> "TieredPlanInput":
        def _parse_required_float(key: str) -> float:
            try:
                return float(data[key])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError("Invalid or missing input data") from exc

        def _parse_optional_float(key: str) -> Optional[float]:
            value = data.get(key)
            if value is None or value == "":
                return None
            try:
                return float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("Invalid or missing input data") from exc

        usage_kwh = _parse_required_float("usage_kwh")
        if usage_kwh <= 0:
            raise ValueError("Usage must be greater than zero")

        base_charge = _parse_required_float("base_charge")
        delivery_base_fee = _parse_required_float("base_delivery_charge")
        tdu_rate_cents = _parse_required_float("tdu_rate_cents")

        tier1_limit = _parse_optional_float("tier1_limit")
        tier2_limit = _parse_optional_float("tier2_limit")
        tier1_rate_cents = _parse_optional_float("tier1_rate_cents")
        tier2_rate_cents = _parse_optional_float("tier2_rate_cents")
        tier3_rate_cents = _parse_optional_float("tier3_rate_cents")
        tier1_flat_fee = _parse_optional_float("tier1_flat_fee")
        tier2_flat_fee = _parse_optional_float("tier2_flat_fee")

        if tier1_limit is not None and tier1_limit < 0:
            raise ValueError("Tier 1 limit cannot be negative")

        if tier2_limit is not None:
            if tier2_limit < 0:
                raise ValueError("Tier 2 limit cannot be negative")
            if tier1_limit is not None and tier2_limit < tier1_limit:
                raise ValueError("Tier 2 limit must be greater than Tier 1 limit")

        return cls(
            usage_kwh=usage_kwh,
            base_charge=base_charge,
            delivery_base_fee=delivery_base_fee,
            tdu_rate_cents=tdu_rate_cents,
            tier1_limit=tier1_limit,
            tier2_limit=tier2_limit,
            tier1_rate_cents=tier1_rate_cents,
            tier2_rate_cents=tier2_rate_cents,
            tier3_rate_cents=tier3_rate_cents,
            tier1_flat_fee=tier1_flat_fee,
            tier2_flat_fee=tier2_flat_fee,
        )


@dataclass
class TieredPlanResult:
    totalCost: float
    effectiveRateCents: float
    breakdown: Dict[str, float]


def calculateTieredPlan(plan_input: TieredPlanInput):
    usage = plan_input.usage_kwh
    base_charge = plan_input.base_charge
    delivery_base_fee = plan_input.delivery_base_fee
    delivery_usage_cost = usage * (plan_input.tdu_rate_cents / 100)

    energy_cost = 0.0
    flat_fee_applied: Optional[float] = None

    use_flat_mode = plan_input.tier1_flat_fee is not None and plan_input.tier1_limit is not None

    if use_flat_mode:
        tier2_flat_fee = plan_input.tier2_flat_fee if plan_input.tier2_flat_fee is not None else 0.0
        flat_fee_applied = (
            plan_input.tier1_flat_fee
            if usage < plan_input.tier1_limit
            else tier2_flat_fee
        )
        energy_cost = _calculate_energy_cost(plan_input, usage)
        total_cost = base_charge + delivery_base_fee + flat_fee_applied + energy_cost + delivery_usage_cost
    else:
        energy_cost = _calculate_per_kwh_energy_cost(plan_input, usage)
        total_cost = base_charge + delivery_base_fee + energy_cost + delivery_usage_cost

    effective_rate_cents = (total_cost / usage) * 100 if usage else 0.0

    return TieredPlanResult(
        totalCost=total_cost,
        effectiveRateCents=effective_rate_cents,
        breakdown={
            "flatFeeApplied": flat_fee_applied if flat_fee_applied is not None else 0.0,
            "energyCost": energy_cost,
            "deliveryUsageCost": delivery_usage_cost,
            "baseCharge": base_charge,
            "deliveryBaseFee": delivery_base_fee,
        },
    )


def _calculate_energy_cost(plan_input: TieredPlanInput, usage: float) -> float:
    has_tiered_rates = all(
        value is not None
        for value in (
            plan_input.tier1_rate_cents,
            plan_input.tier2_rate_cents,
            plan_input.tier3_rate_cents,
            plan_input.tier1_limit,
            plan_input.tier2_limit,
        )
    )

    if has_tiered_rates:
        return _calculate_per_kwh_energy_cost(plan_input, usage)

    if plan_input.tier1_rate_cents is not None:
        return (plan_input.tier1_rate_cents / 100) * usage

    return 0.0


def _calculate_per_kwh_energy_cost(plan_input: TieredPlanInput, usage: float) -> float:
    if plan_input.tier1_rate_cents is None:
        return 0.0

    if plan_input.tier1_limit is None and plan_input.tier2_limit is None:
        return (plan_input.tier1_rate_cents / 100) * usage

    tier1_limit = plan_input.tier1_limit if plan_input.tier1_limit is not None else usage
    tier2_limit = plan_input.tier2_limit if plan_input.tier2_limit is not None else tier1_limit

    tier1_kwh = min(usage, tier1_limit)
    tier2_kwh = min(max(usage - tier1_limit, 0), max(tier2_limit - tier1_limit, 0))
    tier3_kwh = max(usage - tier2_limit, 0)

    tier1_rate = plan_input.tier1_rate_cents if plan_input.tier1_rate_cents is not None else 0.0
    tier2_rate = plan_input.tier2_rate_cents if plan_input.tier2_rate_cents is not None else tier1_rate
    tier3_rate = plan_input.tier3_rate_cents if plan_input.tier3_rate_cents is not None else tier2_rate

    return (
        (tier1_kwh * tier1_rate) + (tier2_kwh * tier2_rate) + (tier3_kwh * tier3_rate)
    ) / 100
