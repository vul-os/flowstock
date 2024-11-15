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
  FileText, // Added for Reports
} from "lucide-react";
import { NavItem } from "./nav-item";
import { AuthContext } from "@/context/use-auth";

const navItems = [
  { to: "/admin", icon: Home, text: "Home" },
  { to: "/admin/products", icon: Package, text: "Products" },
  { to: "/admin/partners", icon: Handshake, text: "Partners" },
  { to: "/admin/services", icon: Wrench, text: "Services" },
  { to: "/admin/purchase-orders", icon: ShoppingCart, text: "Purchase Orders" },
  { to: "/admin/orders", icon: Receipt, text: "Orders" },
  { to: "/admin/reports", icon: FileText, text: "Reports" }, // Added Reports route
  { to: "/admin/creditors-debtors", icon: ArrowDownToLine, text: "Creditors & Debtors" },
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