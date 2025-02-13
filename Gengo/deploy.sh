#!/bin/bash

# Update system
sudo apt update
sudo apt upgrade -y

# Install Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install Certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Create Nginx configuration
sudo bash -c 'cat > /etc/nginx/sites-available/gengo.live' << 'EOL'
server {
    listen 80;
    server_name gengo.live www.gengo.live;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name gengo.live www.gengo.live;

    ssl_certificate /etc/letsencrypt/live/gengo.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/gengo.live/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Cache static assets
    location /assets {
        expires 1y;
        add_header Cache-Control "public, no-transform";
    }
}
EOL

# Enable the site
sudo ln -s /etc/nginx/sites-available/gengo.live /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Install PM2
sudo npm install -g pm2

# Build and start the application
cd /path/to/your/app
npm install
npm run build
pm2 start src/server.js --name "gengo"
pm2 save
pm2 startup

# Get SSL certificate
sudo certbot --nginx -d gengo.live -d www.gengo.live

# Restart Nginx
sudo systemctl restart nginx