import React, { useContext } from "react";
import {
  Home,
  Package,
  Wrench,
  ClipboardList,
  Users,
  WalletCards,
  Settings,
  ArrowDownToLine,
  BadgeDollarSign
} from "lucide-react";
import { NavItem } from "./nav-item";
import { AuthContext } from "@/context/use-auth";

const navItems = [
  { to: "/admin", icon: Home, text: "Home" },
  { to: "/admin/products", icon: Package, text: "Products" },
  { to: "/admin/services", icon: Wrench, text: "Services" },
  { to: "/admin/orders", icon: ClipboardList, text: "Orders" },
  { to: "/admin/creditors", icon: ArrowDownToLine, text: "Creditors" },
  { to: "/admin/debtors", icon: BadgeDollarSign, text: "Debtors" },
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