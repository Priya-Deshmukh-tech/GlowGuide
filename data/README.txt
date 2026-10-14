GlowGuide synthetic skincare routine dataset

All records in this archive are synthetically generated for coursework, software development, and algorithm demonstrations. They are not real people, surveys, purchases, or observed skincare behavior. Do not report results as real-world consumer evidence.

Files:
- routines.csv: one row per respondent-date-context transaction. `products_used` contains pipe-separated product IDs for Apriori / FP-Growth.
- routine_items.csv: normalized one row per product used in a routine; useful for filtering, grouping, and joining.
- products.csv: product ID lookup and categories. Product names are fictional generic labels.

Keys and analysis:
- `routine_id` uniquely identifies a routine transaction. `respondent_id` links repeated records from the same synthetic respondent.
- `routine_context` is morning or evening. Keep contexts separate for routine-context comparisons.
- Join `routine_items.csv` to `products.csv` on `product_id`. Use distinct product IDs per `routine_id` as the itemsets.
- Additional context fields include date, skin type, primary concern, age group, climate, and season. `step_order` is an illustrative routine order, not clinical advice.

Data generation notes:
- Seeded deterministic generation; repeated respondents have stable profile attributes. Routine adherence and product bundles vary.
- The dataset intentionally contains plausible associations to demonstrate mining. Any discovered rules are properties of this synthetic generator, not validated recommendations.
- Product combinations are illustrative and not medical or dermatological guidance.
