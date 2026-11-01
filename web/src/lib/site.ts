export type Product = {
  slug: string;
  name: string;
  category: "Deposits" | "Capital markets" | "Commodities";
  eyebrow: string;
  summary: string;
  detail: string;
  risk: string;
  facts: { label: string; value: string }[];
  considerations: string[];
  rate?: number;
};

export const products: Product[] = [
  {
    slug: "tagesgeld",
    name: "Savings",
    category: "Deposits",
    eyebrow: "Daily access, variable rate",
    summary: "A home for reserves you may need at short notice, with interest that follows the market.",
    detail: "Savings accounts suit liquidity you want to keep available. Rates are variable and can change at any time; compare the stated rate with its validity period.",
    risk: "Variable rates may fall. Deposit protection depends on the partner bank and its national scheme.",
    facts: [
      { label: "Access", value: "Daily" },
      { label: "Rate type", value: "Variable" },
      { label: "Minimum", value: "â‚¬1" },
      { label: "Term", value: "Open-ended" },
    ],
    considerations: ["Which bank holds the deposit?", "How long is the promotional rate valid?", "Which deposit protection scheme applies?"],
    rate: 2.6,
  },
  {
    slug: "festgeld",
    name: "Fixed deposits",
    category: "Deposits",
    eyebrow: "Planned rate, planned term",
    summary: "Commit capital for an agreed period at an agreed rate â€” clarity in exchange for flexibility.",
    detail: "Fixed deposits pay a rate set at the outset for the full term. Early access is usually not possible, so match the term to when you will need the money.",
    risk: "Funds are generally locked until maturity. Inflation can erode real returns.",
    facts: [
      { label: "Access", value: "At maturity" },
      { label: "Rate type", value: "Fixed" },
      { label: "Minimum", value: "â‚¬5,000" },
      { label: "Terms", value: "6â€“60 months" },
    ],
    considerations: ["When will you need the funds?", "Is interest paid annually or at maturity?", "What happens at the end of the term?"],
    rate: 3.1,
  },
  {
    slug: "flexgeld",
    name: "Flex deposits",
    category: "Deposits",
    eyebrow: "Between savings and fixed terms",
    summary: "A middle path: a fixed horizon with defined notice periods that let you step out if plans change.",
    detail: "Flex deposits combine a planned rate with notice-based access. Read the notice period and any rate adjustment on early withdrawal carefully.",
    risk: "Early withdrawal can reduce the interest earned. Notice periods delay access.",
    facts: [
      { label: "Access", value: "With notice" },
      { label: "Rate type", value: "Fixed / adjusted" },
      { label: "Minimum", value: "â‚¬2,500" },
      { label: "Notice", value: "31 days" },
    ],
    considerations: ["How long is the notice period?", "How is the rate adjusted if you exit early?", "Is the term renewed automatically?"],
    rate: 2.85,
  },
  {
    slug: "anleihen",
    name: "Bonds",
    category: "Capital markets",
    eyebrow: "Income within a defined framework",
    summary: "Lend capital to an issuer in return for scheduled interest â€” understand who pays, and on what terms.",
    detail: "Assess the issuer's credit quality, sensitivity to interest-rate moves, maturity and secondary-market liquidity together. A scheduled coupon is not a guarantee.",
    risk: "Payments depend on the issuer. Selling before maturity may return less than invested.",
    facts: [
      { label: "Income", value: "Coupon" },
      { label: "Key driver", value: "Credit & rates" },
      { label: "Liquidity", value: "Exchange / OTC" },
      { label: "Maturity", value: "Defined" },
    ],
    considerations: ["Who is the issuer and how is it rated?", "How does a rate change affect the price?", "Can you sell before maturity?"],
    rate: 4.2,
  },
  {
    slug: "aktien",
    name: "Stocks",
    category: "Capital markets",
    eyebrow: "Ownership in companies",
    summary: "Participate in the growth of businesses â€” with the price movement that ownership brings.",
    detail: "Equities can grow with company earnings over long horizons but fluctuate considerably. Diversification and time horizon matter more than timing.",
    risk: "Share prices can fall sharply. Dividends are not guaranteed. Total loss is possible.",
    facts: [
      { label: "Return", value: "Price & dividend" },
      { label: "Volatility", value: "High" },
      { label: "Horizon", value: "5+ years" },
      { label: "Liquidity", value: "Exchange" },
    ],
    considerations: ["How concentrated is your exposure?", "Could you hold through a 30% drawdown?", "What are the full costs of trading?"],
  },
  {
    slug: "ipo",
    name: "IPO access",
    category: "Capital markets",
    eyebrow: "Early access to new listings",
    summary: "Subscribe to companies entering the public market â€” read the prospectus before the headlines.",
    detail: "New listings have limited trading history. Allocation is not guaranteed, and first-day prices can move in either direction.",
    risk: "Limited track record, potential lock-ups and pronounced volatility after listing.",
    facts: [
      { label: "Document", value: "Prospectus" },
      { label: "Allocation", value: "Not guaranteed" },
      { label: "Volatility", value: "Very high" },
      { label: "Horizon", value: "Long term" },
    ],
    considerations: ["Have you read the approved prospectus?", "How is the offer price determined?", "Are there lock-up periods?"],
  },
  {
    slug: "gold",
    name: "Gold",
    category: "Commodities",
    eyebrow: "A store of value with a long memory",
    summary: "Physical or securitised gold as a diversifier â€” no interest, but a long role in preserving wealth.",
    detail: "Gold pays no income and its price is set in US dollars, so currency moves matter. Storage, insurance and spreads add to the cost of ownership.",
    risk: "Prices can fall for extended periods. Currency effects apply for euro investors.",
    facts: [
      { label: "Income", value: "None" },
      { label: "Currency", value: "USD-priced" },
      { label: "Form", value: "Physical / ETC" },
      { label: "Role", value: "Diversifier" },
    ],
    considerations: ["Physical bars or a securitised product?", "Where and how is it stored?", "What is the buy/sell spread?"],
  },
  {
    slug: "rohoel",
    name: "Crude oil",
    category: "Commodities",
    eyebrow: "Exposure to the energy cycle",
    summary: "Oil exposure via futures-based products â€” driven by supply, demand and geopolitics.",
    detail: "Most retail oil products track futures, not the spot price. Rolling contracts can create returns that differ markedly from the headline price.",
    risk: "High volatility and roll costs. Not suitable as a core holding for most investors.",
    facts: [
      { label: "Underlying", value: "Brent / WTI" },
      { label: "Structure", value: "Futures-based" },
      { label: "Volatility", value: "Very high" },
      { label: "Horizon", value: "Tactical" },
    ],
    considerations: ["Does the product track spot or futures?", "What are the roll costs?", "How large a position makes sense?"],
  },
];

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);

