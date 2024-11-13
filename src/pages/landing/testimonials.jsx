

import React from 'react';

// Testimonials Section
const Testimonials = () => {
    return (
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold mb-4">Trusted by traders worldwide</h2>
            <p className="text-xl text-gray-600">See what our users have to say about FlowStock</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                quote: "FlowStock has completely transformed how I approach trading. The AI insights are game-changing.",
                author: "Sarah Chen",
                role: "Professional Trader"
              },
              {
                quote: "The best trading platform I've used. Clean interface and powerful analytics tools.",
                author: "Mark Thompson",
                role: "Investment Analyst"
              },
              {
                quote: "Outstanding risk management features. Helped me improve my trading strategy significantly.",
                author: "David Kumar",
                role: "Day Trader"
              }
            ].map((testimonial, index) => (
              <div key={index} className="p-6 bg-white rounded-lg shadow-sm">
                <p className="text-gray-600 mb-4">{testimonial.quote}</p>
                <div className="flex items-center">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-blue-600 font-semibold">
                      {testimonial.author[0]}
                    </span>
                  </div>
                  <div className="ml-3">
                    <p className="font-semibold">{testimonial.author}</p>
                    <p className="text-sm text-gray-600">{testimonial.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  };
  
  export default Testimonials