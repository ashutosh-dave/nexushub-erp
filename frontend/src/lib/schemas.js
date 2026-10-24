import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'At least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm your password'),
    segment: z.enum(['B2C', 'B2B']),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const subscriberSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  type: z.enum(['B2C', 'B2B']),
  email: z.string().email(),
  phone: z.string().min(5),
  address: z.string().min(1),
  company_name: z.string().optional().nullable(),
});

export const connectionSchema = z.object({
  subscriber_id: z.coerce.number().int().positive(),
  plan_id: z.coerce.number().int().positive(),
  pop_id: z.coerce.number().int().positive(),
  billing_cycle_start: z.string().min(1),
});

export const connectionPatchSchema = z.object({
  pop_id: z.coerce.number().int().positive().optional(),
  static_ip: z
    .string()
    .regex(/^(\d{1,3}\.){3}\d{1,3}$/, 'Invalid IPv4')
    .optional()
    .or(z.literal('')),
  plan_id: z.coerce.number().int().positive().optional(),
});

export const connectionStatusSchema = z.object({
  status: z.enum(['Pending', 'Active', 'Suspended', 'Terminated']),
});

export const ticketCreateSchema = z.object({
  connection_id: z.coerce.number().int().positive(),
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
});

export const taskCreateSchema = z.object({
  title: z.string().min(1),
  task_type: z.enum([
    'Feeder Line Audit',
    'ONU Configuration',
    'Splicing',
    'Fiber Repair',
    'Router Replacement',
    'Other',
  ]),
  description: z.string().optional(),
});

export const assignTaskSchema = z
  .object({
    technician_id: z.coerce.number().int().positive().nullable().optional(),
    window_start: z.string().min(1, 'Start required'),
    window_end: z.string().min(1, 'End required'),
  })
  .refine(
    (v) => new Date(v.window_end) > new Date(v.window_start),
    { message: 'End must be after start', path: ['window_end'] }
  );
