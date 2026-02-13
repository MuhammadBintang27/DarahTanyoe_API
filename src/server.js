import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRouter from './routes/userRouter.js';
import bloodReqRouter from './routes/bloodReqRouter.js';
import partnerRouter from './routes/partnerRouter.js';
import bloodDonorRouter from './routes/bloodDonorRouter.js';
import notificationRouter from './routes/notificationRouter.js';
import institutionRouter from './routes/institutionRouter.js';
import bloodStockRouter from './routes/bloodStockRouter.js';
import pickupScheduleRouter from './routes/pickupScheduleRouter.js';
import bloodStockHistoryRouter from './routes/bloodStockHistoryRouter.js';
import fulfillmentRouter from './routes/fulfillmentRouter.js';
import campaignRouter from './routes/campaignRouter.js';
import allocationRouter from './routes/allocationRouter.js';
import dashboardRouter from './routes/dashboardRouter.js';
import janjiDonorRouter from './routes/janjiDonorRouter.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// CORS configuration with credentials support
const corsOptions = {
  origin: function (origin, callback) {
    // Get allowed origins from environment variable or use default
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',').map(url => url.trim())
      : ['http://localhost:3000', 'http://localhost:3001'];
      
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow credentials (cookies, authorization headers)
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/users', userRouter);
app.use('/bloodReq', bloodReqRouter);
app.use('/partners', partnerRouter);
app.use('/donor', bloodDonorRouter);
app.use('/notifications', notificationRouter);
app.use('/institutions', institutionRouter);
app.use('/blood-stock', bloodStockRouter);
app.use('/pickup-schedules', pickupScheduleRouter);
app.use('/blood-stock-history', bloodStockHistoryRouter);
app.use('/fulfillment', fulfillmentRouter);
app.use('/campaigns', campaignRouter);
app.use('/allocation', allocationRouter);
app.use('/dashboard', dashboardRouter);
app.use('/janji-donor', janjiDonorRouter);

// Middleware untuk logging request
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.get('/', (req, res) => {
  res.send('Welcome to the DarahTanyoe API');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

export default app;