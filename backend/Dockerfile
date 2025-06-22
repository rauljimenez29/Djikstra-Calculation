# Use the official PHP image with Apache
FROM php:8.2-apache

# Install system dependencies and PHP extensions
RUN docker-php-ext-install mysqli

# Enable Apache mod_rewrite (optional, but good for modern PHP apps)
RUN a2enmod rewrite

# Copy your PHP code into the container
COPY . /var/www/html/

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader

# Expose port 80
EXPOSE 80 