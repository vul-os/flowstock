import React, { useContext } from "react";
import {
  Home,
  Package,
  Handshake,
  Wrench,
  ShoppingCart,
  Receipt,
  ArrowDownToLine,
  Wallet,
  Users,
  Settings,
} from "lucide-react";
import { NavItem } from "./nav-item";
import { AuthContext } from "@/context/use-auth";

const navItems = [
  { to: "/admin", icon: Home, text: "Home" },
  { to: "/admin/products", icon: Package, text: "Products" },
  { to: "/admin/partners", icon: Handshake, text: "Partners" }, // Changed to Handshake for better representation of partnerships
  { to: "/admin/services", icon: Wrench, text: "Services" },
  { to: "/admin/purchase-orders", icon: ShoppingCart, text: "Purchase Orders" }, // Changed to ShoppingCart for purchases
  { to: "/admin/orders", icon: Receipt, text: "Orders" }, // Changed to Receipt for better distinction from purchase orders
  { to: "/admin/creditors", icon: ArrowDownToLine, text: "Creditors" },
  { to: "/admin/debtors", icon: Wallet, text: "Debtors" }, // Changed to Wallet for financial context
  { to: "/admin/settings", icon: Settings, text: "Settings" }
];

const SideNav = ({ isExpanded, isMobile }) => {
  // const { activeOrganization } = useContext(AuthContext);

  return (
    <div
      className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-gray-800 text-white shadow-md transition-all duration-300 ${
        isExpanded ? "w-60" : isMobile ? "w-0" : "w-16"
      }`}
    >
      <div className="mt-9">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <NavItem 
              key={item.to} 
              {...item} 
              isExpanded={isExpanded}
              hasOrganizations={true}
            />
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SideNav;