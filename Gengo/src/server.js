const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = [
            'https://gengo-production.up.railway.app',
            ...(!isProduction ? ['http://localhost:9000', 'http://localhost:3000'] : [])
        ];
        
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    optionsSuccessStatus: 200
};