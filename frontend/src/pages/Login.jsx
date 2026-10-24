import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLoginMutation } from '../api/auth.js';
import { useAuth } from '../lib/auth.jsx';
import { loginSchema } from '../lib/schemas.js';
import { getApiError } from '../lib/utils.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card.jsx';

const roleHome = {
  admin: '/',
  support_lead: '/',
  support_agent: '/',
  technician: '/technicians',
  buyer: '/marketplace',
};

export default function Login() {
  useDocumentTitle('Sign in');
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const loginMutation = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (isAuthenticated) {
    const home = roleHome[user?.role] || '/';
    return <Navigate to={home} replace />;
  }

  const onSubmit = (values) => {
    loginMutation.mutate(values, {
      onSuccess: (data) => {
        toast.success('Welcome back');
        navigate(roleHome[data.user.role] || '/');
      },
      onError: (err) => {
        const e = getApiError(err);
        toast.error(e.message || 'Login failed');
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to NexusHub</CardTitle>
          <CardDescription>ISP operations &amp; support portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" {...register('email')} />
              {errors.email ? (
                <p className="text-xs text-red-600">{errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password ? (
                <p className="text-xs text-red-600">{errors.password.message}</p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-slate-500">
            Demo: admin@nexushub.test / Password@123
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
