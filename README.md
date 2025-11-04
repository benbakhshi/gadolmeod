# Gadol Meod Industrial Holdings Website

This repository contains a static, Berkshire Hathaway-inspired investor website for Gadol Meod Industrial Holdings. The site presents property schedules and ownership information for investors and lenders using a traditional, text-first layout reminiscent of classic corporate homepages.

## Getting Started

Open `index.html` in any modern browser. All styling (`styles.css`) and interactivity (`script.js`) load locally, so no additional tooling is required.

## Features

- **Company overview:** Plain-text summary of strategy, scale, and stewardship priorities.
- **Portfolio schedule:** Dynamic table with search and entity filters plus automatically calculated valuation, square footage, and occupancy totals.
- **Ownership entities:** Tabular summary of each capital vehicle with descriptive notes on governance and leverage.
- **Investor information:** Reporting cadence and investment principles presented in a compact column layout.
- **Document libraries:** Tax returns, LLC filings, investor K-1 logs, and guarantor financial statements surfaced with direct portal access instructions.
- **Liquidity snapshot:** Summary table highlighting cash, revolver capacity, and coverage metrics for lenders and investors.
- **Measured refinements:** Responsive spacing adjustments and subtle typographic treatments that preserve the old-school aesthetic while remaining legible on modern screens.

## Customizing Data

Property, entity, document, and liquidity data live in `script.js` (see the `properties`, `entities`, `taxReturns`, `llcFilings`, `investorK1s`, `guarantorStatements`, and `liquiditySummary` collections). Update or expand these structures to reflect current reporting deliverables. Calculations and filters update automatically.
