import {
  Boxes,
  ArrowLeftRight,
  AlertTriangle,
  TrendingUp,
  Scale,
} from "lucide-react";

// The report catalog, shared by the reports index (cards) and the report view
// (title/meta lookup). Kept in its own module so both the index page and the
// report page can import it without a component file exporting a constant.
export const REPORTS = [
  {
    slug: "inventory-valuation",
    title: "Inventory Valuation",
    description:
      "Stock on hand valued at cost and at retail, per variant with grand totals",
    frequency: "Monthly review",
    icon: Boxes,
  },
  {
    slug: "stock-movements",
    title: "Stock Movements",
    description:
      "Full movement ledger — receipts, sales, transfers and adjustments, filterable",
    frequency: "Daily review",
    icon: ArrowLeftRight,
  },
  {
    slug: "low-stock",
    title: "Low Stock",
    description:
      "Items at or below their reorder point, with shortfall and supplier hints",
    frequency: "Weekly review",
    icon: AlertTriangle,
  },
  {
    slug: "sales",
    title: "Sales",
    description:
      "Monthly revenue for the trailing 12 months, top products and top customers",
    frequency: "Weekly review",
    icon: TrendingUp,
  },
  {
    slug: "accounts",
    title: "Creditors & Debtors",
    description:
      "Outstanding balances — who owes you and who you owe, with totals",
    frequency: "Weekly review",
    icon: Scale,
  },
];
