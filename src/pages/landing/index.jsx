
import Header from "./header";
import Hero from "./hero";
import Footer from "./footer";

export function LandingPage() {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <Hero />
        <Footer />
      </div>
    );
}

export default LandingPage