FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# Install frontend dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the Vite dev server port
EXPOSE 3000

# Start Vite with --host flag so it binds to 0.0.0.0 to receive traffic outside the container
CMD ["npm", "start", "--", "--host"]
