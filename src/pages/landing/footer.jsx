import React from 'react';
import FlowStockLogo from '@/assets/flowstock-logo.svg';
import { ExternalLink } from 'lucide-react';

const FooterSection = ({ title, links }) => (
  <div className="flex flex-col">
    <h3 className="text-lg font-semibold mb-6 text-gray-900">{title}</h3>
    <ul className="space-y-4">
      {links.map((link) => (
        <li key={link.text}>
          <a 
            href={link.href} 
            className="group flex items-center text-gray-600 hover:text-blue-600 transition-all duration-200 ease-in-out"
          >
            <span>{link.text}</span>
            {link.external && (
              <ExternalLink className="ml-1 w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            )}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const sections = {
    company: {
      title: "Company",
      links: [
        { text: "About", href: "#" },
        { text: "Blog", href: "#" },
        { text: "Careers", href: "#", external: true },
        { text: "Contact", href: "#" },
        { text: "Help Center", href: "#" },
        { text: "API Reference", href: "#", external: true }
      ]
    },
    legal: {
      title: "Legal",
      links: [
        { text: "Privacy Policy", href: "#" },
        { text: "Terms of Service", href: "#" },
        { text: "Security", href: "#" },
        { text: "Compliance", href: "#" }
      ]
    }
  };
  
  return (
    <footer className="bg-gray-50 border-t">
      <div className="container mx-auto px-6 py-16">
        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Logo Column */}
          <div className="lg:col-span-2">
            <div className="flex flex-col">
              <div className="flex items-center mb-6">
                <img 
                    src={FlowStockLogo} 
                    alt="FlowStock Logo" 
                    className="h-16 w-auto" // Made logo bigger
                />
                <h2 className="text-4xl font-semibold text-gray-900 ml-4">FlowStock</h2> 
              </div>
          
              <p className="text-gray-600 leading-relaxed mb-6">
                Empowering traders with advanced stock analysis and real-time market insights. 
                Our platform combines cutting-edge technology with intuitive design.
              </p>
              <div className="flex items-center space-x-4">
                <a href="#" className="text-gray-600 hover:text-blue-600">
                  <span className="sr-only">Twitter</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                  </svg>
                </a>
                <a href="#" className="text-gray-600 hover:text-blue-600">
                  <span className="sr-only">LinkedIn</span>
                  <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          {/* Navigation Columns */}
          {Object.values(sections).map((section) => (
            <FooterSection 
              key={section.title} 
              title={section.title} 
              links={section.links} 
            />
          ))}
        </div>
        
        {/* Copyright Section with Divider */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex items-center space-x-4">
              <p className="text-gray-600 text-sm">
                © {currentYear} FlowStock
              </p>
              <div className="h-4 w-px bg-gray-300 hidden md:block" />
              <p className="text-gray-600 text-sm">
                All rights reserved
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <p className="text-sm text-gray-600">
                A product of Exolution Technologies
              </p>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;