export type Market = {
  slug: string;
  name: string;
  symbol: string;
  unit: string;
  price: number;
  change: number;
  source: string;
  description: string;
};

export const markets: Market[] = [
  { slug: "gold", name: "Gold", symbol: "XAU", unit: "USD / oz", price: 2384.6, change: 0.42, source: "LBMA reference", description: "The most widely held precious metal, traditionally used as a store of value and portfolio diversifier." },
  { slug: "silver", name: "Silver", symbol: "XAG", unit: "USD / oz", price: 28.94, change: -0.85, source: "LBMA reference", description: "A precious and industrial metal; demand from solar and electronics makes it more cyclical than gold." },
  { slug: "platinum", name: "Platinum", symbol: "XPT", unit: "USD / oz", price: 982.1, change: 1.12, source: "LPPM reference", description: "Used in catalytic converters and jewellery; supply is concentrated in a few producing regions." },
  { slug: "palladium", name: "Palladium", symbol: "XPD", unit: "USD / oz", price: 1021.4, change: -1.64, source: "LPPM reference", description: "A key input for petrol-engine catalysts, with prices sensitive to automotive demand." },
  { slug: "bitcoin", name: "Bitcoin", symbol: "BTC", unit: "USD", price: 67412, change: 2.31, source: "Aggregated exchanges", description: "The first and largest crypto-asset by market value. Highly volatile and not deposit-protected." },
  { slug: "ethereum", name: "Ethereum", symbol: "ETH", unit: "USD", price: 3486.2, change: 1.78, source: "Aggregated exchanges", description: "A programmable blockchain network whose native asset powers smart contracts. Highly volatile." },
];

