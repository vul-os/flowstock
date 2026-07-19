import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const NotFoundPage = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
    <p className="text-6xl font-bold text-gray-300">404</p>
    <h1 className="mt-4 text-2xl font-semibold tracking-tight">Page not found</h1>
    <p className="mt-2 max-w-md text-gray-500">
      The page you are looking for doesn&apos;t exist or has moved.
    </p>
    <Button asChild className="mt-6">
      <Link to="/">Go to home</Link>
    </Button>
  </div>
);

export default NotFoundPage;
