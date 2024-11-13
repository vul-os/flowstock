import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";
import FlowStockLogo from '@/assets/flowstock-logo.svg';
import { Link, useNavigate } from 'react-router-dom';

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const navLinks = [
    { href: "#features", label: "Features" },
    { href: "#pricing", label: "Pricing" },
    { href: "#about", label: "About" }
  ];

  return (
    <header className="border-b bg-white sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          {/* Logo Section */}
          <Link to="/" className="flex items-center">
            <img 
              src={FlowStockLogo} 
              alt="FlowStock Logo" 
              className="h-8 w-auto" 
            />
            <h1 className="text-2xl font-semibold text-gray-900 ml-4">FlowStock</h1>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            {navLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-gray-600 hover:text-blue-600 transition-colors duration-200"
              >
                {link.label}
              </a>
            ))}
            <Button 
              variant="outline" 
              className="font-medium"
              onClick={() => navigate('/admin')}
            >
              Login
            </Button>
            <Button 
              className="font-medium"
              onClick={() => navigate('/signup')}
            >
              Get Started
            </Button>
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? (
              <X className="h-6 w-6" />
            ) : (
              <Menu className="h-6 w-6" />
            )}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="md:hidden py-4 mt-4 border-t">
            <div className="flex flex-col space-y-4">
              {navLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="text-gray-600 hover:text-blue-600 transition-colors duration-200 py-2"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </a>
              ))}
              <div className="flex flex-col space-y-4 pt-4 border-t">
                <Button 
                  variant="outline" 
                  className="w-full font-medium"
                  onClick={() => {
                    navigate('/admin');
                    setIsMenuOpen(false);
                  }}
                >
                  Login
                </Button>
                <Button 
                  className="w-full font-medium"
                  onClick={() => {
                    navigate('/signup');
                    setIsMenuOpen(false);
                  }}
                >
                  Get Started
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
};

export default Header;