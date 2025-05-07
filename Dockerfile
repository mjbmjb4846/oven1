FROM electronuserland/builder:latest

# Install dependencies for FPM and cross-compilation
RUN apt-get update && apt-get install -y \
    ruby ruby-dev rubygems build-essential \
    && gem install --no-document fpm \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set up working directory
WORKDIR /app

# Install Node.js dependencies when the package.json changes
COPY package.json /app/
RUN npm install

# Copy the rest of the application
COPY . /app/

# Make the build script executable
RUN chmod +x ./scripts/build-linux.sh

# Default command when the container starts
ENTRYPOINT ["./scripts/build-linux.sh"]
CMD ["all"]