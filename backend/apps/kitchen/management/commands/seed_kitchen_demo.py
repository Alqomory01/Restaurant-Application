from datetime import date, time
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.accounts.models import Branch, User
from apps.kitchen.models import (
    BatchProduction,
    CodeSequence,
    CookingStep,
    Ingredient,
    IngredientDeduction,
    KitchenStock,
    ProductionPlan,
    ProductionPlanItem,
    Recipe,
    RecipeIngredient,
    StockRequest,
    WastageLog,
)

DEMO_PASSWORD = "MiseDemo123!"

# (name, default_unit, unit_cost)
INGREDIENTS = {
    "Long grain rice": ("kg", Decimal("800")),
    "Tomato puree": ("L", Decimal("600")),
    "Palm oil": ("L", Decimal("1200")),
    "Seasoning cubes": ("units", Decimal("50")),
    "Chicken stock": ("L", Decimal("300")),
    "Scotch bonnet": ("kg", Decimal("1500")),
    "Whole chicken": ("kg", Decimal("1800")),
    "Seasoning mix": ("g", Decimal("10")),
    "Cooking oil": ("ml", Decimal("2")),
    "Garlic paste": ("g", Decimal("8")),
    "Ginger": ("g", Decimal("6")),
    "Beef (boneless)": ("kg", Decimal("3200")),
    "Suya spice mix": ("g", Decimal("15")),
    "Onions": ("kg", Decimal("500")),
    "Groundnut oil": ("ml", Decimal("3")),
    "Ground melon seed": ("kg", Decimal("2500")),
    "Assorted meat": ("kg", Decimal("2800")),
    "Stockfish": ("kg", Decimal("4000")),
    "Crayfish": ("kg", Decimal("3500")),
    "Ripe plantain": ("units", Decimal("250")),
    "Salt": ("kg", Decimal("200")),
    "Fanta Orange": ("bottles", Decimal("350")),
    "Grenadine syrup": ("ml", Decimal("5")),
    "Ribena": ("ml", Decimal("6")),
    "Cucumber": ("units", Decimal("150")),
    "Lemon": ("units", Decimal("100")),
    "Ice": ("kg", Decimal("50")),
}

# Explicit current kitchen stock levels (qty_on_hand, reorder_threshold), scaled to what today's
# recipes actually consume — flat/tiny defaults produce nonsensical negative stock after a batch
# completes (e.g. a recipe using 100ml of oil per portion needs far more than a 5ml default).
STOCK_OVERRIDES = {
    "Long grain rice": (Decimal("12"), Decimal("30")),
    "Whole chicken": (Decimal("18"), Decimal("40")),
    "Tomato puree": (Decimal("22"), Decimal("25")),
    "Ground melon seed": (Decimal("2"), Decimal("10")),
    "Beef (boneless)": (Decimal("42"), Decimal("20")),
    "Seasoning cubes": (Decimal("28"), Decimal("10")),
    "Palm oil": (Decimal("20"), Decimal("5")),
    "Chicken stock": (Decimal("15"), Decimal("5")),
    "Scotch bonnet": (Decimal("5"), Decimal("2")),
    "Seasoning mix": (Decimal("2000"), Decimal("500")),
    "Cooking oil": (Decimal("15000"), Decimal("3000")),
    "Garlic paste": (Decimal("1000"), Decimal("200")),
    "Ginger": (Decimal("1000"), Decimal("200")),
    "Suya spice mix": (Decimal("3000"), Decimal("500")),
    "Onions": (Decimal("15"), Decimal("5")),
    "Groundnut oil": (Decimal("5000"), Decimal("1000")),
    "Assorted meat": (Decimal("20"), Decimal("5")),
    "Stockfish": (Decimal("10"), Decimal("3")),
    "Crayfish": (Decimal("5"), Decimal("2")),
    "Ripe plantain": (Decimal("150"), Decimal("30")),
    "Salt": (Decimal("5"), Decimal("1")),
    "Fanta Orange": (Decimal("40"), Decimal("10")),
    "Grenadine syrup": (Decimal("3000"), Decimal("500")),
    "Ribena": (Decimal("2000"), Decimal("500")),
    "Cucumber": (Decimal("30"), Decimal("10")),
    "Lemon": (Decimal("30"), Decimal("10")),
    "Ice": (Decimal("20"), Decimal("5")),
}

