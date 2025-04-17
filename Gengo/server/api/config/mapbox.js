export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Check if the token exists in environment variables
        const token = process.env.MAPBOX_TOKEN;
        if (!token) {
            throw new Error('Mapbox token not configured');
        }

        // Return the token
        return res.status(200).json({ token });
    } catch (error) {
        console.error('Config Error:', error);
        return res.status(500).json({ error: 'Failed to get Mapbox configuration' });
    }
} 