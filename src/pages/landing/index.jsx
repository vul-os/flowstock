
import Header from "./header";
import Hero from "./hero";
import CTA from "./cta";
import Features from "./features";
import Footer from "./footer";

export function LandingPage() {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <Hero />
        <Features />
        <CTA />
        <Footer />
      </div>
    );
}

export default LandingPage