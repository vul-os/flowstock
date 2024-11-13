import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '@/context/use-auth';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";
import { useAuthRedirect } from './auth-redirect';

const SignIn = () => {
  const { signIn, signInWithGoogle } = useContext(AuthContext);
  const handleSuccessfulAuth = useAuthRedirect();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await signIn(email, password);
      handleSuccessfulAuth();
    } catch (error) {
      console.error('Sign in error:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setIsLoading(true);
    try {
      await signInWithGoogle();
      handleSuccessfulAuth();
    } catch (error) {
      console.error('Google sign in error:', error);
      setError(error.message);
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="flex items-center justify-center min-h-screen bg-cover bg-center bg-no-repeat relative"
    >
      <Card className="w-full max-w-md bg-white shadow-xl border-0 relative z-10">
        <CardHeader className="space-y-1 bg-gradient-to-r from-blue-50 to-blue-100 rounded-t-lg pb-8">
          <CardTitle className="text-3xl font-bold text-center text-blue-800">
            Welcome Back
          </CardTitle>
          <p className="text-center text-blue-600 text-sm">Sign in to your account</p>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {error && (
            <Alert variant="destructive" className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-800">{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                required
                className="border-gray-200 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">Password</label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
                className="border-gray-200 focus:border-blue-400 focus:ring-blue-400"
              />
            </div>
            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-md"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

        </CardContent>
        <CardFooter className="flex flex-col space-y-2 bg-gradient-to-r from-blue-50 to-blue-100 rounded-b-lg p-6">
          <Button 
            variant="link" 
            className="text-sm text-blue-600 hover:text-blue-700"
            onClick={() => navigate('/password-reset')}
            disabled={isLoading}
          >
            Forgot your password?
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default SignIn;