RECIPES = [
    {
        "name": "Jollof Rice", "category": "Rice & Swallows", "yield_qty": Decimal("10"), "yield_unit": "portions",
        "prep_time_minutes": 45, "selling_price": Decimal("2000"), "target_food_cost_pct": Decimal("28"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Long grain rice", Decimal("5"), False),
            ("Tomato puree", Decimal("2"), False),
            ("Palm oil", Decimal("0.5"), False),
            ("Seasoning cubes", Decimal("4"), False),
            ("Chicken stock", Decimal("1"), False),
            ("Scotch bonnet", Decimal("0.3"), True),
        ],
        "steps": [
            (1, "Wash and soak the rice", "Rinse 5kg of long grain rice until water runs clear. Soak for 20 minutes.", 20, None),
            (2, "Prepare the tomato base", "Blend tomato puree with fresh tomatoes and peppers. Fry in palm oil on medium heat for 25 minutes until oil floats on top.", 25, 160),
            (3, "Add rice and cook", "Add rice to the tomato base. Add stock and seasoning. Cover tightly and cook on low heat for 30 minutes, checking every 10 minutes.", 30, 120),
            (4, "Final steam and quality check", "Steam on lowest heat for 10 minutes. Check grains are cooked. Taste and adjust seasoning before pushing to counter.", 10, 100),
        ],
    },
    {
        "name": "Grilled Chicken", "category": "Proteins", "yield_qty": Decimal("1"), "yield_unit": "portions",
        "prep_time_minutes": 40, "selling_price": Decimal("3500"), "target_food_cost_pct": Decimal("32"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Whole chicken", Decimal("0.5"), False),
            ("Seasoning mix", Decimal("15"), False),
            ("Cooking oil", Decimal("10"), False),
            ("Garlic paste", Decimal("5"), False),
            ("Ginger", Decimal("5"), False),
        ],
        "steps": [
            (1, "Marinate chicken", "Mix seasoning, garlic paste and ginger. Coat chicken pieces thoroughly. Marinate for minimum 30 minutes, preferably overnight.", 30, None),
            (2, "Preheat grill", "Preheat grill to 200C. Brush grates with cooking oil to prevent sticking.", 10, 200),
            (3, "Grill and baste", "Place chicken on grill. Cook 15 minutes per side, basting with marinade every 5 minutes.", 30, 200),
            (4, "Rest and quality check", "Rest chicken for 5 minutes before serving. Check internal temperature reaches 74C. Log quality check.", 5, 74),
        ],
    },
    {
        "name": "Beef Suya", "category": "Proteins", "yield_qty": Decimal("1"), "yield_unit": "portions",
        "prep_time_minutes": 35, "selling_price": Decimal("2500"), "target_food_cost_pct": Decimal("30"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Beef (boneless)", Decimal("0.4"), False),
            ("Suya spice mix", Decimal("25"), False),
            ("Onions", Decimal("0.2"), False),
            ("Groundnut oil", Decimal("15"), False),
        ],
        "steps": [
            (1, "Slice and skewer beef", "Slice beef thinly against the grain into 3cm strips. Thread onto skewers.", 10, None),
            (2, "Apply suya spice", "Brush with groundnut oil. Coat generously with suya spice mix on all sides.", 5, None),
            (3, "Grill over charcoal", "Grill over hot charcoal or open flame, turning every 3-4 minutes until edges char slightly.", 15, 220),
            (4, "Rest and serve", "Rest for 3 minutes. Serve with sliced onions and tomatoes. Check internal temp is 70C+.", 3, 70),
        ],
    },
    {
        "name": "Egusi Soup", "category": "Soups & Stews", "yield_qty": Decimal("10"), "yield_unit": "L",
        "prep_time_minutes": 60, "selling_price": Decimal("2800"), "target_food_cost_pct": Decimal("26"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Ground melon seed", Decimal("0.8"), False),
            ("Assorted meat", Decimal("1"), False),
            ("Palm oil", Decimal("0.4"), False),
            ("Stockfish", Decimal("0.3"), False),
            ("Crayfish", Decimal("0.1"), False),
            ("Seasoning cubes", Decimal("2"), False),
        ],
        "steps": [
            (1, "Fry ground melon seed", "Heat palm oil in pot. Add ground melon seed and fry on medium heat, stirring constantly for 10 minutes until golden brown.", 10, 160),
            (2, "Add stock and meat", "Add meat stock and assorted meat pieces. Stir well. Add stockfish and crayfish.", 5, 100),
            (3, "Simmer and build flavour", "Cover and cook on medium heat for 30 minutes, stirring every 10 minutes. Adjust salt and seasoning.", 30, 100),
            (4, "Finish and check consistency", "Soup should coat the back of a spoon. If too thick, add stock. If too thin, cook uncovered for 10 more minutes.", 10, 100),
        ],
    },
    {
        "name": "Fried Plantain", "category": "Sides", "yield_qty": Decimal("1"), "yield_unit": "portions",
        "prep_time_minutes": 15, "selling_price": Decimal("800"), "target_food_cost_pct": Decimal("25"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Ripe plantain", Decimal("1"), False),
            ("Cooking oil", Decimal("100"), False),
            ("Salt", Decimal("0.01"), True),
        ],
        "steps": [
            (1, "Peel and slice plantain", "Peel ripe plantains. Slice diagonally at 1.5cm thickness for maximum caramelisation.", 3, None),
            (2, "Heat oil", "Heat cooking oil in pan to 170C. Oil should be deep enough to come halfway up the plantain slices.", 3, 170),
            (3, "Fry until golden", "Fry plantain slices in batches, 2-3 minutes per side until deep golden brown. Do not overcrowd the pan.", 6, 170),
            (4, "Drain and portion", "Drain on paper towels. Season lightly with salt. Portion 4-5 slices per serving.", 2, None),
        ],
    },
    {
        "name": "Chapman", "category": "Drinks", "yield_qty": Decimal("40"), "yield_unit": "servings",
        "prep_time_minutes": 10, "selling_price": Decimal("1500"), "target_food_cost_pct": Decimal("20"),
        "allergen_info": "none", "status": Recipe.Status.ACTIVE,
        "ingredients": [
            ("Fanta Orange", Decimal("8"), False),
            ("Grenadine syrup", Decimal("200"), False),
            ("Ribena", Decimal("100"), False),
            ("Cucumber", Decimal("2"), False),
            ("Lemon", Decimal("3"), False),
            ("Ice", Decimal("2"), False),
        ],
        "steps": [
            (1, "Chill all ingredients", "Ensure all drinks are well chilled. Slice cucumber and lemon thinly for garnish.", 5, 4),
            (2, "Mix base", "Combine Fanta, grenadine and Ribena in large dispenser. Stir gently, do not shake.", 3, None),
            (3, "Add garnish", "Add cucumber and lemon slices to the dispenser. Taste and adjust grenadine for sweetness.", 2, None),
        ],
    },
]


