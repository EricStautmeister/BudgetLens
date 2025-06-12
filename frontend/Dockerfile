# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Accept build arguments
# ARG VITE_API_URL

# Copy package files
COPY package*.json ./
RUN npm i --package-lock-only
RUN npm ci

# Copy source code
COPY . .

# Set environment variable from build arg
# ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Runtime stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port
EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]