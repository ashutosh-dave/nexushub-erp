import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { registerRoutes } from './registerRoutes.js';

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin.split(',').map((s) => s.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/', (req, res) => {
  res.json({ data: { name: 'NexusHub ERP API', version: '1.0.0' } });
});

registerRoutes(app);

app.use(notFound);
app.use(errorHandler);

export default app;
