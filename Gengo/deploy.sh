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

# Stop Nginx temporarily
sudo systemctl stop nginx

# Create initial Nginx configuration without SSL
sudo bash -c 'cat > /etc/nginx/sites-available/gengo.live' << 'EOL'
server {
    listen 80;
    server_name gengo.live www.gengo.live;

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
}
EOL

# Enable the site
sudo ln -sf /etc/nginx/sites-available/gengo.live /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Install PM2 globally
sudo npm install -g pm2

# Set correct permissions and ownership
sudo chown -R bitnami:bitnami /opt/bitnami/node/lib/node_modules
sudo chmod -R 755 /opt/bitnami/node/lib/node_modules

# Navigate to app directory (update this path)
cd /home/bitnami/gengo

# Install dependencies and build
npm install
npm run build

# Start/Restart the application with PM2
pm2 delete gengo 2>/dev/null || true
pm2 start src/server.js --name "gengo"
pm2 save

# Setup PM2 startup script
sudo env PATH=$PATH:/opt/bitnami/node/bin /opt/bitnami/node/lib/node_modules/pm2/bin/pm2 startup systemd -u bitnami --hp /home/bitnami

# Start Nginx
sudo systemctl start nginx

# Get SSL certificate
sudo certbot --nginx -d gengo.live -d www.gengo.live --non-interactive --agree-tos --email vishnuxd21@gmail.com

# Final Nginx restart
sudo systemctl restart nginx

echo "Deployment completed!"