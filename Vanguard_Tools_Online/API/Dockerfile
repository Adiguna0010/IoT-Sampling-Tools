FROM node:18-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Hugging Face Spaces exposes port 7860 by default
EXPOSE 7860

# Set environment variables for production
ENV PORT=7860
ENV NODE_ENV=production

# Run the app
CMD ["node", "server_mirna.js"]
