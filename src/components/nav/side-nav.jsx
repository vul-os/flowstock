import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Boxes,
  Receipt,
  ShoppingCart,
  Handshake,
  Wrench,
  Wallet,
  FileText,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Grouped like a warehouse runs it: what you stock, what moves, who you trade
 * with, and the paperwork. Stencilled group headings echo crate markings.
 */
const navGroups = [
  {
    label: "Floor",
    items: [
      { to: "/", icon: LayoutDashboard, text: "Dashboard", end: true },
      { to: "/products", icon: Package, text: "Products" },
      { to: "/stock", icon: Boxes, text: "Stock" },
    ],
  },
  {
    label: "Movement",
    items: [
      { to: "/orders", icon: Receipt, text: "Orders" },
      { to: "/purchase-orders", icon: ShoppingCart, text: "Purchase Orders" },
      { to: "/services", icon: Wrench, text: "Services" },
    ],
  },
  {
    label: "Ledger",
    items: [
      { to: "/partners", icon: Handshake, text: "Partners" },
      { to: "/creditors-debtors", icon: Wallet, text: "Creditors & Debtors" },
      { to: "/reports", icon: FileText, text: "Reports" },
    ],
  },
  {
    label: "System",
    items: [{ to: "/settings", icon: Settings, text: "Settings" }],
  },
];

const SideNav = ({ onNavigate }) => (
  <nav className="flex flex-col gap-5 py-4">
    {navGroups.map((group) => (
      <div key={group.label}>
        <p className="stencil-label px-4 pb-1.5">{group.label}</p>
        <ul className="space-y-px px-2">
          {group.items.map(({ to, icon: Icon, text, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-fast ease-out hover:bg-muted hover:text-foreground",
                    isActive &&
                      "flow-rule bg-primary-muted font-semibold text-primary hover:bg-primary-muted hover:text-primary",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{text}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </nav>
);

export default SideNav;