class Command(BaseCommand):
    help = "Seed demo data for the KitchenCore module: users, ingredients, recipes, stock, a live production plan."

    def handle(self, *args, **options):
        branch, _ = Branch.objects.get_or_create(name="Victoria Island")

        users = self._seed_users(branch)
        ingredients = self._seed_ingredients()
        self._seed_kitchen_stock(ingredients)
        recipes = self._seed_recipes(ingredients)
        self._seed_production_plan(recipes, users)
        self._seed_stock_requests(ingredients, users)
        self._seed_wastage(ingredients, users)
        self._seed_code_sequences()

        self.stdout.write(self.style.SUCCESS("Kitchen demo data seeded."))
        self.stdout.write(f"Demo login password for all users: {DEMO_PASSWORD}")
        for u in users.values():
            self.stdout.write(f"  {u.username} — {u.get_role_display()}")

    def _seed_users(self, branch):
        users = {}
        specs = [
            ("head_chef", "Bola", "Adeyemi", User.Role.HEAD_CHEF),
            ("kitchen_staff", "Tunde", "Kalu", User.Role.KITCHEN_STAFF),
            ("manager", "Olu", "Eze", User.Role.MANAGER),
        ]
        for username, first, last, role in specs:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first, "last_name": last, "role": role, "branch": branch},
            )
            if created:
                user.set_password(DEMO_PASSWORD)
                is_manager = role == User.Role.MANAGER
                user.is_staff = is_manager
                user.is_superuser = is_manager
                user.save()
            users[username] = user
        return users

    def _seed_ingredients(self):
        ingredients = {}
        for name, (unit, cost) in INGREDIENTS.items():
            ingredient, _ = Ingredient.objects.get_or_create(
                name=name, defaults={"default_unit": unit, "unit_cost": cost}
            )
            ingredients[name] = ingredient
        return ingredients

    def _seed_kitchen_stock(self, ingredients):
        for name, ingredient in ingredients.items():
            if name in STOCK_OVERRIDES:
                on_hand, threshold = STOCK_OVERRIDES[name]
            else:
                threshold = Decimal("5")
                on_hand = threshold * 5
            KitchenStock.objects.get_or_create(
                ingredient=ingredient,
                defaults={"qty_on_hand": on_hand, "reorder_threshold": threshold},
            )

    def _seed_recipes(self, ingredients):
        recipes = {}
        for spec in RECIPES:
            recipe, created = Recipe.objects.get_or_create(
                name=spec["name"],
                defaults={
                    "category": spec["category"],
                    "yield_qty": spec["yield_qty"],
                    "yield_unit": spec["yield_unit"],
                    "prep_time_minutes": spec["prep_time_minutes"],
                    "selling_price": spec["selling_price"],
                    "target_food_cost_pct": spec["target_food_cost_pct"],
                    "allergen_info": spec["allergen_info"],
                    "status": spec["status"],
                },
            )
            recipes[spec["name"]] = recipe
            if not created:
                continue
            for ing_name, qty, optional in spec["ingredients"]:
                RecipeIngredient.objects.create(
                    recipe=recipe, ingredient=ingredients[ing_name], qty=qty, is_optional=optional
                )
            for num, title, desc, duration, temp in spec["steps"]:
                CookingStep.objects.create(
                    recipe=recipe, step_number=num, title=title, description=desc,
                    duration_minutes=duration, temperature_c=temp,
                )
        return recipes

    def _seed_production_plan(self, recipes, users):
        today = timezone.localdate()
        plan, created = ProductionPlan.objects.get_or_create(
            service_date=today,
            service_period=ProductionPlan.ServicePeriod.LUNCH,
            defaults={"status": ProductionPlan.Status.SUBMITTED, "created_by": users["head_chef"]},
        )
        if not created:
            return

        item_specs = [
            ("Jollof Rice", Decimal("200"), "portions", "head_chef", time(9, 0), ProductionPlanItem.Status.COMPLETE),
            ("Grilled Chicken", Decimal("150"), "portions", "kitchen_staff", time(9, 30), ProductionPlanItem.Status.COMPLETE),
            ("Beef Suya", Decimal("80"), "portions", "kitchen_staff", time(10, 50), ProductionPlanItem.Status.IN_PROGRESS),
            ("Egusi Soup", Decimal("40"), "L", "head_chef", time(11, 0), ProductionPlanItem.Status.BLOCKED),
            ("Fried Plantain", Decimal("100"), "portions", "kitchen_staff", time(12, 30), ProductionPlanItem.Status.PENDING),
            ("Chapman", Decimal("40"), "servings", "head_chef", time(13, 0), ProductionPlanItem.Status.PENDING),
        ]
        items = {}
        for recipe_name, qty, unit, username, sched, item_status in item_specs:
            item = ProductionPlanItem.objects.create(
                plan=plan, recipe=recipes[recipe_name], planned_qty=qty, unit=unit,
                assigned_to=users[username], scheduled_time=sched, status=item_status,
            )
            items[recipe_name] = item

        now = timezone.now()
        self._complete_batch(items["Jollof Rice"], "BP-0511", Decimal("200"), Decimal("200"), users["head_chef"], now.replace(hour=9, minute=30, second=0, microsecond=0))
        self._complete_batch(items["Grilled Chicken"], "BP-0512", Decimal("150"), Decimal("150"), users["kitchen_staff"], now.replace(hour=10, minute=42, second=0, microsecond=0))

        BatchProduction.objects.create(
            plan_item=items["Beef Suya"], batch_code="BP-0513", planned_qty=Decimal("80"),
            produced_by=users["kitchen_staff"], status=BatchProduction.Status.IN_PROGRESS,
        )

    @staticmethod
    def _complete_batch(plan_item, batch_code, planned_qty, actual_qty, produced_by, completed_at):
        """Seed a historical completed batch, writing deductions for costing without touching
        current KitchenStock (the seeded stock levels already represent the post-deduction state)."""
        batch = BatchProduction.objects.create(
            plan_item=plan_item, batch_code=batch_code, planned_qty=planned_qty, actual_qty=actual_qty,
            quality_check=BatchProduction.QualityCheck.PASSED, produced_by=produced_by,
            completed_at=completed_at, status=BatchProduction.Status.COMPLETE,
        )
        recipe = plan_item.recipe
        scale = actual_qty / recipe.yield_qty
        for ri in recipe.ingredients.all():
            IngredientDeduction.objects.create(
                batch=batch, ingredient=ri.ingredient, theoretical_qty=ri.qty, actual_qty=scale * ri.qty,
                unit_cost_at_time=ri.ingredient.unit_cost,
            )
        return batch

    def _seed_stock_requests(self, ingredients, users):
        StockRequest.objects.get_or_create(
            request_code="KSR-0046",
            defaults={
                "ingredient": ingredients["Ground melon seed"],
                "qty_requested": Decimal("8"),
                "urgency": StockRequest.Urgency.URGENT,
                "reason": "Egusi Soup batch blocked",
                "status": StockRequest.Status.PENDING,
                "raised_by": users["head_chef"],
            },
        )
        StockRequest.objects.get_or_create(
            request_code="KSR-0047",
            defaults={
                "ingredient": ingredients["Long grain rice"],
                "qty_requested": Decimal("50"),
                "urgency": StockRequest.Urgency.HIGH,
                "reason": "Tomorrow's plan — proactive restock",
                "status": StockRequest.Status.PENDING,
                "raised_by": users["kitchen_staff"],
            },
        )

    def _seed_wastage(self, ingredients, users):
        # Mirrors the current KitchenStock snapshot, not a live deduction —
        # same reasoning as _complete_batch: the seeded stock levels already
        # represent "today, after this happened".
        tomato_puree = ingredients["Tomato puree"]
        WastageLog.objects.get_or_create(
            ingredient=tomato_puree,
            reason=WastageLog.Reason.SPOILAGE,
            notes="Opened tin left out overnight, discarded on morning check",
            defaults={
                "qty": Decimal("1"),
                "unit_cost_at_time": tomato_puree.unit_cost,
                "logged_by": users["kitchen_staff"],
            },
        )

        jollof_batch = BatchProduction.objects.filter(batch_code="BP-0511").first()
        if jollof_batch:
            WastageLog.objects.get_or_create(
                batch=jollof_batch,
                reason=WastageLog.Reason.OVER_PRODUCTION,
                notes="Leftover at end of lunch service, did not hold for dinner",
                defaults={
                    "qty": Decimal("6"),
                    "unit_cost_at_time": jollof_batch.plan_item.recipe.selling_price * Decimal("0.338"),
                    "logged_by": users["head_chef"],
                },
            )

    def _seed_code_sequences(self):
        """The demo batches/requests above use hardcoded historical codes rather
        than next_code(), so prime the counters to continue from there instead
        of restarting at 1 the first time someone starts a real batch."""
        CodeSequence.objects.get_or_create(prefix="BP", defaults={"last_value": 513})
        CodeSequence.objects.get_or_create(prefix="KSR", defaults={"last_value": 47})
