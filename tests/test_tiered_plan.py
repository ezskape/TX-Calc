import unittest

from tiered_plan import TieredPlanInput, calculateTieredPlan


class TieredPlanCalculatorTests(unittest.TestCase):
    def test_discount_power_style_flat_tier_plan(self):
        plan_input = TieredPlanInput.from_json(
            {
                "usage_kwh": 900,
                "base_charge": 0,
                "base_delivery_charge": 0,
                "tdu_rate_cents": 5,
                "tier1_limit": 1000,
                "tier2_limit": 2000,
                "tier1_rate_cents": 12,
                "tier2_rate_cents": 12,
                "tier3_rate_cents": 12,
                "tier1_flat_fee": 65,
                "tier2_flat_fee": 75,
            }
        )

        result = calculateTieredPlan(plan_input)

        self.assertAlmostEqual(result.breakdown["flatFeeApplied"], 65)
        self.assertAlmostEqual(result.breakdown["energyCost"], 108)
        self.assertAlmostEqual(result.breakdown["deliveryUsageCost"], 45)
        self.assertAlmostEqual(result.totalCost, 218)
        self.assertAlmostEqual(result.effectiveRateCents, 24.22, places=2)

    def test_per_kwh_tier_plan(self):
        plan_input = TieredPlanInput.from_json(
            {
                "usage_kwh": 1500,
                "base_charge": 5,
                "base_delivery_charge": 3,
                "tdu_rate_cents": 5,
                "tier1_limit": 500,
                "tier2_limit": 1000,
                "tier1_rate_cents": 10,
                "tier2_rate_cents": 8,
                "tier3_rate_cents": 6,
            }
        )

        result = calculateTieredPlan(plan_input)

        self.assertAlmostEqual(result.breakdown["flatFeeApplied"], 0)
        self.assertAlmostEqual(result.breakdown["energyCost"], 120)
        self.assertAlmostEqual(result.breakdown["deliveryUsageCost"], 75)
        self.assertAlmostEqual(result.totalCost, 203)
        self.assertAlmostEqual(result.effectiveRateCents, 13.53, places=2)

    def test_threshold_edge_case_applies_second_flat_fee(self):
        plan_input = TieredPlanInput.from_json(
            {
                "usage_kwh": 1000,
                "base_charge": 0,
                "base_delivery_charge": 0,
                "tdu_rate_cents": 0,
                "tier1_limit": 1000,
                "tier2_limit": 1500,
                "tier1_rate_cents": 10,
                "tier2_rate_cents": 10,
                "tier3_rate_cents": 10,
                "tier1_flat_fee": 50,
                "tier2_flat_fee": 70,
            }
        )

        result = calculateTieredPlan(plan_input)

        self.assertAlmostEqual(result.breakdown["flatFeeApplied"], 70)
        self.assertAlmostEqual(result.breakdown["energyCost"], 100)
        self.assertAlmostEqual(result.totalCost, 170)
        self.assertAlmostEqual(result.effectiveRateCents, 17)

    def test_hybrid_flat_fee_and_tiers(self):
        plan_input = TieredPlanInput.from_json(
            {
                "usage_kwh": 1800,
                "base_charge": 10,
                "base_delivery_charge": 5,
                "tdu_rate_cents": 4,
                "tier1_limit": 1200,
                "tier2_limit": 1600,
                "tier1_rate_cents": 9,
                "tier2_rate_cents": 7,
                "tier3_rate_cents": 5,
                "tier1_flat_fee": 20,
                "tier2_flat_fee": 40,
            }
        )

        result = calculateTieredPlan(plan_input)

        self.assertAlmostEqual(result.breakdown["flatFeeApplied"], 40)
        self.assertAlmostEqual(result.breakdown["energyCost"], 146)
        self.assertAlmostEqual(result.breakdown["deliveryUsageCost"], 72)
        self.assertAlmostEqual(result.totalCost, 273)
        self.assertAlmostEqual(result.effectiveRateCents, 15.17, places=2)

    def test_negative_bill_credit_tier(self):
        plan_input = TieredPlanInput.from_json(
            {
                "usage_kwh": 1300,
                "base_charge": 0,
                "base_delivery_charge": 0,
                "tdu_rate_cents": 5,
                "tier1_limit": 1000,
                "tier2_limit": 1200,
                "tier1_rate_cents": 11,
                "tier2_rate_cents": 11,
                "tier3_rate_cents": 11,
                "tier1_flat_fee": 0,
                "tier2_flat_fee": -35,
            }
        )

        result = calculateTieredPlan(plan_input)

        self.assertAlmostEqual(result.breakdown["flatFeeApplied"], -35)
        self.assertAlmostEqual(result.breakdown["energyCost"], 143)
        self.assertAlmostEqual(result.breakdown["deliveryUsageCost"], 65)
        self.assertAlmostEqual(result.totalCost, 173)
        self.assertAlmostEqual(result.effectiveRateCents, 13.31, places=2)


if __name__ == "__main__":
    unittest.main()
