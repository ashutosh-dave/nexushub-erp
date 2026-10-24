import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useLoginMutation, useRegisterMutation } from '../api/auth.js';
import { useAuth } from '../lib/auth.jsx';
import { loginSchema, registerSchema } from '../lib/schemas.js';
import { getApiError } from '../lib/utils.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';
import { Label } from '../components/ui/Label.jsx';
import { Select } from '../components/ui/Select.jsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/Card.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs.jsx';

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
  const [mode, setMode] = useState('signin');
  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();

  const loginForm = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const registerForm = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      segment: 'B2C',
    },
  });

  if (isAuthenticated) {
    const home = roleHome[user?.role] || '/';
    return <Navigate to={home} replace />;
  }

  const onLogin = (values) => {
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

  const onRegister = (values) => {
    const { confirmPassword: _c, ...body } = values;
    registerMutation.mutate(body, {
      onSuccess: (data) => {
        toast.success('Account created');
        navigate(roleHome[data.user.role] || '/marketplace');
      },
      onError: (err) => {
        const e = getApiError(err);
        toast.error(e.message || 'Sign up failed');
      },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>NexusHub</CardTitle>
          <CardDescription>ISP operations &amp; marketplace portal</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={mode} onValueChange={setMode} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Sign up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form className="space-y-4" onSubmit={loginForm.handleSubmit(onLogin)}>
                <div className="space-y-1">
                  <Label htmlFor="login-email">Email</Label>
                  <Input
                    id="login-email"
                    type="email"
                    autoComplete="username"
                    {...loginForm.register('email')}
                  />
                  {loginForm.formState.errors.email ? (
                    <p className="text-xs text-red-600">{loginForm.formState.errors.email.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    {...loginForm.register('password')}
                  />
                  {loginForm.formState.errors.password ? (
                    <p className="text-xs text-red-600">{loginForm.formState.errors.password.message}</p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form className="space-y-4" onSubmit={registerForm.handleSubmit(onRegister)}>
                <div className="space-y-1">
                  <Label htmlFor="reg-name">Name</Label>
                  <Input id="reg-name" autoComplete="name" {...registerForm.register('name')} />
                  {registerForm.formState.errors.name ? (
                    <p className="text-xs text-red-600">{registerForm.formState.errors.name.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input
                    id="reg-email"
                    type="email"
                    autoComplete="email"
                    {...registerForm.register('email')}
                  />
                  {registerForm.formState.errors.email ? (
                    <p className="text-xs text-red-600">{registerForm.formState.errors.email.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-segment">Segment</Label>
                  <Select id="reg-segment" {...registerForm.register('segment')}>
                    <option value="B2C">B2C — home / consumer</option>
                    <option value="B2B">B2B — business</option>
                  </Select>
                  {registerForm.formState.errors.segment ? (
                    <p className="text-xs text-red-600">{registerForm.formState.errors.segment.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-password">Password</Label>
                  <Input
                    id="reg-password"
                    type="password"
                    autoComplete="new-password"
                    {...registerForm.register('password')}
                  />
                  {registerForm.formState.errors.password ? (
                    <p className="text-xs text-red-600">{registerForm.formState.errors.password.message}</p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="reg-confirm">Confirm password</Label>
                  <Input
                    id="reg-confirm"
                    type="password"
                    autoComplete="new-password"
                    {...registerForm.register('confirmPassword')}
                  />
                  {registerForm.formState.errors.confirmPassword ? (
                    <p className="text-xs text-red-600">
                      {registerForm.formState.errors.confirmPassword.message}
                    </p>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500">
                  Creates a buyer account with an Active starter connection so you can use Marketplace
                  right away. Staff roles are seed-only.
                </p>
                <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                  {registerMutation.isPending ? 'Creating account…' : 'Create account'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-5 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-800">Try a role (password: Password@123)</p>
            <ul className="space-y-1">
              <li>
                <span className="font-mono">admin@nexushub.test</span> — ops dashboard + dispatch
              </li>
              <li>
                <span className="font-mono">lead@nexushub.test</span> — assign field work
              </li>
              <li>
                <span className="font-mono">agent@nexushub.test</span> — log tickets
              </li>
              <li>
                <span className="font-mono">tech1@nexushub.test</span> — my field tasks
              </li>
              <li>
                <span className="font-mono">buyer@nexushub.test</span> — browse &amp; change plans
              </li>
            </ul>
            <p className="text-slate-500">Or Sign up for your own buyer account.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
