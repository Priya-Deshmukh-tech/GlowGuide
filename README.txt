GLOWGUIDE — ROUTINE INTELLIGENCE DEMO
====================================

START ON WINDOWS
1. Extract the ZIP to a folder.
2. Double-click run_glowguide.bat.
3. A browser opens at http://127.0.0.1:8765. Keep the command window open while using the site.
4. Close the command window or press Ctrl+C to stop the local server.

Python 3 is needed to start the local web server. No install, account, API key, database, or external service is required. Google Fonts are an optional network enhancement; the site has local font fallbacks.

WHAT IS INCLUDED
- index.html, styles.css, app.js: complete responsive website.
- data/routines.csv: one transaction per respondent, date, and routine context; product IDs are pipe-separated in products_used.
- data/routine_items.csv: normalized product-per-routine data.
- data/products.csv: product ID and category lookup.
- data/README.txt: dataset notes.
- start_site.py and run_glowguide.bat: local launcher.

CUSTOM ASSOCIATION LOGIC
GlowGuide implements Apriori and FP-Growth in the browser. Each routine is a transaction; a product ID is an item. Users can choose a context and skin profile, then change minimum support and confidence. Apriori grows candidate itemsets level by level and prunes candidates whose subsets are not frequent. FP-Growth creates a weighted prefix tree, builds conditional pattern bases, and recursively mines frequent itemsets. Both generate association rules with support, confidence, and lift.

The custom Glow score is a transparent ranking aid:
100 × confidence × (0.65 + 0.35 × min(lift, 3) / 3) × support reliability

Support reliability increases up to 1 as the observed itemset count reaches twice the current support threshold. Morning/evening comparison shows the observed co-occurrence share in each context. Rules are ranked for exploration, not clinical safety or effectiveness.

DATA LIMITATION
Every respondent, routine, product label, and association in this bundle is synthetic. The generated records are for classroom demonstrations and software development only. They are not a real survey, real consumer behavior, or evidence for product recommendations. Do not claim that results generalize to real people. The products are generic fictional catalog entries, not medical advice.
