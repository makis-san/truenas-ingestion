# Use a Node-based Debian image
FROM node:20-bullseye

# Set the working directory
WORKDIR /app

# Install necessary Linux utilities including build-essential, libudev-dev, and udevadm
RUN apt-get update && \
    apt-get install -y build-essential libudev-dev python3 util-linux hdparm smartmontools \
    git pkg-config libusb-1.0-0 libusb-1.0-0-dev usbutils udev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy the application code into the container
COPY . .

# Remove any pre-existing node_modules to avoid conflicts
RUN rm -rf node_modules

# Install Node.js dependencies
RUN npm install && npm rebuild

# Build the application
RUN npm run build

# Expose port 3000 for the application
EXPOSE 3000

# Set the entry point for the application
ENTRYPOINT ["node", "build/index.js"]
