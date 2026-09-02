// Single source of truth for myBishBash's plan prices.
//
// Update the amounts here only. `landingContent.js` reads these constants for
// the on-page pricing grid, and the `mybishbashPricingSchemaPlugin` in
// vite.config.js reads this same file at build time to stamp the matching
// `Offer` prices into the SoftwareApplication schema in `index.html`. That
// keeps the visible price and the schema.org price from ever drifting apart
// (Inigra MBB-3 / J4).
export const FREE_PRICE_AMOUNT = "0";
export const FREE_PRICE_CURRENCY = "GBP";
export const FREE_PRICE_DISPLAY = "£0";

export const PLUS_PRICE_AMOUNT = "3.99";
export const PLUS_PRICE_CURRENCY = "GBP";
export const PLUS_PRICE_DISPLAY = `£${PLUS_PRICE_AMOUNT}`;
