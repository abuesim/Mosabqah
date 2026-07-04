# Use official Node.js runtime as parent image
FROM node:20

# Create and set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy database initialization and logic
COPY database.js ./
COPY server.js ./
COPY .env ./

# Copy public static files
COPY public/ ./public/

# Expose port
EXPOSE 3000

# Run the app
CMD [ "npm", "start" ]
