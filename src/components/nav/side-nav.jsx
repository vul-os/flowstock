import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, text: 'Dashboard', end: true },
  { to: '/products', icon: Package, text: 'Products' },
  { to: '/stock', icon: Boxes, text: 'Stock' },
  { to: '/orders', icon: Receipt, text: 'Orders' },
  { to: '/purchase-orders', icon: ShoppingCart, text: 'Purchase Orders' },
  { to: '/partners', icon: Handshake, text: 'Partners' },
  { to: '/services', icon: Wrench, text: 'Services' },
  { to: '/creditors-debtors', icon: Wallet, text: 'Creditors & Debtors' },
  { to: '/reports', icon: FileText, text: 'Reports' },
  { to: '/settings', icon: Settings, text: 'Settings' },
];

const SideNav = ({ onNavigate }) => (
  <nav className="py-3">
    <ul className="space-y-0.5 px-2">
      {navItems.map(({ to, icon: Icon, text, end }) => (
        <li key={to}>
          <NavLink
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                isActive && 'bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{text}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  </nav>
);

export default SideNav;
