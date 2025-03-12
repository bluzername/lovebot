FROM node:18-slim

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install --include=dev

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Expose the port that Render expects
ENV PORT=10000
EXPOSE 10000

# Start the application
CMD ["npm", "start"] 