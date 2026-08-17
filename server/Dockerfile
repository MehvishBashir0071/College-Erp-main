FROM node:20-slim

# Install OpenSSL for Prisma engine compatibility in Debian-slim
RUN apt-get update -y && apt-get install -y openssl

# Set the working directory inside the container
WORKDIR /app

# Copy dependency definition files
COPY package*.json ./

# Install backend dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Generate the Prisma client code specifically for the container environment
RUN npx prisma generate

# Expose the API port
EXPOSE 5001

# Boot up the server
CMD ["npm", "start"]