export const getMarket = (slug: string) => markets.find((m) => m.slug === slug);

/** Deterministic pseudo price history for charts (illustrative only). */
export function priceSeries(m: Market, points = 60): number[] {
  let seed = m.slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const vol = m.slug === "bitcoin" || m.slug === "ethereum" ? 0.03 : 0.012;
  const out: number[] = [];
  let p = m.price * 0.92;
  for (let i = 0; i < points; i++) {
    p *= 1 + (rand() - 0.47) * vol;
    out.push(p);
  }
  const k = m.price / (out[out.length - 1] ?? m.price);
  return out.map((v) => v * k);
}

/** Compound interest projection. Returns final value and interest earned. */
export function projectSavings(principal: number, monthly: number, ratePct: number, years: number) {
  const r = ratePct / 100 / 12;
  const n = Math.round(years * 12);
  let value = principal;
  const yearly: number[] = [principal];
  for (let i = 1; i <= n; i++) {
    value = value * (1 + r) + monthly;
    if (i % 12 === 0) yearly.push(value);
  }
  const contributed = principal + monthly * n;
  return { value, contributed, interest: value - contributed, yearly };
}

export const eur = (v: number, digits = 0) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export const num = (v: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);

export const faqs = [
  { q: "Do I need an account to explore?", a: "No. Every product page, the market overview and the calculator are open to everyone. An account is only needed once you want to keep documents and conversations in one place." },
  { q: "What does the calculator actually show?", a: "A simple projection based on the figures you enter. It is an estimate for orientation, not an offer, and it does not account for taxes, fees or rate changes." },
  { q: "Are reference prices trading quotes?", a: "No. Market references are indicative and shown with their source and observation time. They are not executable prices." },
  { q: "What is useful to include in a first message?", a: "Your goal, an approximate amount and time horizon, and anything you already know you want to avoid. That is enough to begin a sensible conversation." },
];

export const legalDocs: Record<string, { title: string; updated: string; sections: { h: string; p: string }[] }> = {
  imprint: {
    title: "Legal notice",
    updated: "October 2026",
    sections: [
      { h: "Provider", p: "Avencrestcorp, Frankfurt am Main, Germany. Details of the registered office, commercial register entry and authorised representatives are provided here." },
      { h: "Contact", p: "Email: contact@Avencrestcorppartners.de. Please use the contact form for enquiries so that we can respond in an orderly way." },
      { h: "Supervisory information", p: "Information about applicable supervisory authorities and licences is listed for each product partner on the respective product page." },
      { h: "Liability for content", p: "We prepare content with care but cannot guarantee completeness or timeliness. Information on this website does not constitute investment advice." },
    ],
  },
  privacy: {
    title: "Privacy policy",
    updated: "October 2026",
    sections: [
      { h: "Controller", p: "Avencrestcorp is responsible for processing personal data on this website." },
      { h: "Data we process", p: "When you contact us, we process the details you provide â€” such as name, email and message â€” solely to respond to your enquiry." },
      { h: "Legal basis", p: "Processing is based on Art. 6(1)(b) and (f) GDPR: pre-contractual measures and our legitimate interest in answering enquiries." },
      { h: "Your rights", p: "You have the right to access, rectification, erasure, restriction, portability and objection, and to lodge a complaint with a supervisory authority." },
    ],
  },
  terms: {
    title: "Website terms of use",
    updated: "October 2026",
    sections: [
      { h: "Scope", p: "These terms govern the use of this website and its tools. They do not govern any investment product, which has its own documentation." },
      { h: "No advice", p: "Content, figures and calculators are for information only. They do not constitute a recommendation or an offer to buy or sell." },
      { h: "Availability", p: "We aim to keep the website available but do not guarantee uninterrupted access." },
    ],
  },
  cookies: {
    title: "Cookie and token notice",
    updated: "October 2026",
    sections: [
      { h: "Your browser, your preferences", p: "We use only what is strictly necessary to run this website, such as remembering your cookie choice and language." },
      { h: "Optional technologies", p: "Analytics are only enabled if you consent. You can change your choice at any time via the cookie settings in the footer." },
      { h: "Session tokens", p: "If you sign in, a session token keeps you logged in. It is removed when you sign out." },
    ],
  },
};

